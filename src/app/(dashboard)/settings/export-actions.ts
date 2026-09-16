"use server";

import { createClient } from "@/lib/supabase/server";
import {
  generateCustomersCsv,
  generateRequestsCsv,
  generateDocumentsCatalogCsv,
  generateInvoicesCsv,
} from "@/lib/export/dataExportEngine";

export async function exportCustomersCsv(): Promise<string> {
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("customers")
    .select("customer_code, first_name, middle_name, last_name, phone, email, address, district, state, pincode, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to export customers: ${error.message}`);
  return generateCustomersCsv(data || []);
}

export async function exportRequestsCsv(): Promise<string> {
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("customer_services")
    .select(`
      id,
      request_number,
      status,
      priority,
      payment_status,
      due_date,
      created_at,
      customer:customers(first_name, middle_name, last_name, phone),
      service:services(service_name)
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to export requests: ${error.message}`);
  return generateRequestsCsv(data || []);
}

export async function exportDocumentsCatalogCsv(): Promise<string> {
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("customer_documents")
    .select(`
      id,
      document_name,
      category,
      document_number,
      issue_date,
      expiry_date,
      status,
      created_at,
      customer:customers(first_name, middle_name, last_name)
    `)
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to export documents: ${error.message}`);
  return generateDocumentsCatalogCsv(data || []);
}

export async function exportInvoicesCsv(): Promise<string> {
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) throw new Error("Authentication required");

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      invoice_date,
      due_date,
      total_amount,
      paid_amount,
      due_amount,
      status,
      customer:customers(first_name, middle_name, last_name)
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to export invoices: ${error.message}`);
  return generateInvoicesCsv(data || []);
}
