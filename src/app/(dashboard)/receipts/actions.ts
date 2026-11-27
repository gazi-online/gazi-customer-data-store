"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";
import {
  analyzeWithdrawalReceipt,
  ExtractedWithdrawalReceipt,
  formatWithdrawalWhatsAppMessage,
} from "@/lib/receipts/receiptAnalyzer";
import { normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";
import { sendWhatsAppText } from "@/lib/whatsapp/openwaClient";

export interface ReceiptTransactionRow {
  id: string;
  business_id: string | null;
  source: "portal" | "telegram";
  filename: string | null;
  provider: string | null;
  tx_status: string;
  customer_name: string | null;
  amount: number | null;
  rrn_number: string | null;
  upi_id: string | null;
  extracted_phone: string | null;
  whatsapp_sent: boolean;
  whatsapp_phone: string | null;
  whatsapp_message: string | null;
  whatsapp_message_id: string | null;
  whatsapp_sent_at: string | null;
  whatsapp_error: string | null;
  created_at: string;
}

export interface ReceiptHistorySummary {
  totalCount: number;
  totalAmount: number;
  whatsappSentCount: number;
  whatsappPendingCount: number;
}

async function getCallerMembership(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("business_memberships")
    .select("business_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership?.business_id) return null;
  return { userId: user.id, businessId: membership.business_id as string };
}

export async function getReceiptTransactionsAction(filters?: {
  search?: string;
  whatsappFilter?: "all" | "sent" | "pending";
}): Promise<{
  transactions: ReceiptTransactionRow[];
  summary: ReceiptHistorySummary;
  error?: string;
}> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerMembership(supabase);
  if (!auth) {
    return {
      transactions: [],
      summary: { totalCount: 0, totalAmount: 0, whatsappSentCount: 0, whatsappPendingCount: 0 },
      error: "Active business membership required",
    };
  }

  const { data, error } = await supabase
    .from("receipt_transactions")
    .select(
      "id, business_id, source, filename, provider, tx_status, customer_name, amount, rrn_number, upi_id, extracted_phone, whatsapp_sent, whatsapp_phone, whatsapp_message, whatsapp_message_id, whatsapp_sent_at, whatsapp_error, created_at"
    )
    .or(`business_id.eq.${auth.businessId},business_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    return {
      transactions: [],
      summary: { totalCount: 0, totalAmount: 0, whatsappSentCount: 0, whatsappPendingCount: 0 },
      error: error.message,
    };
  }

  const allRows = (data || []) as ReceiptTransactionRow[];

  const summary: ReceiptHistorySummary = {
    totalCount: allRows.length,
    totalAmount: allRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    whatsappSentCount: allRows.filter((r) => r.whatsapp_sent).length,
    whatsappPendingCount: allRows.filter((r) => !r.whatsapp_sent).length,
  };

  let filtered = allRows;
  if (filters?.whatsappFilter === "sent") {
    filtered = filtered.filter((r) => r.whatsapp_sent);
  } else if (filters?.whatsappFilter === "pending") {
    filtered = filtered.filter((r) => !r.whatsapp_sent);
  }

  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.rrn_number || "").toLowerCase().includes(q) ||
        (r.upi_id || "").toLowerCase().includes(q) ||
        (r.whatsapp_phone || r.extracted_phone || "").toLowerCase().includes(q)
    );
  }

  return { transactions: filtered, summary };
}

export async function analyzeReceiptUploadAction(formData: FormData): Promise<{
  receipt?: ExtractedWithdrawalReceipt;
  previewMessage?: string;
  transactionId?: string;
  error?: string;
}> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerMembership(supabase);
  if (!auth) {
    return { error: "Active business membership required" };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Please select a receipt image or PDF file." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File size must be under 10 MB." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const [{ data: settings }, receipt] = await Promise.all([
      supabase.from("business_settings").select("business_name").limit(1).single(),
      analyzeWithdrawalReceipt({
        buffer,
        filename: file.name || "receipt.jpg",
        mimeType: file.type || "image/jpeg",
      }),
    ]);

    const shopName = settings?.business_name || "GAZI ONLINE";
    const previewMessage = formatWithdrawalWhatsAppMessage(receipt, shopName);

    const parsedAmount = receipt.amount ? Number(String(receipt.amount).replace(/,/g, "")) : null;

    const { data: inserted } = await supabase
      .from("receipt_transactions")
      .insert({
        business_id: auth.businessId,
        source: "portal",
        filename: file.name || "receipt.jpg",
        provider: receipt.provider || null,
        tx_status: receipt.status || "unknown",
        customer_name: receipt.customerName || null,
        amount: parsedAmount !== null && !Number.isNaN(parsedAmount) ? parsedAmount : null,
        rrn_number: receipt.rrnNumber || null,
        upi_id: receipt.upiId || null,
        extracted_phone: receipt.extractedPhone || null,
        raw_text: receipt.rawText ? receipt.rawText.slice(0, 4000) : null,
        whatsapp_sent: false,
        whatsapp_message: previewMessage,
        created_by: auth.userId,
      })
      .select("id")
      .single();

    revalidatePath("/receipts");
    return { receipt, previewMessage, transactionId: inserted?.id };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to analyze receipt.",
    };
  }
}

export async function sendWithdrawalReceiptWhatsAppAction(params: {
  phone: string;
  message: string;
  rrnNumber?: string | null;
  transactionId?: string | null;
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerMembership(supabase);
  if (!auth) {
    return { error: "Authentication required" };
  }

  const normalized = normalizeWhatsAppPhone(params.phone);
  if (!normalized) {
    return { error: "Please enter a valid 10-digit Indian mobile number." };
  }

  const text = params.message.trim();
  if (!text) {
    return { error: "Message cannot be empty." };
  }

  try {
    const result = await sendWhatsAppText({ phone: normalized, text });
    const sentAt = new Date().toISOString();

    if (params.transactionId) {
      await supabase
        .from("receipt_transactions")
        .update({
          whatsapp_sent: true,
          whatsapp_phone: normalized,
          whatsapp_message: text,
          whatsapp_message_id: result?.id || null,
          whatsapp_sent_at: sentAt,
          whatsapp_error: null,
        })
        .eq("id", params.transactionId);
    } else {
      await supabase.from("receipt_transactions").insert({
        business_id: auth.businessId,
        source: "portal",
        tx_status: "success",
        rrn_number: params.rrnNumber || null,
        extracted_phone: normalized.slice(-10),
        whatsapp_sent: true,
        whatsapp_phone: normalized,
        whatsapp_message: text,
        whatsapp_message_id: result?.id || null,
        whatsapp_sent_at: sentAt,
        created_by: auth.userId,
      });
    }

    // Log into customer_communications if matching customer exists
    const local10 = normalized.slice(-10);
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .is("deleted_at", null)
      .ilike("phone", `%${local10}%`)
      .limit(1)
      .single();

    if (customer?.id) {
      await supabase.from("customer_communications").insert({
        customer_id: customer.id,
        channel: "whatsapp",
        direction: "outbound",
        template_key: "aeps_upi_receipt",
        message_snapshot: text.slice(0, 500),
        outcome: "contacted",
        notes: `AEPS/UPI receipt sent via Portal${params.rrnNumber ? ` (RRN: ${params.rrnNumber})` : ""}${result?.id ? ` [ID: ${result.id}]` : ""}`,
        created_by: auth.userId,
      });
    }

    revalidatePath("/receipts");
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Failed to send WhatsApp receipt.";
    if (params.transactionId) {
      await supabase
        .from("receipt_transactions")
        .update({
          whatsapp_phone: normalized,
          whatsapp_message: text,
          whatsapp_error: errMsg,
        })
        .eq("id", params.transactionId);
      revalidatePath("/receipts");
    }
    return { error: errMsg };
  }
}
