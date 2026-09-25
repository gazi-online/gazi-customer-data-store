"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { BillingEngine } from "@/lib/billing/BillingEngine";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  status: string;
  created_at: string;
  customer: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    customer_code: string | null;
  } | null;
}

export async function getInvoices(searchQuery?: string, statusFilter?: string): Promise<InvoiceListItem[]> {
  const supabase = await createClient();
  await requireAal2(supabase);

  let query = supabase
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
      created_at,
      customer:customers(id, first_name, middle_name, last_name, customer_code)
    `)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "overdue") {
      const today = new Date().toISOString().split("T")[0];
      query = query
        .lt("due_date", today)
        .gt("due_amount", 0)
        .not("status", "in", '("draft","cancelled")');
    } else {
      query = query.eq("status", statusFilter);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching invoices:", error);
    throw new Error(error.message);
  }

  let filtered = (data as unknown as InvoiceListItem[]) || [];
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter((inv: InvoiceListItem) => {
      const invNum = inv.invoice_number?.toLowerCase() || "";
      const cust = inv.customer;
      const custName = cust
        ? `${cust.first_name || ""} ${cust.middle_name || ""} ${cust.last_name || ""}`.toLowerCase()
        : "";
      const custCode = cust?.customer_code?.toLowerCase() || "";
      return invNum.includes(q) || custName.includes(q) || custCode.includes(q);
    });
  }

  return filtered;
}

export async function getInvoiceById(id: string) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .select(`
      *,
      customer:customers(id, first_name, middle_name, last_name, customer_code, phone, email, address, city, district, state, pincode),
      items:invoice_items(*)
    `)
    .eq("id", id)
    .single();

  if (invError) {
    console.error("Error fetching invoice by ID:", invError);
    throw new Error(invError.message);
  }

  // Sort invoice items strictly by: line_position ASC NULLS LAST, created_at ASC, id ASC
  const sortedItems = [...(invoice.items || [])].sort((
    a: { line_position?: number | null; created_at?: string | null; id?: string },
    b: { line_position?: number | null; created_at?: string | null; id?: string }
  ) => {
    const posA = a.line_position ?? null;
    const posB = b.line_position ?? null;
    if (posA !== null && posB !== null) {
      if (posA !== posB) return posA - posB;
    } else if (posA !== null) {
      return -1;
    } else if (posB !== null) {
      return 1;
    }

    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  // Fetch payment allocations for this invoice
  const { data: allocations, error: allocError } = await supabase
    .from("payment_allocations")
    .select(`
      *,
      payment:payments(*)
    `)
    .eq("invoice_id", id)
    .order("created_at", { ascending: false });

  if (allocError) {
    console.error("Error fetching invoice allocations:", allocError);
  }

  return {
    ...invoice,
    items: sortedItems,
    allocations: allocations || [],
  };
}

export interface CreateInvoicePayload {
  customer_id: string;
  invoice_date: string;
  due_date?: string | null;
  notes?: string | null;
  status?: 'draft' | 'issued';
  idempotency_key?: string | null;
  items: Array<{
    service_id?: string | null;
    customer_service_id?: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    tax_amount?: number;
  }>;
}

export type CreateInvoiceResult =
  | {
      success: true;
      data: {
        id: string;
        invoice_number: string;
        total_amount: number;
        status: string;
      };
      replayed: boolean;
      error?: never;
    }
  | {
      success?: false;
      error: string;
      data?: never;
      replayed?: never;
    };

export async function createInvoice(payload: CreateInvoicePayload): Promise<CreateInvoiceResult> {
  const supabase = await createClient();
  await requireAal2(supabase);

  if (!payload.customer_id) {
    return { error: "Customer selection is required." };
  }

  if (!payload.items || payload.items.length === 0) {
    return { error: "At least one invoice line item is required." };
  }

  const idempotencyKey = payload.idempotency_key || crypto.randomUUID();

  const preparedItems = payload.items.map((item) => ({
    service_id: item.service_id || null,
    customer_service_id: item.customer_service_id || null,
    description: item.description.trim(),
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit_price: Number(item.unit_price) >= 0 ? Number(item.unit_price) : 0,
    discount_amount: Number(item.discount_amount || 0),
    tax_amount: Number(item.tax_amount || 0),
  }));

  const { data: res, error: rpcError } = await supabase.rpc("create_invoice_atomic", {
    p_customer_id: payload.customer_id,
    p_invoice_date: payload.invoice_date || new Date().toISOString().split("T")[0],
    p_due_date: payload.due_date || null,
    p_notes: payload.notes || null,
    p_status: payload.status || 'issued',
    p_items: preparedItems,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    console.error("RPC Error creating invoice:", rpcError);
    return { error: rpcError.message };
  }

  if (!res || !res.success) {
    return { error: res?.error || "Failed to create invoice atomically." };
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${payload.customer_id}`);

  return {
    success: true,
    data: {
      id: res.invoice_id,
      invoice_number: res.invoice_number,
      total_amount: res.total_amount,
      status: res.status,
    },
    replayed: res.replayed || false,
  };
}

export async function issueInvoice(id: string, requestId?: string) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { error } = await supabase
    .from("invoices")
    .update({ status: "issued" })
    .eq("id", id)
    .eq("status", "draft");

  if (error) {
    console.error("Error issuing invoice:", error);
    return { error: error.message };
  }

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/requests");
  if (requestId) {
    revalidatePath(`/requests/${requestId}`);
  }
  return { success: true };
}

export async function cancelInvoice(id: string) {
  const supabase = await createClient();
  await requireAal2(supabase);

  // Check if invoice has payments allocated before cancelling
  const { data: inv } = await supabase
    .from("invoices")
    .select("paid_amount, status")
    .eq("id", id)
    .single();

  if (inv && Number(inv.paid_amount) > 0) {
    return { error: "Cannot cancel an invoice with allocated payments. Void/refund payments first." };
  }

  // Lifecycle status request only: DB trigger owns due_amount = 0 and cancelled_at = NOW()
  const { error } = await supabase
    .from("invoices")
    .update({
      status: "cancelled",
    })
    .eq("id", id);

  if (error) {
    console.error("Error cancelling invoice:", error);
    return { error: error.message };
  }

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getCustomerBillingSummary(customerId: string) {
  const supabase = await createClient();
  await requireAal2(supabase);

  try {
    const [invRes, payRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
    ]);

    if (invRes.error) throw invRes.error;
    if (payRes.error) throw payRes.error;

    const invoices = invRes.data;
    const payments = payRes.data;

    const today = new Date().toISOString().split("T")[0];

    const activeInvoices = (invoices || []).filter((inv) => inv.status !== "cancelled");
    const totalBilled = activeInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const totalPaid = activeInvoices.reduce((sum, inv) => sum + Number(inv.paid_amount), 0);
    const outstanding = activeInvoices.reduce((sum, inv) => sum + Number(inv.due_amount), 0);

    const overdue = activeInvoices
      .filter((inv) => inv.due_date && inv.due_date < today && Number(inv.due_amount) > 0 && inv.status !== "draft")
      .reduce((sum, inv) => sum + Number(inv.due_amount), 0);

    return {
      success: true,
      data: {
        totalBilled: BillingEngine.roundMoney(totalBilled),
        totalPaid: BillingEngine.roundMoney(totalPaid),
        outstanding: BillingEngine.roundMoney(outstanding),
        overdue: BillingEngine.roundMoney(overdue),
        invoices: invoices || [],
        payments: payments || [],
      },
    };
  } catch (err: unknown) {
    console.error("Error fetching customer billing summary:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load customer billing history.",
      data: {
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
        overdue: 0,
        invoices: [],
        payments: [],
      },
    };
  }
}
