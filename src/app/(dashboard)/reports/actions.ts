"use server";

import { createClient } from "@/lib/supabase/server";
import { ReportEngine } from "@/lib/reports/ReportEngine";
import { ReportFilterParams } from "@/lib/reports/report-types";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export async function getReportsOverviewData(params: ReportFilterParams) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { dateFrom, dateTo } = ReportEngine.resolveFilterDates(params);

  let invQuery = supabase
    .from("invoices")
    .select("*, customer:customers(id, first_name, middle_name, last_name, customer_code)")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  if (params.customerId) {
    invQuery = invQuery.eq("customer_id", params.customerId);
  }

  if (params.invoiceStatus && params.invoiceStatus !== "all") {
    invQuery = invQuery.eq("status", params.invoiceStatus);
  }

  const { data: invoices, error: invErr } = await invQuery;
  if (invErr) {
    console.error("Error fetching invoices for report overview:", invErr);
    throw new Error(invErr.message);
  }

  let payQuery = supabase
    .from("payments")
    .select("*, customer:customers(id, first_name, middle_name, last_name, customer_code)")
    .gte("payment_date", dateFrom)
    .lte("payment_date", dateTo);

  if (params.customerId) {
    payQuery = payQuery.eq("customer_id", params.customerId);
  }

  if (params.paymentMethod && params.paymentMethod !== "all") {
    payQuery = payQuery.eq("payment_method", params.paymentMethod);
  }

  const { data: payments, error: payErr } = await payQuery;
  if (payErr) {
    console.error("Error fetching payments for report overview:", payErr);
    throw new Error(payErr.message);
  }

  const overview = ReportEngine.computeOverview({
    invoices: invoices || [],
    payments: payments || [],
  });

  return {
    dateFrom,
    dateTo,
    overview,
  };
}

export async function getReceivablesAgeingData(params: ReportFilterParams) {
  const supabase = await createClient();
  await requireAal2(supabase);

  let invQuery = supabase
    .from("invoices")
    .select("*, customer:customers(id, first_name, middle_name, last_name, customer_code)")
    .gt("due_amount", 0)
    .not("status", "in", '("draft","cancelled")')
    .order("due_date", { ascending: true });

  if (params.customerId) {
    invQuery = invQuery.eq("customer_id", params.customerId);
  }

  const { data: invoices, error } = await invQuery;
  if (error) {
    console.error("Error fetching invoices for ageing report:", error);
    throw new Error(error.message);
  }

  return ReportEngine.computeAgeing({
    invoices: invoices || [],
  });
}

export async function getCustomerReceivableSummaryData(params: ReportFilterParams) {
  const supabase = await createClient();
  await requireAal2(supabase);

  let custQuery = supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, customer_code")
    .order("first_name", { ascending: true });

  if (params.customerId) {
    custQuery = custQuery.eq("id", params.customerId);
  }

  const { data: customers, error: custErr } = await custQuery;

  if (custErr) throw new Error(custErr.message);

  let invQuery = supabase
    .from("invoices")
    .select("*, customer:customers(id, first_name, middle_name, last_name, customer_code)")
    .not("status", "in", '("draft","cancelled")');

  if (params.customerId) {
    invQuery = invQuery.eq("customer_id", params.customerId);
  }

  const { data: invoices, error: invErr } = await invQuery;

  if (invErr) throw new Error(invErr.message);

  return ReportEngine.computeCustomerReceivableSummary({
    customers: customers || [],
    invoices: invoices || [],
  });
}

export async function getCollectionsAnalyticsData(params: ReportFilterParams) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { dateFrom, dateTo } = ReportEngine.resolveFilterDates(params);

  let payQuery = supabase
    .from("payments")
    .select("*, customer:customers(id, first_name, middle_name, last_name, customer_code)")
    .gte("payment_date", dateFrom)
    .lte("payment_date", dateTo)
    .order("payment_date", { ascending: true });

  if (params.customerId) {
    payQuery = payQuery.eq("customer_id", params.customerId);
  }

  if (params.paymentMethod && params.paymentMethod !== "all") {
    payQuery = payQuery.eq("payment_method", params.paymentMethod);
  }

  const { data: payments, error } = await payQuery;
  if (error) {
    console.error("Error fetching collections for analytics report:", error);
    throw new Error(error.message);
  }

  return ReportEngine.computeCollections({
    payments: payments || [],
  });
}

export async function getTaxReadinessSummaryData(params: ReportFilterParams) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { dateFrom, dateTo } = ReportEngine.resolveFilterDates(params);

  let invQuery = supabase
    .from("invoices")
    .select("*")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo)
    .not("status", "in", '("draft","cancelled")');

  if (params.customerId) {
    invQuery = invQuery.eq("customer_id", params.customerId);
  }

  const { data: invoices, error } = await invQuery;
  if (error) {
    console.error("Error fetching tax readiness summary:", error);
    throw new Error(error.message);
  }

  return ReportEngine.computeTaxReadiness({
    invoices: invoices || [],
  });
}

export async function getCustomerStatementData(
  customerId: string,
  dateFrom?: string,
  dateTo?: string
) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, customer_code")
    .eq("id", customerId)
    .single();

  if (custErr) {
    console.error("Error fetching customer for statement:", custErr);
    throw new Error("Customer not found.");
  }

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("customer_id", customerId)
    .order("invoice_date", { ascending: true });

  if (invErr) throw new Error(invErr.message);

  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("customer_id", customerId)
    .order("payment_date", { ascending: true });

  if (payErr) throw new Error(payErr.message);

  const resolvedFrom = dateFrom || "2000-01-01";
  const resolvedTo = dateTo || "2099-12-31";

  return ReportEngine.computeCustomerStatement({
    customer,
    invoices: invoices || [],
    payments: payments || [],
    dateFrom: resolvedFrom,
    dateTo: resolvedTo,
  });
}

export async function getCustomersForReportFilter() {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, customer_code")
    .order("first_name", { ascending: true });
  return customers || [];
}

export async function getServiceWorkloadData(params: ReportFilterParams) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { dateFrom, dateTo } = ReportEngine.resolveFilterDates(params);

  // Filter boundary conversion to compare with created_at and completed_at
  const fromIso = `${dateFrom}T00:00:00.000Z`;
  const nextDay = new Date(`${dateTo}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const toIso = nextDay.toISOString();

  // Bounded query on customer_services:
  // Fetch records created in period, completed in period, or currently active
  let query = supabase
    .from("customer_services")
    .select(`
      id,
      service_id,
      status,
      created_at,
      completed_at,
      delivered_at,
      services:services(id, service_name, service_code)
    `)
    .or(`and(created_at.gte.${fromIso},created_at.lt.${toIso}),and(completed_at.gte.${fromIso},completed_at.lt.${toIso}),and(delivered_at.gte.${fromIso},delivered_at.lt.${toIso}),status.in.(pending,documents_pending,ready_to_submit,submitted,in_process,action_required)`);

  if (params.customerId) {
    query = query.eq("customer_id", params.customerId);
  }

  const { data: customerServices, error } = await query;

  if (error) {
    console.error("Error fetching service workload data:", error);
    throw new Error("Failed to load service workload analytics.");
  }

  type RawWorkloadRow = {
    id: string;
    service_id: string;
    status: string;
    created_at: string;
    completed_at?: string | null;
    delivered_at?: string | null;
    services?: {
      id: string;
      service_name?: string | null;
      service_code?: string | null;
    } | Array<{
      id: string;
      service_name?: string | null;
      service_code?: string | null;
    }> | null;
  };

  const normalizedRows = ((customerServices || []) as RawWorkloadRow[]).map((row) => ({
    id: String(row.id),
    service_id: String(row.service_id),
    status: String(row.status),
    created_at: String(row.created_at),
    completed_at: row.completed_at || null,
    delivered_at: row.delivered_at || null,
    services: Array.isArray(row.services)
      ? row.services[0] || null
      : row.services || null,
  }));

  const workloadSummary = ReportEngine.computeServiceWorkloadAnalytics({
    customerServices: normalizedRows,
    dateFrom,
    dateTo,
  });

  return workloadSummary;
}
