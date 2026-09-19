/**
 * ==============================================================================
 * GCDS Phase 2F: Operations Inbox Query Layer
 * File: src/lib/operations/operationsInboxQuery.ts
 * ==============================================================================
 */

import { createClient } from "@/lib/supabase/server";
import {
  getDueTodayFollowups,
  getOverdueFollowups,
} from "./operationsQueryLayer";
import { getKolkataDateString, getKolkataFutureDateString } from "./dateUtils";

export type AlertSeverity = 'urgent' | 'high' | 'normal';
export type AlertCategory = 'followup' | 'document' | 'request' | 'billing';

export interface OperationAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  targetUrl: string;
  targetLabel: string;
  customerName?: string;
  customerId?: string;
  dueDate?: string | null;
  createdAt?: string;
}

export interface OperationsInboxSummary {
  alerts: OperationAlert[];
  counts: {
    total: number;
    urgent: number;
    high: number;
    normal: number;
    followups: number;
    documents: number;
    requests: number;
    billing: number;
  };
}

export async function getOperationsInboxAlerts(): Promise<OperationsInboxSummary> {
  const supabase = await createClient();
  const alerts: OperationAlert[] = [];

  const todayStr = getKolkataDateString(new Date());
  const in30DaysStr = getKolkataFutureDateString(30);

  // All 7 alert queries are completely independent — run in parallel for reduced latency
  const [
    { items: overdueFollowups },
    { items: todayFollowups },
    { data: actionRequests },
    { data: expiredDocs },
    { data: expiringDocs },
    { data: overdueInvoices },
    { data: unverifiedDocs },
  ] = await Promise.all([
    // 1. Overdue follow-ups (Urgent)
    getOverdueFollowups(),
    // 2. Follow-ups Due Today (High)
    getDueTodayFollowups(),
    // 3. Requests with status = 'action_required' (High)
    supabase
      .from("customer_services")
      .select(`
        id,
        request_number,
        due_date,
        customer:customers(id, first_name, middle_name, last_name),
        service:services(service_name)
      `)
      .eq("status", "action_required")
      .limit(25),
    // 4. Expired Documents (High)
    supabase
      .from("customer_documents")
      .select(`
        id,
        document_name,
        expiry_date,
        customer:customers(id, first_name, middle_name, last_name)
      `)
      .eq("archived", false)
      .not("expiry_date", "is", null)
      .lt("expiry_date", todayStr)
      .limit(25),
    // 5. Documents Expiring Soon (Normal)
    supabase
      .from("customer_documents")
      .select(`
        id,
        document_name,
        expiry_date,
        customer:customers(id, first_name, middle_name, last_name)
      `)
      .eq("archived", false)
      .not("expiry_date", "is", null)
      .gte("expiry_date", todayStr)
      .lte("expiry_date", in30DaysStr)
      .limit(25),
    // 6. Overdue Invoices (High)
    supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        due_date,
        total_amount,
        due_amount,
        customer:customers(id, first_name, middle_name, last_name)
      `)
      .in("status", ["issued", "partially_paid"])
      .not("due_date", "is", null)
      .lt("due_date", todayStr)
      .limit(25),
    // 7. Pending Document Verifications on active requests (Normal)
    supabase
      .from("service_request_documents")
      .select(`
        id,
        requirement_tag,
        request:customer_services!inner(
          id,
          request_number,
          status,
          customer:customers(id, first_name, middle_name, last_name)
        )
      `)
      .eq("is_verified", false)
      .limit(20),
  ]);

  // 1. Overdue follow-ups (Urgent)
  for (const f of overdueFollowups) {
    const cust = f.customerService?.customer;
    const custName = cust
      ? [cust.firstName, cust.middleName, cust.lastName].filter(Boolean).join(" ")
      : "Customer";
    const reqNum = f.customerService?.requestNumber || f.customerServiceId.slice(0, 8);
    const srvName = f.customerService?.service?.serviceName || "Service";

    alerts.push({
      id: `alert-fu-overdue-${f.id}`,
      category: 'followup',
      severity: 'urgent',
      title: `Overdue Follow-up: ${custName}`,
      description: `Follow-up for ${srvName} (Ref: ${reqNum}) is past due. Scheduled: ${new Date(f.followUpAt).toLocaleDateString("en-IN")}. ${f.note ? `Note: "${f.note}"` : ""}`,
      targetUrl: `/requests/${f.customerServiceId}`,
      targetLabel: `Open Request #${reqNum}`,
      customerName: custName,
      customerId: cust?.id,
      dueDate: f.followUpAt,
    });
  }

  // 2. Follow-ups Due Today (High)
  for (const f of todayFollowups) {
    const cust = f.customerService?.customer;
    const custName = cust
      ? [cust.firstName, cust.middleName, cust.lastName].filter(Boolean).join(" ")
      : "Customer";
    const reqNum = f.customerService?.requestNumber || f.customerServiceId.slice(0, 8);
    const srvName = f.customerService?.service?.serviceName || "Service";

    alerts.push({
      id: `alert-fu-today-${f.id}`,
      category: 'followup',
      severity: 'high',
      title: `Follow-up Due Today: ${custName}`,
      description: `Scheduled outreach today for ${srvName} (Ref: ${reqNum}). ${f.note ? `Note: "${f.note}"` : ""}`,
      targetUrl: `/requests/${f.customerServiceId}`,
      targetLabel: `Open Request #${reqNum}`,
      customerName: custName,
      customerId: cust?.id,
      dueDate: f.followUpAt,
    });
  }

  // 3. Requests with status = 'action_required' (High)
  if (actionRequests) {
    for (const r of actionRequests) {
      const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
      const srv = Array.isArray(r.service) ? r.service[0] : r.service;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";
      const srvName = srv?.service_name || "Service";
      const reqNum = r.request_number || r.id.slice(0, 8);

      alerts.push({
        id: `alert-req-action-${r.id}`,
        category: 'request',
        severity: 'high',
        title: `Action Required on Request #${reqNum}`,
        description: `${srvName} for ${custName} is blocked waiting for customer action or missing information.`,
        targetUrl: `/requests/${r.id}`,
        targetLabel: `Review Request #${reqNum}`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: r.due_date,
      });
    }
  }

  // 4. Expired Documents (High)
  if (expiredDocs) {
    for (const d of expiredDocs) {
      const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

      alerts.push({
        id: `alert-doc-expired-${d.id}`,
        category: 'document',
        severity: 'high',
        title: `Expired Document: ${d.document_name}`,
        description: `${d.document_name} for ${custName} expired on ${d.expiry_date}. Renewal required.`,
        targetUrl: cust?.id ? `/customers/${cust.id}?tab=documents` : `/documents?renewal=expired`,
        targetLabel: `View Customer Documents`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: d.expiry_date,
      });
    }
  }

  // 5. Documents Expiring Soon (Normal)
  if (expiringDocs) {
    for (const d of expiringDocs) {
      const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

      alerts.push({
        id: `alert-doc-expiring-${d.id}`,
        category: 'document',
        severity: 'normal',
        title: `Document Renewal Approaching: ${d.document_name}`,
        description: `${d.document_name} for ${custName} is due for renewal on ${d.expiry_date}.`,
        targetUrl: cust?.id ? `/customers/${cust.id}?tab=documents` : `/documents?renewal=30d`,
        targetLabel: `View Customer Documents`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: d.expiry_date,
      });
    }
  }

  // 6. Overdue Invoices (High)
  if (overdueInvoices) {
    for (const inv of overdueInvoices) {
      const cust = Array.isArray(inv.customer) ? inv.customer[0] : inv.customer;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

      alerts.push({
        id: `alert-inv-overdue-${inv.id}`,
        category: 'billing',
        severity: 'high',
        title: `Overdue Invoice #${inv.invoice_number}`,
        description: `Balance ₹${inv.due_amount} for ${custName} is past due date (${inv.due_date}).`,
        targetUrl: `/invoices/${inv.id}`,
        targetLabel: `View Invoice #${inv.invoice_number}`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: inv.due_date,
      });
    }
  }

  // 7. Pending Document Verifications on active requests (Normal)
  if (unverifiedDocs) {
    for (const doc of unverifiedDocs) {
      const req = Array.isArray(doc.request) ? doc.request[0] : doc.request;
      if (!req) continue;
      const cust = Array.isArray(req.customer) ? req.customer[0] : req.customer;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";
      const reqNum = req.request_number || req.id.slice(0, 8);

      alerts.push({
        id: `alert-doc-verify-${doc.id}`,
        category: 'document',
        severity: 'normal',
        title: `Verification Needed: Req #${reqNum}`,
        description: `Document with tag "${doc.requirement_tag || 'general'}" for ${custName} requires staff verification.`,
        targetUrl: `/requests/${req.id}`,
        targetLabel: `Open Request Workspace`,
        customerName: custName,
        customerId: cust?.id,
      });
    }
  }

  // Sort: urgent first, then high, then normal
  const severityOrder: Record<AlertSeverity, number> = { urgent: 0, high: 1, normal: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const counts = {
    total: alerts.length,
    urgent: alerts.filter((a) => a.severity === 'urgent').length,
    high: alerts.filter((a) => a.severity === 'high').length,
    normal: alerts.filter((a) => a.severity === 'normal').length,
    followups: alerts.filter((a) => a.category === 'followup').length,
    documents: alerts.filter((a) => a.category === 'document').length,
    requests: alerts.filter((a) => a.category === 'request').length,
    billing: alerts.filter((a) => a.category === 'billing').length,
  };

  return { alerts, counts };
}
