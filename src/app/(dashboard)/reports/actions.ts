"use server";

import { createClient } from "@/lib/supabase/server";
import { ReportEngine } from "@/lib/reports/ReportEngine";
import { ReportFilterParams } from "@/lib/reports/report-types";

export async function getReportsOverviewData(params: ReportFilterParams) {
  const supabase = await createClient();
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

  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, customer_code")
    .order("first_name", { ascending: true });

  if (custErr) throw new Error(custErr.message);

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("*, customer:customers(id, first_name, middle_name, last_name, customer_code)")
    .not("status", "in", '("draft","cancelled")');

  if (invErr) throw new Error(invErr.message);

  return ReportEngine.computeCustomerReceivableSummary({
    customers: customers || [],
    invoices: invoices || [],
  });
}

export async function getCollectionsAnalyticsData(params: ReportFilterParams) {
  const supabase = await createClient();
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
  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, customer_code")
    .order("first_name", { ascending: true });
  return customers || [];
}
