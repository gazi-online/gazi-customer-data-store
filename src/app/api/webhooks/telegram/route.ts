import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import {
  analyzeWithdrawalReceipt,
  analyzeWithdrawalReceiptText,
  extractPhoneFromUpiOrText,
  formatWithdrawalWhatsAppMessage,
} from "@/lib/receipts/receiptAnalyzer";
import { normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";
import { sendWhatsAppText } from "@/lib/whatsapp/openwaClient";

function getTelegramToken(): string {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

async function sendTelegramReply(chatId: number | string, text: string) {
  const token = getTelegramToken();
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

async function downloadTelegramFile(fileId: string): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
}> {
  const token = getTelegramToken();
  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const metaJson = (await metaRes.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };

  const filePath = metaJson?.result?.file_path;
  if (!metaJson.ok || !filePath) {
    throw new Error("Could not resolve Telegram file path");
  }

  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileRes.ok) {
    throw new Error(`Failed to download Telegram file (${fileRes.status})`);
  }

  const arrayBuf = await fileRes.arrayBuffer();
  const filename = filePath.split("/").pop() || "receipt.jpg";
  const lower = filename.toLowerCase();
  const mimeType = lower.endsWith(".pdf")
    ? "application/pdf"
    : lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";

  return {
    buffer: Buffer.from(arrayBuf),
    filename,
    mimeType,
  };
}

async function logReceiptWhatsAppToCustomer(params: {
  phone10: string | null;
  waPhone: string | null;
  message: string | null;
  whatsappSent: boolean;
  whatsappMessageId?: string | null;
  whatsappError?: string | null;
  extracted: {
    status: string;
    customerName: string | null;
    amount: string | null;
    rrnNumber: string | null;
    upiId: string | null;
    provider?: string | null;
    rawText?: string | null;
  };
  filename?: string | null;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const supabase = createSupabaseAdmin(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: bizSettings } = await supabase
    .from("business_settings")
    .select("business_id")
    .limit(1)
    .maybeSingle();

  const parsedAmount = params.extracted.amount
    ? Number(String(params.extracted.amount).replace(/,/g, ""))
    : null;

  await supabase.from("receipt_transactions").insert({
    business_id: bizSettings?.business_id || null,
    source: "telegram",
    filename: params.filename || null,
    provider: params.extracted.provider || null,
    tx_status: params.extracted.status || "unknown",
    customer_name: params.extracted.customerName || null,
    amount: parsedAmount !== null && !Number.isNaN(parsedAmount) ? parsedAmount : null,
    rrn_number: params.extracted.rrnNumber || null,
    upi_id: params.extracted.upiId || null,
    extracted_phone: params.phone10 || null,
    raw_text: params.extracted.rawText ? params.extracted.rawText.slice(0, 4000) : null,
    whatsapp_sent: params.whatsappSent,
    whatsapp_phone: params.waPhone || null,
    whatsapp_message: params.message || null,
    whatsapp_message_id: params.whatsappMessageId || null,
    whatsapp_sent_at: params.whatsappSent ? new Date().toISOString() : null,
    whatsapp_error: params.whatsappError || null,
  });

  if (!params.phone10 || !params.whatsappSent || !params.message) return;

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .is("deleted_at", null)
    .ilike("phone", `%${params.phone10}%`)
    .limit(1)
    .single();

  if (customer?.id) {
    await supabase.from("customer_communications").insert({
      customer_id: customer.id,
      channel: "whatsapp",
      direction: "outbound",
      template_key: "aeps_upi_receipt",
      message_snapshot: params.message.slice(0, 500),
      outcome: "contacted",
      notes: `Auto-sent via Telegram Receipt Bot${params.extracted.rrnNumber ? ` (RRN: ${params.extracted.rrnNumber})` : ""}`,
    });
  }
}

export async function POST(request: NextRequest) {
  const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (expectedSecret) {
    const incomingSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (incomingSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let update: {
    message?: {
      chat?: { id: number };
      text?: string;
      caption?: string;
      photo?: Array<{ file_id: string }>;
      document?: { file_id: string; file_name?: string; mime_type?: string };
    };
  };

  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const msg = update?.message;
  const chatId = msg?.chat?.id;
  if (!msg || !chatId) {
    return NextResponse.json({ ok: true });
  }

  // Optional allowlist check
  const allowedRaw = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "").trim();
  if (allowedRaw) {
    const allowedSet = new Set(allowedRaw.split(",").map((s) => s.trim()).filter(Boolean));
    if (!allowedSet.has(String(chatId))) {
      await sendTelegramReply(chatId, "⛔ Unauthorized Telegram chat ID.");
      return NextResponse.json({ ok: true });
    }
  }

  try {
    if (msg.text === "/start") {
      await sendTelegramReply(
        chatId,
        "👋 *Gazi Online AEPS / UPI Receipt Bot*\n\nSend any AEPS or UPI Cash Withdrawal receipt photo/PDF (or paste receipt text). I will extract Customer Name, RRN, Amount, and Mobile from UPI ID, and send the WhatsApp receipt automatically!\n\n_Tip: You can also write a 10-digit mobile number in the caption as a fallback._"
      );
      return NextResponse.json({ ok: true });
    }

    let extracted;
    if (msg.photo && msg.photo.length > 0) {
      const bestPhoto = msg.photo[msg.photo.length - 1];
      const file = await downloadTelegramFile(bestPhoto.file_id);
      extracted = await analyzeWithdrawalReceipt(file);
    } else if (msg.document?.file_id) {
      const file = await downloadTelegramFile(msg.document.file_id);
      extracted = await analyzeWithdrawalReceipt({
        buffer: file.buffer,
        filename: msg.document.file_name || file.filename,
        mimeType: msg.document.mime_type || file.mimeType,
      });
    } else if (msg.text && msg.text.trim().length > 10) {
      extracted = analyzeWithdrawalReceiptText(msg.text);
    } else {
      await sendTelegramReply(
        chatId,
        "📄 Please send a receipt *photo*, *PDF*, or *text* to analyze and send on WhatsApp."
      );
      return NextResponse.json({ ok: true });
    }

    // Allow caption phone override/fallback
    const captionPhone = msg.caption
      ? extractPhoneFromUpiOrText(null, msg.caption)
      : null;
    const phone10 = extracted.extractedPhone || captionPhone;
    const waPhone = normalizeWhatsAppPhone(phone10);

    if (!waPhone || !phone10) {
      await logReceiptWhatsAppToCustomer({
        phone10: null,
        waPhone: null,
        message: null,
        whatsappSent: false,
        whatsappError: "Mobile number not found in receipt or caption",
        extracted,
        filename: msg.document?.file_name || "telegram-receipt",
      });
      await sendTelegramReply(
        chatId,
        [
          "⚠️ *Receipt Analyzed — Mobile Number Not Found*",
          "",
          `• Status: ${extracted.status}`,
          `• Name: ${extracted.customerName || "—"}`,
          `• Amount: ${extracted.amount ? `₹${extracted.amount}` : "—"}`,
          `• RRN: ${extracted.rrnNumber || "—"}`,
          `• UPI ID: ${extracted.upiId || "—"}`,
          "",
          "Please resend the photo with the customer's 10-digit mobile number in the caption, or upload it in the Portal.",
        ].join("\n")
      );
      return NextResponse.json({ ok: true });
    }

    const waMessage = formatWithdrawalWhatsAppMessage(extracted);
    const waResult = await sendWhatsAppText({ phone: waPhone, text: waMessage });
    await logReceiptWhatsAppToCustomer({
      phone10,
      waPhone,
      message: waMessage,
      whatsappSent: true,
      whatsappMessageId: waResult?.id || null,
      extracted,
      filename: msg.document?.file_name || "telegram-receipt",
    });

    await sendTelegramReply(
      chatId,
      [
        "✅ *WhatsApp Receipt Sent!*",
        "",
        `• To: \`${phone10}\``,
        `• Name: ${extracted.customerName || "—"}`,
        `• Amount: ${extracted.amount ? `₹${extracted.amount}` : "—"}`,
        `• RRN: ${extracted.rrnNumber || "—"}`,
        `• UPI ID: ${extracted.upiId || "—"}`,
      ].join("\n")
    );
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    await sendTelegramReply(
      chatId,
      `❌ Failed to process receipt: ${err instanceof Error ? err.message : "Unknown error"}`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
