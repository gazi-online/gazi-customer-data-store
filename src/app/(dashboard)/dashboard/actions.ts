"use server";

import { createClient } from "@/lib/supabase/server";

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

/** Customer growth: new active customers grouped by day (7d/30d) or month (6m/1y) */
export async function getCustomerGrowthData(
  period: "7d" | "30d" | "6m" | "1y" = "30d"
): Promise<CustomerGrowthPoint[]> {
  const supabase = await createClient();

  const now = new Date();
  let from: Date;
  let groupByMonth = false;

  if (period === "7d") {
    from = new Date(now); from.setDate(now.getDate() - 6);
  } else if (period === "30d") {
    from = new Date(now); from.setDate(now.getDate() - 29);
  } else if (period === "6m") {
    from = new Date(now); from.setMonth(now.getMonth() - 5); from.setDate(1);
    groupByMonth = true;
  } else {
    from = new Date(now); from.setMonth(now.getMonth() - 11); from.setDate(1);
    groupByMonth = true;
  }

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
