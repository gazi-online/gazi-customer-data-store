"use server";

import { createClient } from "@/lib/supabase/server";
import { getKolkataTodayHalfOpenRange } from "@/lib/operations/dateUtils";

export async function getDashboardStats() {
  const supabase = await createClient();
  
  const { count: totalCustomers } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true })
    .is("deleted_at", null);

  const { count: activeCustomers } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true })
    .eq("status", "active")
    .is("deleted_at", null);

  const { count: inactiveCustomers } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true })
    .eq("status", "inactive")
    .is("deleted_at", null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: todayEntries } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true })
    .is("deleted_at", null)
    .gte("created_at", today.toISOString());

  const { count: activeServices } = await supabase
    .from("customer_services")
    .select("*", { count: 'exact', head: true })
    .in("status", ["pending", "in_progress"]);

  return {
    totalCustomers: totalCustomers || 0,
    activeCustomers: activeCustomers || 0,
    inactiveCustomers: inactiveCustomers || 0,
    todayEntries: todayEntries || 0,
    activeServices: activeServices || 0,
  };
}

export async function getRecentCustomers() {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, phone, status, created_at, photo_url")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);
  return data;
}

// ─── Chart Data Actions ────────────────────────────────────────────────────

export type CustomerGrowthPoint = { label: string; customers: number };
export type RevenuePoint = { month: string; paid: number; outstanding: number };
export type StatusDistPoint = { name: string; value: number; color: string };
export type ServiceDistPoint = { name: string; count: number };

export type DashboardMetrics = {
  totalCustomers: number;
  newThisMonth: number;
  activeCustomers: number;
  documentsStored: number;
  syncedThisWeek: number;
  pendingVerification: number;
  renewalsDue: number;
  followupsDueToday: number;
  followupsOverdue: number;
  followupsUpcoming: number;
};

export type FollowupMetricsInput = {
  followupsDueToday?: number;
  followupsOverdue?: number;
  followupsUpcoming?: number;
};

export async function getDashboardMetrics(
  providedFollowupCounts?: FollowupMetricsInput
): Promise<DashboardMetrics> {
  try {
    const supabase = await createClient();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const todayStr = now.toISOString().split("T")[0];
    const in30Days = new Date(now);
    in30Days.setDate(now.getDate() + 30);
    const in30DaysStr = in30Days.toISOString().split("T")[0];

    // Determine if we need to query follow-ups
    const needFollowups =
      !providedFollowupCounts ||
      providedFollowupCounts.followupsDueToday === undefined ||
      providedFollowupCounts.followupsOverdue === undefined ||
      providedFollowupCounts.followupsUpcoming === undefined;

    const range = needFollowups ? getKolkataTodayHalfOpenRange() : null;

    // Execute core metrics queries in parallel with small count projection ('id')
    const [
      totalCustRes,
      newMonthCustRes,
      activeCustRes,
      docsRes,
      syncedWeekRes,
      pendingVerifRes,
      renewalsRes,
      todayRes,
      overdueRes,
      upcomingRes,
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .is("deleted_at", null),
      supabase
        .from("customer_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("customer_documents")
        .select("id", { count: "exact", head: true })
        .gte("uploaded_at", startOfWeek.toISOString()),
      supabase
        .from("customer_documents")
        .select("id", { count: "exact", head: true })
        .eq("verified", false)
        .eq("status", "active"),
      supabase
        .from("customer_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .not("expiry_date", "is", null)
        .gte("expiry_date", todayStr)
        .lte("expiry_date", in30DaysStr),
      // Followup queries if not precomputed
      needFollowups && range
        ? supabase
            .from("service_request_followups")
            .select("id", { count: "exact", head: true })
            .eq("status", "open")
            .gte("follow_up_at", range.startOfTodayIST)
            .lt("follow_up_at", range.startOfTomorrowIST)
        : Promise.resolve({ count: providedFollowupCounts?.followupsDueToday ?? 0, error: null }),
      needFollowups && range
        ? supabase
            .from("service_request_followups")
            .select("id", { count: "exact", head: true })
            .eq("status", "open")
            .lt("follow_up_at", range.startOfTodayIST)
        : Promise.resolve({ count: providedFollowupCounts?.followupsOverdue ?? 0, error: null }),
      needFollowups && range
        ? supabase
            .from("service_request_followups")
            .select("id", { count: "exact", head: true })
            .eq("status", "open")
            .gte("follow_up_at", range.startOfTomorrowIST)
        : Promise.resolve({ count: providedFollowupCounts?.followupsUpcoming ?? 0, error: null }),
    ]);

    const followupsDueToday = todayRes.count || 0;
    const followupsOverdue = overdueRes.count || 0;
    const followupsUpcoming = upcomingRes.count || 0;

    return {
      totalCustomers: totalCustRes.count || 0,
      newThisMonth: newMonthCustRes.count || 0,
      activeCustomers: activeCustRes.count || 0,
      documentsStored: docsRes.count || 0,
      syncedThisWeek: syncedWeekRes.count || 0,
      pendingVerification: pendingVerifRes.count || 0,
      renewalsDue: renewalsRes.count || 0,
      followupsDueToday,
      followupsOverdue,
      followupsUpcoming,
    };
  } catch (error) {
    console.error("Failed to load dashboard metrics safely:", error);
    return {
      totalCustomers: 0,
      newThisMonth: 0,
      activeCustomers: 0,
      documentsStored: 0,
      syncedThisWeek: 0,
      pendingVerification: 0,
      renewalsDue: 0,
      followupsDueToday: 0,
      followupsOverdue: 0,
      followupsUpcoming: 0,
    };
  }
}

export type ActivityEvent = {
  id: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  initials: string;
  activity: string;
  iconType: "document" | "customer" | "service";
  timestamp: string;
  rawDate: string;
  status: "Verified" | "Pending Review" | "Complete" | "Active";
  statusType: "success" | "warning" | "info";
  actionUrl: string;
};

export async function getRecentActivity(limit = 6): Promise<ActivityEvent[]> {
  try {
    const supabase = await createClient();

    const [docsRes, custRes, servRes] = await Promise.all([
      supabase
        .from("customer_documents")
        .select(`
          id,
          document_type,
          document_name,
          uploaded_at,
          verified,
          status,
          customer_id,
          customer:customers (
            id,
            customer_code,
            first_name,
            last_name
          )
        `)
        .order("uploaded_at", { ascending: false })
        .limit(limit),
      supabase
        .from("customers")
        .select("id, customer_code, first_name, last_name, created_at, status")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("customer_services")
        .select(`
          id,
          service_name,
          status,
          created_at,
          customer_id,
          customer:customers (
            id,
            customer_code,
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    const activities: ActivityEvent[] = [];

    const getInitials = (first?: string | null, last?: string | null) => {
      const f = (first || "").trim()[0] || "C";
      const l = (last || "").trim()[0] || "";
      return (f + l).toUpperCase();
    };

    const formatTime = (iso: string) => {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      if (isToday) return `Today, ${timeStr}`;
      if (isYesterday) return `Yesterday, ${timeStr}`;
      return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, ${timeStr}`;
    };

    interface CustomerSummary {
      id: string;
      customer_code?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    }

    for (const doc of docsRes.data || []) {
      const cust = (Array.isArray(doc.customer) ? doc.customer[0] : doc.customer) as CustomerSummary | null;
      if (!cust) continue;
      const name = `${cust.first_name || ""} ${cust.last_name || ""}`.trim() || "Customer";
      const code = cust.customer_code ? `#${cust.customer_code}` : `#GC-${cust.id.slice(0, 4).toUpperCase()}`;
      const docType = doc.document_name || doc.document_type || "Document";

      activities.push({
        id: `doc-${doc.id}`,
        customerId: cust.id,
        customerName: name,
        customerCode: code,
        initials: getInitials(cust.first_name, cust.last_name),
        activity: `${docType} uploaded (Masked)`,
        iconType: "document",
        timestamp: formatTime(doc.uploaded_at),
        rawDate: doc.uploaded_at,
        status: doc.verified ? "Verified" : "Pending Review",
        statusType: doc.verified ? "success" : "warning",
        actionUrl: `/customers/${cust.id}`,
      });
    }

    for (const c of custRes.data || []) {
      const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Customer";
      const code = c.customer_code ? `#${c.customer_code}` : `#GC-${c.id.slice(0, 4).toUpperCase()}`;
      activities.push({
        id: `cust-${c.id}`,
        customerId: c.id,
        customerName: name,
        customerCode: code,
        initials: getInitials(c.first_name, c.last_name),
        activity: "New customer registered",
        iconType: "customer",
        timestamp: formatTime(c.created_at),
        rawDate: c.created_at,
        status: c.status === "active" ? "Active" : "Pending Review",
        statusType: c.status === "active" ? "info" : "warning",
        actionUrl: `/customers/${c.id}`,
      });
    }

    for (const s of servRes.data || []) {
      const cust = (Array.isArray(s.customer) ? s.customer[0] : s.customer) as CustomerSummary | null;
      if (!cust) continue;
      const name = `${cust.first_name || ""} ${cust.last_name || ""}`.trim() || "Customer";
      const code = cust.customer_code ? `#${cust.customer_code}` : `#GC-${cust.id.slice(0, 4).toUpperCase()}`;
      const sName = s.service_name || "Service registered";
      activities.push({
        id: `serv-${s.id}`,
        customerId: cust.id,
        customerName: name,
        customerCode: code,
        initials: getInitials(cust.first_name, cust.last_name),
        activity: sName,
        iconType: "service",
        timestamp: formatTime(s.created_at),
        rawDate: s.created_at,
        status: s.status === "completed" ? "Complete" : "Pending Review",
        statusType: s.status === "completed" ? "success" : "info",
        actionUrl: `/customers/${cust.id}`,
      });
    }

    activities.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
    return activities.slice(0, limit);
  } catch (error) {
    console.error("Failed to load recent activity safely:", error);
    return [];
  }
}

/** Customer growth: new active customers grouped by day (7d/30d/90d) or month (1y) */
export async function getCustomerGrowthData(
  period: "7d" | "30d" | "90d" | "1y" = "30d"
): Promise<CustomerGrowthPoint[]> {
  const supabase = await createClient();

  const now = new Date();
  let from: Date;
  let groupByMonth = false;

  if (period === "7d") {
    from = new Date(now); from.setDate(now.getDate() - 6);
  } else if (period === "30d") {
    from = new Date(now); from.setDate(now.getDate() - 29);
  } else if (period === "90d") {
    from = new Date(now); from.setDate(now.getDate() - 89);
  } else {
    from = new Date(now); from.setMonth(now.getMonth() - 11); from.setDate(1);
    groupByMonth = true;
  }
  from.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("customers")
    .select("created_at")
    .is("deleted_at", null)
    .gte("created_at", from.toISOString())
    .lte("created_at", now.toISOString())
    .order("created_at", { ascending: true });

  if (error) return [];

  const rows = data || [];

  if (groupByMonth) {
    const map = new Map<string, number>();
    const cursor = new Date(from);
    cursor.setDate(1);
    while (cursor <= now) {
      const key = cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      map.set(key, 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    for (const row of rows) {
      const d = new Date(row.created_at);
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, customers]) => ({ label, customers }));
  } else {
    const map = new Map<string, number>();
    const cursor = new Date(from);
    while (cursor <= now) {
      const key = cursor.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      map.set(key, 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const row of rows) {
      const d = new Date(row.created_at);
      const key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, customers]) => ({ label, customers }));
  }
}

/** Revenue overview: paid vs outstanding per month over last N months */
export async function getRevenueChartData(months = 6): Promise<RevenuePoint[]> {
  const supabase = await createClient();

  const now = new Date();
  const from = new Date(now);
  from.setMonth(now.getMonth() - (months - 1));
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const [{ data: payments }, { data: invoices }] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, payment_date, status")
      .gte("payment_date", from.toISOString().split("T")[0])
      .eq("status", "recorded"),
    supabase
      .from("invoices")
      .select("due_amount, invoice_date, status")
      .gte("invoice_date", from.toISOString().split("T")[0])
      .not("status", "in", '("cancelled","draft")'),
  ]);

  const paidMap = new Map<string, number>();
  const outMap = new Map<string, number>();
  const cursor = new Date(from);
  while (cursor <= now) {
    const key = cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    paidMap.set(key, 0);
    outMap.set(key, 0);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const p of payments || []) {
    const d = new Date(p.payment_date);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    if (paidMap.has(key)) paidMap.set(key, paidMap.get(key)! + Number(p.amount));
  }
  for (const inv of invoices || []) {
    const d = new Date(inv.invoice_date);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    if (outMap.has(key)) outMap.set(key, outMap.get(key)! + Number(inv.due_amount));
  }

  return Array.from(paidMap.keys()).map((month) => ({
    month,
    paid: Math.round((paidMap.get(month) ?? 0) * 100) / 100,
    outstanding: Math.round((outMap.get(month) ?? 0) * 100) / 100,
  }));
}

/** Customer status distribution for donut chart */
export async function getCustomerStatusDistribution(): Promise<StatusDistPoint[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("status")
    .is("deleted_at", null);

  if (error || !data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  const COLOR_MAP: Record<string, string> = {
    active: "#22c55e",
    inactive: "#94a3b8",
    archived: "#f59e0b",
  };

  return Object.entries(counts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: COLOR_MAP[name] ?? "#6366f1",
  }));
}

/** Service type distribution */
export async function getServiceTypeDistribution(): Promise<ServiceDistPoint[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_services")
    .select("service_name");

  if (error || !data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const name = row.service_name || "Other";
    counts[name] = (counts[name] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
}

// ─── Payment Status Gauge ─────────────────────────────────────────────────

export type PaymentGaugeData = {
  /** Total amount from non-cancelled, non-draft invoices */
  totalBilled: number;
  /** Total collected (paid_amount across those invoices) */
  totalCollected: number;
  /** totalBilled - totalCollected */
  totalOutstanding: number;
  /** 0–100 integer percentage */
  collectionRate: number;
  /** Counts by invoice status */
  statusCounts: { paid: number; partial: number; issued: number; overdue: number; draft: number };
};

export async function getPaymentStatusData(): Promise<PaymentGaugeData> {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("status, due_date, total_amount, paid_amount, due_amount");

  if (error || !invoices) {
    return {
      totalBilled: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      collectionRate: 0,
      statusCounts: { paid: 0, partial: 0, issued: 0, overdue: 0, draft: 0 },
    };
  }

  const active = invoices.filter((inv) => inv.status !== "cancelled");

  let totalBilled = 0;
  let totalCollected = 0;
  let paidCount = 0;
  let partialCount = 0;
  let issuedCount = 0;
  let overdueCount = 0;
  let draftCount = 0;

  for (const inv of active) {
    if (inv.status === "draft") { draftCount++; continue; }
    totalBilled += Number(inv.total_amount ?? 0);
    totalCollected += Number(inv.paid_amount ?? 0);

    if (inv.status === "paid") paidCount++;
    else if (inv.status === "partially_paid") partialCount++;
    else if (
      inv.status === "issued" &&
      inv.due_date &&
      inv.due_date < today &&
      Number(inv.due_amount ?? 0) > 0
    ) {
      overdueCount++;
    } else if (inv.status === "issued") {
      issuedCount++;
    }
  }

  const totalOutstanding = Math.max(0, totalBilled - totalCollected);
  const collectionRate =
    totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  return {
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalCollected: Math.round(totalCollected * 100) / 100,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    collectionRate,
    statusCounts: {
      paid: paidCount,
      partial: partialCount,
      issued: issuedCount,
      overdue: overdueCount,
      draft: draftCount,
    },
  };
}

// ─── Daily Attention Section (Phase 6) ──────────────────────────────────

export type DashboardAttentionItem = {
  id: string;
  category: "followup" | "document" | "request" | "billing";
  priority: "urgent" | "today" | "upcoming" | "pending";
  title: string;
  reason: string;
  customerName?: string;
  customerId?: string;
  formattedDueDate?: string | null;
  targetUrl: string;
  targetLabel: string;
};

export type DashboardAttentionSummary = {
  urgentCount: number;
  todayCount: number;
  pendingCount: number;
  totalAttentionCount: number;
  items: DashboardAttentionItem[];
};

/**
 * Loads compact operational items requiring immediate staff attention
 * without creating waterfalls or computing authoritative balances.
 */
export async function getDashboardAttentionData(
  limit = 4,
  options?: { includeUpcoming?: boolean; maxFollowups?: number }
): Promise<DashboardAttentionSummary> {
  try {
    const { getOperationsInboxAlerts } = await import("@/lib/operations/operationsInboxQuery");
    const summary = await getOperationsInboxAlerts({
      includeUpcoming: options?.includeUpcoming ?? false,
      maxFollowups: options?.maxFollowups ?? 10,
    });

    const actionable = summary.alerts.filter(
      (a) => a.priority === "urgent" || a.priority === "today" || a.priority === "pending"
    );

    const items: DashboardAttentionItem[] = actionable.slice(0, limit).map((a) => ({
      id: a.id,
      category: a.category,
      priority: a.priority as "urgent" | "today" | "upcoming" | "pending",
      title: a.title,
      reason: a.reason,
      customerName: a.customerName,
      customerId: a.customerId,
      formattedDueDate: a.formattedDueDate,
      targetUrl: a.targetUrl,
      targetLabel: a.targetLabel,
    }));

    return {
      urgentCount: summary.counts.urgent,
      todayCount: summary.counts.today,
      pendingCount: summary.counts.pending,
      totalAttentionCount: summary.counts.urgent + summary.counts.today + summary.counts.pending,
      items,
    };
  } catch (error) {
    console.error("Failed to load dashboard attention data safely:", error);
    return {
      urgentCount: 0,
      todayCount: 0,
      pendingCount: 0,
      totalAttentionCount: 0,
      items: [],
    };
  }
}

export type DashboardSnapshot = {
  metrics: DashboardMetrics;
  growthData: CustomerGrowthPoint[];
  activities: ActivityEvent[];
  attentionData: DashboardAttentionSummary;
};

/**
 * Fast-path server-only snapshot orchestrator for /dashboard.
 * Coordinates independent data requirements in parallel with zero sequential waterfalls
 * and eliminates unneeded upcoming follow-up reads and unbounded queries.
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [metrics, growthData, activities, attentionData] = await Promise.all([
    getDashboardMetrics(),
    getCustomerGrowthData("30d"),
    getRecentActivity(6),
    getDashboardAttentionData(4, { includeUpcoming: false, maxFollowups: 10 }),
  ]);

  return {
    metrics,
    growthData,
    activities,
    attentionData,
  };
}
