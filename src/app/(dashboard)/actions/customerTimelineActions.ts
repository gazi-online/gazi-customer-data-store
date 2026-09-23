"use server";

import { createClient } from "@/lib/supabase/server";

export type CustomerTimelineEventType =
  | "customer_created"
  | "document_uploaded"
  | "document_archived"
  | "service_request_created"
  | "service_request_status"
  | "invoice_created"
  | "payment_received"
  | "communication_logged"
  | "followup_scheduled"
  | "followup_completed";

export interface CustomerTimelineEvent {
  id: string;
  eventType: CustomerTimelineEventType;
  timestamp: string; // ISO 8601
  title: string;
  description: string;
  badge?: {
    label: string;
    variant: "default" | "success" | "warning" | "danger" | "info" | "purple";
  };
  metadata?: {
    linkUrl?: string;
    amount?: number;
    reference?: string;
    subtext?: string;
  };
}

export interface CustomerTimelineResult {
  events: CustomerTimelineEvent[];
  totalCount: number;
  stats: {
    documents: number;
    requests: number;
    invoices: number;
    payments: number;
    communications: number;
    followups: number;
  };
}

const isValidUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Authoritatively compiles a unified chronological activity timeline for a customer
 * from existing records:
 * 1. Customer registration
 * 2. Uploaded / archived customer documents
 * 3. Service requests and status changes
 * 4. Invoices issued
 * 5. Payments recorded
 * 6. Customer communications / follow-ups logged
 *
 * PRIVACY & AUTHORITY:
 * - Read-only aggregation. Zero schema changes.
 * - Masks sensitive fields; never returns Aadhaar/PAN or signed URLs in timeline items.
 * - Deterministic descending sort by ISO timestamp.
 */
export async function getCustomerUnifiedTimeline(
  customerId: string
): Promise<CustomerTimelineResult> {
  if (!isValidUuid(customerId)) {
    return {
      events: [],
      totalCount: 0,
      stats: { documents: 0, requests: 0, invoices: 0, payments: 0, communications: 0, followups: 0 },
    };
  }

  const supabase = await createClient();

  // Run all authoritative reads concurrently for low latency
  const [
    custRes,
    docsRes,
    srvRes,
    invRes,
    payRes,
    commRes,
  ] = await Promise.all([
    // 1. Customer Profile
    supabase
      .from("customers")
      .select("id, customer_code, first_name, last_name, created_at")
      .eq("id", customerId)
      .single(),

    // 2. Documents
    supabase
      .from("customer_documents")
      .select("id, document_type, document_name, created_at, uploaded_at, status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),

    // 3. Service Requests & status history & follow-ups
    supabase
      .from("customer_services")
      .select(`
        id,
        request_number,
        application_reference,
        status,
        created_at,
        service:services(service_name),
        status_history:service_request_status_history(id, from_status, to_status, created_at),
        followups:service_request_followups(id, follow_up_at, note, status, resolution_note, completed_at, created_at)
      `)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),

    // 4. Invoices
    supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, due_amount, status, invoice_date, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),

    // 5. Payments
    supabase
      .from("payments")
      .select("id, payment_number, amount, payment_mode, reference_number, payment_date, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),

    // 6. Communications
    supabase
      .from("customer_communications")
      .select("id, channel, direction, outcome, notes, communicated_at, created_at")
      .eq("customer_id", customerId)
      .order("communicated_at", { ascending: false }),
  ]);

  const events: CustomerTimelineEvent[] = [];

  // 1. Registration event
  if (custRes.data) {
    const cust = custRes.data;
    events.push({
      id: `cust-reg-${cust.id}`,
      eventType: "customer_created",
      timestamp: cust.created_at,
      title: "Customer Profile Registered",
      description: `Customer account registered in GCDS${
        cust.customer_code ? ` (Code: #${cust.customer_code})` : ""
      }.`,
      badge: { label: "Profile", variant: "info" },
      metadata: { reference: cust.customer_code || undefined },
    });
  }

  // 2. Documents events
  const docs = docsRes.data || [];
  for (const doc of docs) {
    const isArchived = doc.status === "archived";
    events.push({
      id: `doc-${doc.id}`,
      eventType: isArchived ? "document_archived" : "document_uploaded",
      timestamp: doc.uploaded_at || doc.created_at,
      title: isArchived ? "Document Archived" : "Document Added to Vault",
      description: doc.document_name || doc.document_type || "Customer Document",
      badge: isArchived
        ? { label: "Archived", variant: "warning" }
        : { label: "Document", variant: "default" },
      metadata: {
        linkUrl: `/customers/${customerId}?tab=documents`,
        subtext: doc.document_type || undefined,
      },
    });
  }

  // 3. Service requests & status history
  const services = srvRes.data || [];
  for (const srv of services) {
    const srvName = (srv.service as { service_name?: string } | null)?.service_name || "Service";
    const reqNum = srv.request_number ? `#${srv.request_number}` : "";

    // Creation event
    events.push({
      id: `srv-${srv.id}`,
      eventType: "service_request_created",
      timestamp: srv.created_at,
      title: `Service Request Initiated ${reqNum}`.trim(),
      description: `${srvName}${
        srv.application_reference ? ` • Ref: ${srv.application_reference}` : ""
      }`,
      badge: {
        label: srv.status ? String(srv.status).toUpperCase() : "REQUEST",
        variant: srv.status === "completed" ? "success" : "purple",
      },
      metadata: {
        linkUrl: `/requests/${srv.id}`,
        reference: srv.application_reference || undefined,
      },
    });

    // Detailed status transition history
    const history = (srv.status_history as Array<{
      id: string;
      from_status: string | null;
      to_status: string;
      created_at: string;
    }>) || [];

    for (const h of history) {
      // Don't duplicate initial status creation if within 1 second of created_at
      const timeDiff = Math.abs(
        new Date(h.created_at).getTime() - new Date(srv.created_at).getTime()
      );
      if (!h.from_status && timeDiff < 2000) {
        continue;
      }

      events.push({
        id: `srv-hist-${h.id}`,
        eventType: "service_request_status",
        timestamp: h.created_at,
        title: `Request ${reqNum || srvName}: Status Updated`,
        description: `Status changed ${
          h.from_status ? `from ${h.from_status.toUpperCase()} ` : ""
        }to ${h.to_status.toUpperCase()}`,
        badge: {
          label: h.to_status.toUpperCase(),
          variant: h.to_status === "completed" ? "success" : "purple",
        },
        metadata: {
          linkUrl: `/requests/${srv.id}`,
        },
      });
    }

    // Follow-ups on this service request
    const followups = (srv.followups as Array<{
      id: string;
      follow_up_at: string;
      note: string | null;
      status: string;
      resolution_note: string | null;
      completed_at: string | null;
      created_at: string;
    }>) || [];

    for (const f of followups) {
      // 1. Follow-up scheduled event
      events.push({
        id: `fu-sched-${f.id}`,
        eventType: "followup_scheduled",
        timestamp: f.created_at,
        title: `Follow-up Scheduled: ${srvName}`,
        description: f.note || `Follow-up set for ${new Date(f.follow_up_at).toLocaleDateString("en-IN")}`,
        badge: {
          label: f.status === "open" ? "PENDING" : f.status.toUpperCase(),
          variant: f.status === "completed" ? "success" : f.status === "open" ? "warning" : "default",
        },
        metadata: {
          linkUrl: `/customers/${customerId}?tab=followups`,
          reference: reqNum || undefined,
          subtext: `Due: ${new Date(f.follow_up_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        },
      });

      // 2. Follow-up completed event (if completed)
      if (f.status === "completed" && f.completed_at) {
        events.push({
          id: `fu-done-${f.id}`,
          eventType: "followup_completed",
          timestamp: f.completed_at,
          title: `Follow-up Completed: ${srvName}`,
          description: f.resolution_note || f.note || "Follow-up resolved successfully.",
          badge: {
            label: "COMPLETED",
            variant: "success",
          },
          metadata: {
            linkUrl: `/customers/${customerId}?tab=followups`,
            reference: reqNum || undefined,
          },
        });
      }
    }
  }

  // 4. Invoices
  const invoices = invRes.data || [];
  for (const inv of invoices) {
    const isPaid = inv.status === "paid";
    events.push({
      id: `inv-${inv.id}`,
      eventType: "invoice_created",
      timestamp: inv.created_at || inv.invoice_date,
      title: `Invoice Generated #${inv.invoice_number}`,
      description: `Billed: ₹${Number(inv.total_amount).toFixed(2)}${
        Number(inv.due_amount) > 0 ? ` (Due: ₹${Number(inv.due_amount).toFixed(2)})` : " (Paid)"
      }`,
      badge: {
        label: String(inv.status).toUpperCase(),
        variant: isPaid ? "success" : Number(inv.due_amount) > 0 ? "warning" : "default",
      },
      metadata: {
        linkUrl: `/invoices/${inv.id}`,
        amount: Number(inv.total_amount),
        reference: inv.invoice_number,
      },
    });
  }

  // 5. Payments
  const payments = payRes.data || [];
  for (const pay of payments) {
    events.push({
      id: `pay-${pay.id}`,
      eventType: "payment_received",
      timestamp: pay.created_at || pay.payment_date,
      title: `Payment Received: ₹${Number(pay.amount).toFixed(2)}`,
      description: `Mode: ${String(pay.payment_mode || "Cash").toUpperCase()}${
        pay.payment_number ? ` • Pay #${pay.payment_number}` : ""
      }${pay.reference_number ? ` • Ref: ${pay.reference_number}` : ""}`,
      badge: { label: "PAID", variant: "success" },
      metadata: {
        amount: Number(pay.amount),
        reference: pay.payment_number || undefined,
      },
    });
  }

  // 6. Communications
  const communications = commRes.data || [];
  for (const comm of communications) {
    const channelLabel =
      comm.channel === "whatsapp"
        ? "WhatsApp"
        : comm.channel === "phone"
        ? "Phone Call"
        : comm.channel === "in_person"
        ? "In-Person"
        : comm.channel === "sms"
        ? "SMS"
        : String(comm.channel || "Contact");

    events.push({
      id: `comm-${comm.id}`,
      eventType: "communication_logged",
      timestamp: comm.communicated_at || comm.created_at,
      title: `${channelLabel} (${String(comm.direction || "outbound").toUpperCase()})`,
      description: comm.notes || `Outcome: ${comm.outcome || "contacted"}`,
      badge: {
        label: channelLabel,
        variant: comm.channel === "whatsapp" ? "success" : "info",
      },
      metadata: {
        subtext: comm.outcome || undefined,
      },
    });
  }

  // Deterministic chronological ordering: newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const followupsCount = events.filter(
    (e) => e.eventType === "followup_scheduled" || e.eventType === "followup_completed"
  ).length;

  return {
    events,
    totalCount: events.length,
    stats: {
      documents: docs.length,
      requests: services.length,
      invoices: invoices.length,
      payments: payments.length,
      communications: communications.length,
      followups: followupsCount,
    },
  };
}
