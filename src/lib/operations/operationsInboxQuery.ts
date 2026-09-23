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
  getUpcomingFollowups,
} from "./operationsQueryLayer";
import {
  getKolkataDateString,
  getKolkataFutureDateString,
  formatKolkataDateTime,
  OperationalPriority,
} from "./dateUtils";

export type AlertSeverity = 'urgent' | 'high' | 'normal';
export type AlertCategory = 'followup' | 'document' | 'request' | 'billing';

export interface OperationAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  priority: OperationalPriority;
  title: string;
  description: string;
  reason: string;
  targetUrl: string;
  targetLabel: string;
  customerName?: string;
  customerId?: string;
  dueDate?: string | null;
  formattedDueDate?: string | null;
  createdAt?: string;
}

export interface OperationsInboxSummary {
  alerts: OperationAlert[];
  counts: {
    total: number;
    urgent: number;
    today: number;
    upcoming: number;
    pending: number;
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

  // Parallel execution of all independent queries for optimal performance
  const [
    { items: overdueFollowups },
    { items: todayFollowups },
    { items: upcomingFollowups },
    { data: actionRequests },
    { data: overdueRequests },
    { data: expiredDocs },
    { data: expiringDocs },
    { data: overdueInvoices },
    { data: unverifiedDocs },
  ] = await Promise.all([
    // 1. Overdue follow-ups (Urgent)
    getOverdueFollowups(),
    // 2. Follow-ups Due Today (Today)
    getDueTodayFollowups(),
    // 3. Follow-ups Upcoming (Upcoming)
    getUpcomingFollowups(),
    // 4. Requests with status = 'action_required' (High / Pending or Urgent if past due)
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
    // 5. Active requests overdue (Urgent)
    supabase
      .from("customer_services")
      .select(`
        id,
        request_number,
        due_date,
        customer:customers(id, first_name, middle_name, last_name),
        service:services(service_name)
      `)
      .in("status", ["pending", "in_progress", "submitted", "documents_pending"])
      .not("due_date", "is", null)
      .lt("due_date", todayStr)
      .limit(20),
    // 6. Expired Documents (Urgent)
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
    // 7. Documents Expiring Soon (Upcoming / Today)
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
    // 8. Overdue Invoices (Urgent)
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
    // 9. Pending Document Verifications on active requests (Pending)
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
      priority: 'urgent',
      title: `Overdue Follow-up: ${custName}`,
      description: `Follow-up for ${srvName} (Ref: ${reqNum}) is past scheduled time. ${f.note ? `Note: "${f.note}"` : ""}`,
      reason: "Follow-up past scheduled date",
      targetUrl: `/requests/${f.customerServiceId}`,
      targetLabel: `Open Request #${reqNum}`,
      customerName: custName,
      customerId: cust?.id,
      dueDate: f.followUpAt,
      formattedDueDate: formatKolkataDateTime(f.followUpAt),
    });
  }

  // 2. Follow-ups Due Today (Today)
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
      priority: 'today',
      title: `Follow-up Due Today: ${custName}`,
      description: `Scheduled customer outreach today for ${srvName} (Ref: ${reqNum}). ${f.note ? `Note: "${f.note}"` : ""}`,
      reason: "Scheduled follow-up due today",
      targetUrl: `/requests/${f.customerServiceId}`,
      targetLabel: `Open Request #${reqNum}`,
      customerName: custName,
      customerId: cust?.id,
      dueDate: f.followUpAt,
      formattedDueDate: formatKolkataDateTime(f.followUpAt),
    });
  }

  // 3. Upcoming Follow-ups (Upcoming)
  for (const f of upcomingFollowups.slice(0, 10)) {
    const cust = f.customerService?.customer;
    const custName = cust
      ? [cust.firstName, cust.middleName, cust.lastName].filter(Boolean).join(" ")
      : "Customer";
    const reqNum = f.customerService?.requestNumber || f.customerServiceId.slice(0, 8);
    const srvName = f.customerService?.service?.serviceName || "Service";

    alerts.push({
      id: `alert-fu-upcoming-${f.id}`,
      category: 'followup',
      severity: 'normal',
      priority: 'upcoming',
      title: `Upcoming Follow-up: ${custName}`,
      description: `Scheduled outreach for ${srvName} (Ref: ${reqNum}) on ${formatKolkataDateTime(f.followUpAt)}.`,
      reason: "Scheduled outreach upcoming",
      targetUrl: `/requests/${f.customerServiceId}`,
      targetLabel: `Open Request #${reqNum}`,
      customerName: custName,
      customerId: cust?.id,
      dueDate: f.followUpAt,
      formattedDueDate: formatKolkataDateTime(f.followUpAt),
    });
  }

  // 4. Requests with status = 'action_required'
  if (actionRequests) {
    for (const r of actionRequests) {
      const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
      const srv = Array.isArray(r.service) ? r.service[0] : r.service;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";
      const srvName = srv?.service_name || "Service";
      const reqNum = r.request_number || r.id.slice(0, 8);
      const isOverdue = r.due_date ? r.due_date < todayStr : false;
      const isDueToday = r.due_date ? r.due_date === todayStr : false;

      const priority: OperationalPriority = isOverdue ? 'urgent' : isDueToday ? 'today' : r.due_date ? 'upcoming' : 'pending';
      const reason = isOverdue
        ? "Action required & overdue"
        : isDueToday
        ? "Action required today"
        : "Customer action or missing information required";

      alerts.push({
        id: `alert-req-action-${r.id}`,
        category: 'request',
        severity: isOverdue ? 'urgent' : 'high',
        priority,
        title: `Action Required on Request #${reqNum}`,
        description: `${srvName} for ${custName} is blocked waiting for customer action or missing information.`,
        reason,
        targetUrl: `/requests/${r.id}`,
        targetLabel: `Review Request #${reqNum}`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: r.due_date,
        formattedDueDate: r.due_date ? formatKolkataDateTime(r.due_date) : undefined,
      });
    }
  }

  // 5. Active Requests Overdue (Urgent)
  if (overdueRequests) {
    for (const r of overdueRequests) {
      // Avoid duplicate alert if already captured under actionRequests
      if (alerts.some((a) => a.id === `alert-req-action-${r.id}`)) continue;

      const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
      const srv = Array.isArray(r.service) ? r.service[0] : r.service;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";
      const srvName = srv?.service_name || "Service";
      const reqNum = r.request_number || r.id.slice(0, 8);

      alerts.push({
        id: `alert-req-overdue-${r.id}`,
        category: 'request',
        severity: 'urgent',
        priority: 'urgent',
        title: `Overdue Request #${reqNum}`,
        description: `${srvName} for ${custName} is past the target due date (${r.due_date}). Immediate completion needed.`,
        reason: "Service delivery past target due date",
        targetUrl: `/requests/${r.id}`,
        targetLabel: `Open Request #${reqNum}`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: r.due_date,
        formattedDueDate: r.due_date ? formatKolkataDateTime(r.due_date) : undefined,
      });
    }
  }

  // 6. Expired Documents (Urgent)
  if (expiredDocs) {
    for (const d of expiredDocs) {
      const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

      alerts.push({
        id: `alert-doc-expired-${d.id}`,
        category: 'document',
        severity: 'urgent',
        priority: 'urgent',
        title: `Expired Document: ${d.document_name}`,
        description: `${d.document_name} for ${custName} expired on ${d.expiry_date}. Customer renewal required.`,
        reason: "Document expired — customer renewal required",
        targetUrl: cust?.id ? `/customers/${cust.id}?tab=documents` : `/documents?renewal=expired`,
        targetLabel: `View Customer Documents`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: d.expiry_date,
        formattedDueDate: d.expiry_date,
      });
    }
  }

  // 7. Documents Expiring Soon (Upcoming / Today)
  if (expiringDocs) {
    for (const d of expiringDocs) {
      const cust = Array.isArray(d.customer) ? d.customer[0] : d.customer;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";
      const isDueToday = d.expiry_date === todayStr;

      alerts.push({
        id: `alert-doc-expiring-${d.id}`,
        category: 'document',
        severity: isDueToday ? 'high' : 'normal',
        priority: isDueToday ? 'today' : 'upcoming',
        title: isDueToday ? `Document Expires Today: ${d.document_name}` : `Renewal Due: ${d.document_name}`,
        description: `${d.document_name} for ${custName} is due for renewal on ${d.expiry_date}.`,
        reason: isDueToday ? "Document expires today" : "Document renewal due within 30 days",
        targetUrl: cust?.id ? `/customers/${cust.id}?tab=documents` : `/documents?renewal=30d`,
        targetLabel: `View Customer Documents`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: d.expiry_date,
        formattedDueDate: d.expiry_date,
      });
    }
  }

  // 8. Overdue Invoices (Urgent)
  if (overdueInvoices) {
    for (const inv of overdueInvoices) {
      const cust = Array.isArray(inv.customer) ? inv.customer[0] : inv.customer;
      const custName = cust ? [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

      alerts.push({
        id: `alert-inv-overdue-${inv.id}`,
        category: 'billing',
        severity: 'urgent',
        priority: 'urgent',
        title: `Overdue Invoice #${inv.invoice_number}`,
        description: `Balance ₹${inv.due_amount} for ${custName} is past invoice due date (${inv.due_date}).`,
        reason: "Unpaid balance past invoice due date",
        targetUrl: `/invoices/${inv.id}`,
        targetLabel: `View Invoice #${inv.invoice_number}`,
        customerName: custName,
        customerId: cust?.id,
        dueDate: inv.due_date,
        formattedDueDate: inv.due_date,
      });
    }
  }

  // 9. Pending Document Verifications on active requests (Pending)
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
        priority: 'pending',
        title: `Verification Needed: Req #${reqNum}`,
        description: `Document with tag "${doc.requirement_tag || 'general'}" for ${custName} requires staff verification.`,
        reason: "Staff document verification required",
        targetUrl: `/requests/${req.id}`,
        targetLabel: `Open Request Workspace`,
        customerName: custName,
        customerId: cust?.id,
      });
    }
  }

  // Sort deterministically: urgent first, then today, then upcoming, then pending
  const priorityOrder: Record<OperationalPriority, number> = {
    urgent: 0,
    today: 1,
    upcoming: 2,
    pending: 3,
    completed: 4,
  };

  alerts.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return 0;
  });

  const counts = {
    total: alerts.length,
    urgent: alerts.filter((a) => a.priority === 'urgent').length,
    today: alerts.filter((a) => a.priority === 'today').length,
    upcoming: alerts.filter((a) => a.priority === 'upcoming').length,
    pending: alerts.filter((a) => a.priority === 'pending').length,
    high: alerts.filter((a) => a.severity === 'high').length,
    normal: alerts.filter((a) => a.severity === 'normal').length,
    followups: alerts.filter((a) => a.category === 'followup').length,
    documents: alerts.filter((a) => a.category === 'document').length,
    requests: alerts.filter((a) => a.category === 'request').length,
    billing: alerts.filter((a) => a.category === 'billing').length,
  };

  return { alerts, counts };
}
