"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";
import {
  analyzeWithdrawalReceipt,
  ExtractedWithdrawalReceipt,
  formatWithdrawalWhatsAppMessage,
} from "@/lib/receipts/receiptAnalyzer";
import { normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";
import { sendWhatsAppText } from "@/lib/whatsapp/openwaClient";

export async function analyzeReceiptUploadAction(formData: FormData): Promise<{
  receipt?: ExtractedWithdrawalReceipt;
  previewMessage?: string;
  error?: string;
}> {
  const supabase = await createClient();
  await requireAal2(supabase);

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
    return { receipt, previewMessage };
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
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
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
        created_by: user.id,
      });
    }

    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to send WhatsApp receipt.",
    };
  }
}
