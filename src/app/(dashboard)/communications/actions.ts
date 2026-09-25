"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getDueTodayFollowups,
  getOverdueFollowups,
  getUpcomingFollowups,
} from "@/lib/operations/operationsQueryLayer";
import {
  ContactQueueItem,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationOutcome,
} from "@/lib/communications/communicationEngine";
import { getKolkataDateString, getKolkataFutureDateString } from "@/lib/operations/dateUtils";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export interface RecordCommunicationPayload {
  customerId: string;
  customerServiceId?: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  templateKey?: string | null;
  messageSnapshot?: string | null;
  outcome: CommunicationOutcome;
  notes?: string | null;
}

export async function getShopBusinessName(): Promise<string> {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data } = await supabase
    .from("business_settings")
    .select("business_name")
    .limit(1)
    .single();

  return data?.business_name || "Gazi Cyber Data Store";
}

export async function getContactQueue(): Promise<ContactQueueItem[]> {
  const supabase = await createClient();
  await requireAal2(supabase);
  const items: ContactQueueItem[] = [];

  // Compute date strings locally (no DB call — safe to do before parallelizing)
  const todayStr = getKolkataDateString(new Date());
  const in30DaysStr = getKolkataFutureDateString(30);

  // All 6 queries are fully independent — parallelize for reduced latency
  const [
    { items: overdueFollowups },
    { items: todayFollowups },
    { items: upcomingFollowups },
    { data: actionRequests },
    { data: expiredDocs },
    { data: expiringDocs },
  ] = await Promise.all([
    // 1. Overdue follow-ups
    getOverdueFollowups(),
    // 2. Due Today follow-ups
    getDueTodayFollowups(),
    // 3. Upcoming follow-ups
    getUpcomingFollowups(),
    // 4. Action-required service requests
    supabase
      .from("customer_services")
      .select(`
        id,
        request_number,
        status,
        due_date,
        customer:customers(id, first_name, middle_name, last_name, phone),
        service:services(service_name)
      `)
      .eq("status", "action_required")
      .limit(25),
    // 5. Expired documents
    supabase
      .from("customer_documents")
      .select(`
        id,
        document_name,
        document_number,
        expiry_date,
        customer:customers(id, first_name, middle_name, last_name, phone)
      `)
      .eq("archived", false)
      .not("expiry_date", "is", null)
      .lt("expiry_date", todayStr)
      .limit(25),
    // 6. Documents expiring soon (within next 30 days)
    supabase
      .from("customer_documents")
      .select(`
        id,
        document_name,
        document_number,
        expiry_date,
        customer:customers(id, first_name, middle_name, last_name, phone)
      `)
      .eq("archived", false)
      .not("expiry_date", "is", null)
      .gte("expiry_date", todayStr)
      .lte("expiry_date", in30DaysStr)
      .limit(25),
  ]);

  // 1. Overdue follow-ups
  for (const f of overdueFollowups) {
    const cust = f.customerService?.customer;
    if (!cust) continue;
    const customerName = [cust.firstName, cust.middleName, cust.lastName].filter(Boolean).join(" ");
    items.push({
      id: `fu-overdue-${f.id}`,
      type: "followup_overdue",
      priority: "urgent",
      customerId: cust.id,
      customerName,
      customerPhone: cust.phone,
      requestId: f.customerService?.id || null,
      requestNumber: f.customerService?.requestNumber || null,
      serviceName: f.customerService?.service?.serviceName || "Service",
      documentId: null,
      documentName: null,
      reason: "Follow-up is overdue",
      dueDate: f.followUpAt,
      recommendedTemplate: "followup_reminder",
    });
  }

  // 2. Due Today follow-ups
  for (const f of todayFollowups) {
    const cust = f.customerService?.customer;
    if (!cust) continue;
    const customerName = [cust.firstName, cust.middleName, cust.lastName].filter(Boolean).join(" ");
    items.push({
      id: `fu-today-${f.id}`,
      type: "followup_today",
      priority: "high",
      customerId: cust.id,
      customerName,
      customerPhone: cust.phone,
      requestId: f.customerService?.id || null,
      requestNumber: f.customerService?.requestNumber || null,
      serviceName: f.customerService?.service?.serviceName || "Service",
      documentId: null,
      documentName: null,
      reason: "Follow-up scheduled for today",
      dueDate: f.followUpAt,
      recommendedTemplate: "followup_reminder",
    });
  }

  // 3. Upcoming follow-ups
  for (const f of upcomingFollowups) {
    const cust = f.customerService?.customer;
    if (!cust) continue;
    const customerName = [cust.firstName, cust.middleName, cust.lastName].filter(Boolean).join(" ");
    items.push({
      id: `fu-upcoming-${f.id}`,
      type: "followup_upcoming",
      priority: "normal",
      customerId: cust.id,
      customerName,
      customerPhone: cust.phone,
      requestId: f.customerService?.id || null,
      requestNumber: f.customerService?.requestNumber || null,
      serviceName: f.customerService?.service?.serviceName || "Service",
      documentId: null,
      documentName: null,
      reason: "Follow-up coming up soon",
      dueDate: f.followUpAt,
      recommendedTemplate: "followup_reminder",
    });
  }

  // 4. Action-required service requests
  if (actionRequests) {
    for (const r of actionRequests) {
      const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
      const srv = Array.isArray(r.service) ? r.service[0] : r.service;
      if (!cust) continue;
      const customerName = [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ");
      items.push({
        id: `req-action-${r.id}`,
        type: "request_action",
        priority: "high",
        customerId: cust.id,
        customerName,
        customerPhone: cust.phone,
        requestId: r.id,
        requestNumber: r.request_number,
        serviceName: srv?.service_name || "Service",
        documentId: null,
        documentName: null,
        reason: "Customer action required on service request",
        dueDate: r.due_date,
        recommendedTemplate: "docs_required",
      });
    }
  }

  // 5. Expired documents
  if (expiredDocs) {
    for (const d of expiredDocs) {
      const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
      if (!cust) continue;
      const customerName = [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ");
      items.push({
        id: `doc-expired-${d.id}`,
        type: "doc_expired",
        priority: "high",
        customerId: cust.id,
        customerName,
        customerPhone: cust.phone,
        requestId: null,
        requestNumber: null,
        serviceName: null,
        documentId: d.id,
        documentName: d.document_name,
        reason: "Document has expired",
        dueDate: d.expiry_date,
        recommendedTemplate: "doc_expired",
      });
    }
  }

  // 6. Documents expiring soon (within next 30 days)
  if (expiringDocs) {
    for (const d of expiringDocs) {
      const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
      if (!cust) continue;
      const customerName = [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ");
      items.push({
        id: `doc-expiring-${d.id}`,
        type: "doc_expiring",
        priority: "normal",
        customerId: cust.id,
        customerName,
        customerPhone: cust.phone,
        requestId: null,
        requestNumber: null,
        serviceName: null,
        documentId: d.id,
        documentName: d.document_name,
        reason: "Document expiring within 30 days",
        dueDate: d.expiry_date,
        recommendedTemplate: "doc_renewal_reminder",
      });
    }
  }

  return items;
}

export async function recordCommunication(payload: RecordCommunicationPayload) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    throw new Error("Authentication required");
  }

  if (!payload.customerId) {
    throw new Error("customerId is required");
  }

  const { data, error } = await supabase
    .from("customer_communications")
    .insert({
      customer_id: payload.customerId,
      customer_service_id: payload.customerServiceId || null,
      channel: payload.channel,
      direction: payload.direction,
      template_key: payload.templateKey || null,
      message_snapshot: payload.messageSnapshot ? payload.messageSnapshot.slice(0, 500) : null,
      outcome: payload.outcome,
      notes: payload.notes || null,
      created_by: userData.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[recordCommunication] DB error code:", error.code);
    throw new Error("Failed to record communication.");
  }

  revalidatePath("/communications");
  revalidatePath(`/customers/${payload.customerId}`);
  revalidatePath("/dashboard");
  revalidatePath("/operations");
  if (payload.customerServiceId) {
    revalidatePath(`/requests/${payload.customerServiceId}`);
  }

  return data;
}

export async function getCustomerCommunications(customerId: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase
    .from("customer_communications")
    .select("*")
    .eq("customer_id", customerId)
    .order("communicated_at", { ascending: false });

  if (error) {
    console.error("Error fetching customer communications:", error);
    return [];
  }
  return data || [];
}

export async function getRequestCommunications(requestId: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase
    .from("customer_communications")
    .select("*")
    .eq("customer_service_id", requestId)
    .order("communicated_at", { ascending: false });

  if (error) {
    console.error("Error fetching request communications:", error);
    return [];
  }
  return data || [];
}
