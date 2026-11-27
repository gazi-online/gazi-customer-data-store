import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import {
  analyzeWithdrawalReceipt,
  analyzeWithdrawalReceiptText,
  ExtractedWithdrawalReceipt,
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

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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

async function logCustomerCommunication(params: {
  phone10: string;
  message: string;
  rrnNumber: string | null;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

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
      notes: `Auto-sent via Telegram Receipt Bot${params.rrnNumber ? ` (RRN: ${params.rrnNumber})` : ""}`,
    });
  }
}

async function saveTelegramReceiptTransaction(params: {
  chatId: number | string;
  phone10: string | null;
  waPhone: string | null;
  message: string | null;
  whatsappSent: boolean;
  whatsappMessageId?: string | null;
  whatsappError?: string | null;
  extracted: ExtractedWithdrawalReceipt;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

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
    filename: `tg_chat:${params.chatId}`,
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

  if (params.phone10 && params.whatsappSent && params.message) {
    await logCustomerCommunication({
      phone10: params.phone10,
      message: params.message,
      rrnNumber: params.extracted.rrnNumber,
    });
  }
}

function isPhoneReplyMessage(text: string): string | null {
  const trimmed = text.trim();
  // Receipt texts are longer or contain receipt keywords like RRN, UTR, Amount, Status, @
  const hasReceiptKeywords =
    /\b(rrn|utr|amount|status|withdrawal|transaction|payee|payer|order\s*id|balance)\b/i.test(
      trimmed
    ) ||
    trimmed.includes("@") ||
    trimmed.includes("₹") ||
    trimmed.length > 80;

  if (hasReceiptKeywords) return null;
  return extractPhoneFromUpiOrText(null, trimmed);
}

async function findAndCompletePendingReceiptForChat(params: {
  chatId: number | string;
  phone10: string;
  waPhone: string;
}): Promise<{
  found: boolean;
  extracted?: ExtractedWithdrawalReceipt;
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { found: false };

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: pending } = await supabase
    .from("receipt_transactions")
    .select("*")
    .eq("source", "telegram")
    .eq("filename", `tg_chat:${params.chatId}`)
    .eq("whatsapp_sent", false)
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { found: false };
  }

  const extracted: ExtractedWithdrawalReceipt = {
    status: (pending.tx_status as ExtractedWithdrawalReceipt["status"]) || "success",
    customerName: pending.customer_name || null,
    amount: pending.amount !== null && pending.amount !== undefined ? String(pending.amount) : null,
    rrnNumber: pending.rrn_number || null,
    upiId: pending.upi_id || null,
    extractedPhone: params.phone10,
    rawText: pending.raw_text || "",
    provider: (pending.provider as ExtractedWithdrawalReceipt["provider"]) || "ocr_space",
  };

  const waMessage = formatWithdrawalWhatsAppMessage(extracted);
  const waResult = await sendWhatsAppText({ phone: params.waPhone, text: waMessage });

  await supabase
    .from("receipt_transactions")
    .update({
      extracted_phone: params.phone10,
      whatsapp_sent: true,
      whatsapp_phone: params.waPhone,
      whatsapp_message: waMessage,
      whatsapp_message_id: waResult?.id || null,
      whatsapp_sent_at: new Date().toISOString(),
      whatsapp_error: null,
    })
    .eq("id", pending.id);

  await logCustomerCommunication({
    phone10: params.phone10,
    message: waMessage,
    rrnNumber: extracted.rrnNumber,
  });

  return { found: true, extracted };
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
        "👋 *Gazi Online AEPS / UPI Receipt Bot*\n\nSend any AEPS or UPI Cash Withdrawal receipt photo/PDF (or paste receipt text). I will extract Customer Name, RRN, Amount, and Mobile from UPI ID, and send the WhatsApp receipt automatically!\n\n_If a UPI ID doesn't contain a mobile number (like `@oksbi`), just reply with the customer's 10-digit mobile number in the next message._"
      );
      return NextResponse.json({ ok: true });
    }

    // Check if user is replying with a 10-digit mobile number for a pending receipt
    if (msg.text && !msg.photo && !msg.document) {
      const replyPhone10 = isPhoneReplyMessage(msg.text);
      if (replyPhone10) {
        const waPhone = normalizeWhatsAppPhone(replyPhone10);
        if (waPhone) {
          const completed = await findAndCompletePendingReceiptForChat({
            chatId,
            phone10: replyPhone10,
            waPhone,
          });

          if (completed.found && completed.extracted) {
            await sendTelegramReply(
              chatId,
              [
                "✅ *WhatsApp Receipt Sent!*",
                "",
                `• To: \`${replyPhone10}\``,
                `• Name: ${completed.extracted.customerName || "—"}`,
                `• Amount: ${completed.extracted.amount ? `₹${completed.extracted.amount}` : "—"}`,
                `• RRN: ${completed.extracted.rrnNumber || "—"}`,
                `• UPI ID: ${completed.extracted.upiId || "—"}`,
              ].join("\n")
            );
            return NextResponse.json({ ok: true });
          }

          await sendTelegramReply(
            chatId,
            "⚠️ No pending receipt found from the last 1 hour. Please send the receipt photo/PDF first (or include the 10-digit mobile number in the caption)."
          );
          return NextResponse.json({ ok: true });
        }
      }
    }

    let extracted: ExtractedWithdrawalReceipt;
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
      // Guard against sending blank receipts for random text messages
      if (
        !extracted.amount &&
        !extracted.rrnNumber &&
        !extracted.upiId &&
        !extracted.customerName
      ) {
        await sendTelegramReply(
          chatId,
          "📄 Could not detect receipt details from that message. Please send a receipt *photo*, *PDF*, or full receipt text."
        );
        return NextResponse.json({ ok: true });
      }
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
      const previewMessage = formatWithdrawalWhatsAppMessage(extracted);
      await saveTelegramReceiptTransaction({
        chatId,
        phone10: null,
        waPhone: null,
        message: previewMessage,
        whatsappSent: false,
        whatsappError: null,
        extracted,
      });
      await sendTelegramReply(
        chatId,
        [
          "⚠️ *Mobile Number Not Found in UPI ID*",
          "",
          `• Status: ${extracted.status}`,
          `• Name: ${extracted.customerName || "—"}`,
          `• Amount: ${extracted.amount ? `₹${extracted.amount}` : "—"}`,
          `• RRN: ${extracted.rrnNumber || "—"}`,
          `• UPI ID: ${extracted.upiId || "—"}`,
          "",
          "📱 *Reply with the customer's 10-digit mobile number* (e.g. `9333561943`) to send this WhatsApp receipt now.",
        ].join("\n")
      );
      return NextResponse.json({ ok: true });
    }

    const waMessage = formatWithdrawalWhatsAppMessage(extracted);
    const waResult = await sendWhatsAppText({ phone: waPhone, text: waMessage });
    await saveTelegramReceiptTransaction({
      chatId,
      phone10,
      waPhone,
      message: waMessage,
      whatsappSent: true,
      whatsappMessageId: waResult?.id || null,
      extracted,
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
