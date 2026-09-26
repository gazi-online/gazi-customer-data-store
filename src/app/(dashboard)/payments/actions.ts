"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@/types/billing";
import { BillingEngine } from "@/lib/billing/BillingEngine";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";
import QRCode from "qrcode";
import { getCanonicalAppUrl } from "@/lib/auth/safeRedirect";

export interface PaymentListItem {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: string;
  created_at: string;
  customer: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    customer_code: string | null;
  } | null;
  allocations: Array<{
    id: string;
    amount: number;
    invoice: {
      id: string;
      invoice_number: string;
    } | null;
  }>;
}

export async function getPayments(
  searchQuery?: string,
  statusFilter?: string,
  methodFilter?: string
): Promise<PaymentListItem[]> {
  const supabase = await createClient();
  await requireAal2(supabase);

  let query = supabase
    .from("payments")
    .select(`
      id,
      payment_number,
      payment_date,
      amount,
      payment_method,
      reference_number,
      status,
      created_at,
      customer:customers(id, first_name, middle_name, last_name, customer_code),
      allocations:payment_allocations(
        id,
        amount,
        invoice:invoices(id, invoice_number)
      )
    `)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  if (methodFilter && methodFilter !== "all") {
    query = query.eq("payment_method", methodFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching payments:", error);
    throw new Error(error.message);
  }

  let filtered = (data as unknown as PaymentListItem[]) || [];
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter((pay: PaymentListItem) => {
      const payNum = pay.payment_number?.toLowerCase() || "";
      const refNum = pay.reference_number?.toLowerCase() || "";
      const cust = pay.customer;
      const custName = cust
        ? `${cust.first_name || ""} ${cust.middle_name || ""} ${cust.last_name || ""}`.toLowerCase()
        : "";
      return payNum.includes(q) || refNum.includes(q) || custName.includes(q);
    });
  }

  return filtered;
}

export interface CreatePaymentPayload {
  customer_id: string;
  amount: number;
  payment_date?: string;
  payment_method: PaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
  invoice_id?: string | null;
  idempotency_key?: string | null;
}

export async function createPayment(payload: CreatePaymentPayload) {
  const supabase = await createClient();
  await requireAal2(supabase);

  if (!payload.customer_id) {
    return { error: "Customer selection is required." };
  }

  if (!payload.amount || Number(payload.amount) <= 0) {
    return { error: "Payment amount must be greater than zero." };
  }

  const roundedAmount = BillingEngine.roundMoney(Number(payload.amount));
  const idempotencyKey = payload.idempotency_key || crypto.randomUUID();
  const paymentDate = payload.payment_date || new Date().toISOString().split("T")[0];

  if (payload.invoice_id) {
    // Atomic payment + allocation
    const { data: res, error: rpcError } = await supabase.rpc("record_payment_and_allocate_atomic", {
      p_customer_id: payload.customer_id,
      p_amount: roundedAmount,
      p_payment_date: paymentDate,
      p_payment_method: payload.payment_method,
      p_reference_number: payload.reference_number?.trim() || null,
      p_notes: payload.notes?.trim() || null,
      p_invoice_id: payload.invoice_id,
      p_idempotency_key: idempotencyKey,
    });

    if (rpcError) {
      console.error("RPC Error in record_payment_and_allocate_atomic:", rpcError);
      return { error: rpcError.message };
    }

    if (!res || !res.success) {
      return { error: res?.error || "Failed to record and allocate payment atomically." };
    }

    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${payload.invoice_id}`);
    revalidatePath(`/customers/${payload.customer_id}`);
    revalidatePath("/requests");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        id: res.payment_id,
        payment_number: res.payment_number,
        amount: res.amount,
        status: res.status,
      },
      allocation_id: res.allocation_id,
      replayed: res.replayed || false,
    };
  } else {
    // Standalone unallocated payment
    const { data: res, error: rpcError } = await supabase.rpc("record_payment_atomic", {
      p_customer_id: payload.customer_id,
      p_amount: roundedAmount,
      p_payment_date: paymentDate,
      p_payment_method: payload.payment_method,
      p_reference_number: payload.reference_number?.trim() || null,
      p_notes: payload.notes?.trim() || null,
      p_idempotency_key: idempotencyKey,
    });

    if (rpcError) {
      console.error("RPC Error in record_payment_atomic:", rpcError);
      return { error: rpcError.message };
    }

    if (!res || !res.success) {
      return { error: res?.error || "Failed to record payment atomically." };
    }

    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath(`/customers/${payload.customer_id}`);
    revalidatePath("/requests");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        id: res.payment_id,
        payment_number: res.payment_number,
        amount: res.amount,
        status: res.status,
      },
      replayed: res.replayed || false,
    };
  }
}

export async function allocatePayment(paymentId: string, invoiceId: string, amount: number) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const roundedAmount = BillingEngine.roundMoney(Number(amount));
  if (roundedAmount <= 0) {
    return { error: "Allocation amount must be greater than zero." };
  }

  const { data: res, error } = await supabase.rpc("allocate_payment_atomic", {
    p_payment_id: paymentId,
    p_invoice_id: invoiceId,
    p_amount: roundedAmount,
  });

  if (error) {
    console.error("Error executing allocate_payment_atomic RPC:", error);
    return { error: error.message };
  }

  if (!res.success) {
    // Map safe user-friendly errors
    let msg = res.error || "Failed to allocate payment.";
    if (msg.includes("exceeds remaining payment balance")) {
      msg = "Allocation exceeds the remaining payment balance.";
    } else if (msg.includes("exceeds remaining invoice due")) {
      msg = "Payment amount exceeds the remaining invoice balance.";
    } else if (msg.includes("Cross-customer")) {
      msg = "This payment cannot be applied to the selected invoice.";
    }
    return { error: msg };
  }

  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/dashboard");

  return { success: true, allocationId: res.allocation_id };
}

export async function unallocatePayment(paymentId: string, invoiceId: string) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { data: res, error } = await supabase.rpc("unallocate_payment_atomic", {
    p_payment_id: paymentId,
    p_invoice_id: invoiceId,
  });

  if (error) {
    console.error("Error executing unallocate_payment_atomic RPC:", error);
    return { error: error.message };
  }

  if (!res.success) {
    return { error: res.error || "Failed to unallocate payment." };
  }

  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/dashboard");

  return { success: true, unallocatedAmount: res.unallocated_amount };
}

export async function voidPayment(paymentId: string) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { data: res, error } = await supabase.rpc("void_payment_atomic", {
    p_payment_id: paymentId,
  });

  if (error) {
    console.error("Error executing void_payment_atomic RPC:", error);
    return { error: error.message };
  }

  if (!res.success) {
    return { error: res.error || "Failed to void payment." };
  }

  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function refundPayment(paymentId: string) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { data: res, error } = await supabase.rpc("refund_payment_atomic", {
    p_payment_id: paymentId,
  });

  if (error) {
    console.error("Error executing refund_payment_atomic RPC:", error);
    return { error: error.message };
  }

  if (!res.success) {
    return { error: res.error || "Failed to refund payment." };
  }

  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function getDashboardBillingSummary() {
  const supabase = await createClient();
  await requireAal2(supabase);

  try {
    const today = new Date().toISOString().split("T")[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

    // Concurrently fetch invoices for receivables calculation and recorded payments for current month revenue
    const [invResult, payResult] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, status, due_date, due_amount, total_amount, paid_amount"),
      supabase
        .from("payments")
        .select("amount, payment_date, status")
        .gte("payment_date", startOfMonth)
        .eq("status", "recorded"),
    ]);

    if (invResult.error) throw invResult.error;
    if (payResult.error) throw payResult.error;

    const invoices = invResult.data;
    const payments = payResult.data;

    const activeInvoices = (invoices || []).filter((inv) => inv.status !== "cancelled");
    const draftExcludedInvoices = activeInvoices.filter((inv) => inv.status !== "draft");

    // 1. Outstanding Receivables: sum due_amount for non-draft/non-cancelled invoices
    const outstandingReceivables = draftExcludedInvoices.reduce(
      (sum, inv) => sum + Number(inv.due_amount),
      0
    );

    // 2. Paid This Month: sum of recorded payments in current month
    const paidThisMonth = (payments || []).reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    // 3. Overdue Invoices: count of due_date < today AND due_amount > 0 AND status NOT IN ('draft', 'cancelled')
    const overdueCount = draftExcludedInvoices.filter(
      (inv) => inv.due_date && inv.due_date < today && Number(inv.due_amount) > 0
    ).length;

    // 4. Open Invoices: count of issued + partially_paid invoices
    const openInvoicesCount = activeInvoices.filter(
      (inv) => inv.status === "issued" || inv.status === "partially_paid"
    ).length;

    return {
      success: true,
      data: {
        outstandingReceivables: BillingEngine.roundMoney(outstandingReceivables),
        paidThisMonth: BillingEngine.roundMoney(paidThisMonth),
        overdueCount,
        openInvoicesCount,
      },
    };
  } catch (err: unknown) {
    console.error("Error fetching dashboard billing summary:", err);
    return {
      success: false,
      data: {
        outstandingReceivables: 0,
        paidThisMonth: 0,
        overdueCount: 0,
        openInvoicesCount: 0,
      },
    };
  }
}

export interface PaymentFormCustomerOption {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  customer_code: string | null;
}

export interface PaymentFormInvoiceOption {
  id: string;
  invoice_number: string;
  due_amount: number;
  customer_id: string;
}

export async function getPaymentFormOptions(): Promise<{
  customers: PaymentFormCustomerOption[];
  openInvoices: PaymentFormInvoiceOption[];
}> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const [custRes, invRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, first_name, middle_name, last_name, customer_code")
      .is("deleted_at", null)
      .order("first_name", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_amount, customer_id")
      .gt("due_amount", 0)
      .not("status", "in", '("draft","cancelled")')
      .order("created_at", { ascending: false }),
  ]);

  if (custRes.error) {
    console.error("Error fetching payment form customers:", custRes.error);
    throw new Error(custRes.error.message);
  }

  if (invRes.error) {
    console.error("Error fetching payment form open invoices:", invRes.error);
    throw new Error(invRes.error.message);
  }

  return {
    customers: custRes.data || [],
    openInvoices: invRes.data || [],
  };
}

export interface PaymentReceiptData {
  payment: {
    id: string;
    payment_number: string;
    payment_date: string;
    amount: number;
    payment_method: PaymentMethod;
    reference_number: string | null;
    status: string;
    notes: string | null;
    created_at: string;
    voided_at?: string | null;
    void_reason?: string | null;
    refunded_at?: string | null;
    refund_reason?: string | null;
    customer: {
      id: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      customer_code: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      city: string | null;
      district: string | null;
      state: string | null;
      pincode: string | null;
    } | null;
    allocations: Array<{
      id: string;
      amount: number;
      invoice: {
        id: string;
        invoice_number: string;
        total_amount?: number;
        due_amount?: number;
      } | null;
    }>;
  };
  business: {
    business_name: string;
    legal_name?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    district?: string | null;
    state?: string | null;
    pincode?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    invoice_footer?: string | null;
  } | null;
  qrCodeSvg?: string | null;
}

export async function getPaymentReceiptData(id: string): Promise<PaymentReceiptData | null> {
  const supabase = await createClient();
  await requireAal2(supabase);

  if (!id) return null;

  const [payRes, bizRes] = await Promise.all([
    supabase
      .from("payments")
      .select(`
        id,
        payment_number,
        payment_date,
        amount,
        payment_method,
        reference_number,
        status,
        notes,
        created_at,
        voided_at,
        void_reason,
        refunded_at,
        refund_reason,
        customer:customers(
          id,
          first_name,
          middle_name,
          last_name,
          customer_code,
          phone,
          email,
          address,
          city,
          district,
          state,
          pincode
        ),
        allocations:payment_allocations(
          id,
          amount,
          invoice:invoices(
            id,
            invoice_number,
            total_amount,
            due_amount
          )
        )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("business_settings")
      .select("business_name, legal_name, address_line1, address_line2, city, district, state, pincode, phone, email, gstin, invoice_footer")
      .limit(1)
      .maybeSingle(),
  ]);

  if (payRes.error || !payRes.data) {
    console.error("Error fetching payment receipt data:", payRes.error?.message);
    return null;
  }

  // Generate server-side QR SVG for secure receipt verification navigation
  let qrCodeSvg: string | null = null;
  try {
    let baseUrl = getCanonicalAppUrl();
    if (!baseUrl && process.env.NEXT_PUBLIC_APP_URL) {
      try {
        const parsed = new URL(process.env.NEXT_PUBLIC_APP_URL);
        baseUrl = parsed.origin;
      } catch {
        // ignore malformed custom URL
      }
    }
    if (!baseUrl && process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    }
    if (!baseUrl && process.env.NODE_ENV !== "production") {
      baseUrl = "http://localhost:3000";
    }

    if (baseUrl) {
      // Safe navigation payload: ONLY the authoritative payment ID route
      const receiptNavUrl = `${baseUrl}/payments/${payRes.data.id}/receipt`;
      qrCodeSvg = await QRCode.toString(receiptNavUrl, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
    }
  } catch (qrErr) {
    // Fail-safe: QR failure must not prevent viewing or printing the receipt
    console.error("Failed to generate payment receipt QR code:", qrErr);
    qrCodeSvg = null;
  }

  return {
    payment: payRes.data as unknown as PaymentReceiptData["payment"],
    business: bizRes.data || null,
    qrCodeSvg,
  };
}
