"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export interface SearchResultItem {
  id: string;
  type: 'customer' | 'request' | 'invoice' | 'document';
  title: string;
  subtitle: string;
  badge?: string;
  url: string;
}

export interface GroupedSearchResults {
  customers: SearchResultItem[];
  requests: SearchResultItem[];
  invoices: SearchResultItem[];
  documents: SearchResultItem[];
  totalMatches: number;
}

export async function unifiedGlobalSearch(rawQuery: string): Promise<GroupedSearchResults> {
  const query = rawQuery.trim();
  const emptyResult: GroupedSearchResults = {
    customers: [],
    requests: [],
    invoices: [],
    documents: [],
    totalMatches: 0,
  };

  if (!query || query.length < 2) {
    return emptyResult;
  }

  const supabase = await createClient();
  await requireAal2(supabase);
  const safeSearchPattern = `%${query.replace(/[%_]/g, '')}%`;

  // Parallel tenant-isolated queries across 4 core entities
  const [custRes, reqRes, invRes, docRes] = await Promise.all([
    // 1. Customers
    supabase
      .from("customers")
      .select("id, customer_code, first_name, middle_name, last_name, phone")
      .is("deleted_at", null)
      .or(`first_name.ilike.${safeSearchPattern},last_name.ilike.${safeSearchPattern},phone.ilike.${safeSearchPattern},customer_code.ilike.${safeSearchPattern}`)
      .limit(6),

    // 2. Service Requests
    supabase
      .from("customer_services")
      .select(`
        id,
        request_number,
        application_reference,
        status,
        customer:customers(first_name, last_name),
        service:services(service_name)
      `)
      .or(`request_number.ilike.${safeSearchPattern},application_reference.ilike.${safeSearchPattern}`)
      .limit(6),

    // 3. Invoices
    supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        status,
        total_amount,
        due_amount,
        customer:customers(first_name, last_name)
      `)
      .ilike("invoice_number", safeSearchPattern)
      .limit(6),

    // 4. Documents
    supabase
      .from("customer_documents")
      .select(`
        id,
        document_name,
        document_number,
        category,
        customer_id,
        customer:customers(first_name, last_name)
      `)
      .eq("archived", false)
      .or(`document_name.ilike.${safeSearchPattern},document_number.ilike.${safeSearchPattern}`)
      .limit(6),
  ]);

  const customers: SearchResultItem[] = (custRes.data || []).map((c: Record<string, unknown>) => {
    const fullName = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");
    return {
      id: String(c.id),
      type: 'customer',
      title: fullName,
      subtitle: [c.phone, c.customer_code ? `Code: ${c.customer_code}` : null].filter(Boolean).join(" • "),
      badge: 'Customer',
      url: `/customers/${c.id}`,
    };
  });

  const requests: SearchResultItem[] = (reqRes.data || []).map((r: Record<string, unknown>) => {
    const cust = Array.isArray(r.customer) ? r.customer[0] : (r.customer as Record<string, unknown> | null);
    const srv = Array.isArray(r.service) ? r.service[0] : (r.service as Record<string, unknown> | null);
    const custName = cust ? `${cust.first_name || ""} ${cust.last_name || ""}`.trim() : "Customer";
    const ref = r.application_reference ? `App Ref: ${r.application_reference}` : "";
    return {
      id: String(r.id),
      type: 'request',
      title: `Req #${r.request_number || String(r.id).slice(0, 8)}: ${srv?.service_name || "Service"}`,
      subtitle: [custName, ref].filter(Boolean).join(" • "),
      badge: String(r.status || ""),
      url: `/requests/${r.id}`,
    };
  });

  const invoices: SearchResultItem[] = (invRes.data || []).map((inv: Record<string, unknown>) => {
    const cust = Array.isArray(inv.customer) ? inv.customer[0] : (inv.customer as Record<string, unknown> | null);
    const custName = cust ? `${cust.first_name || ""} ${cust.last_name || ""}`.trim() : "Customer";
    return {
      id: String(inv.id),
      type: 'invoice',
      title: `Invoice #${inv.invoice_number}`,
      subtitle: `${custName} • Total: ₹${inv.total_amount} (Due: ₹${inv.due_amount})`,
      badge: String(inv.status || ""),
      url: `/invoices/${inv.id}`,
    };
  });

  const documents: SearchResultItem[] = (docRes.data || []).map((d: Record<string, unknown>) => {
    const cust = Array.isArray(d.customer) ? d.customer[0] : (d.customer as Record<string, unknown> | null);
    const custName = cust ? `${cust.first_name || ""} ${cust.last_name || ""}`.trim() : "Customer";
    return {
      id: String(d.id),
      type: 'document',
      title: String(d.document_name || "Document"),
      subtitle: `${custName} • ${d.document_number ? `Doc #: ${d.document_number}` : (d.category || "General")}`,
      badge: String(d.category || "doc"),
      url: `/customers/${d.customer_id}?tab=documents`,
    };
  });

  const totalMatches = customers.length + requests.length + invoices.length + documents.length;

  return {
    customers,
    requests,
    invoices,
    documents,
    totalMatches,
  };
}
