import { GoogleGenAI } from "@google/genai";
import { normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";

export interface ExtractedWithdrawalReceipt {
  status: "success" | "failed" | "pending" | "unknown";
  transactionType: string;
  customerName: string | null;
  amount: string | null;
  rrnNumber: string | null;
  upiId: string | null;
  extractedPhone: string | null;
  bankOrPortal: string | null;
  dateTime: string | null;
  rawText: string;
  provider: "gemini" | "ocr_space" | "text_parser";
}

/**
 * Extracts a 10-digit Indian mobile number from a UPI ID (e.g. 9876543210@ybl, 919876543210@paytm)
 * or falls back to explicit mobile numbers in receipt text.
 */
export function extractPhoneFromUpiOrText(
  upiId: string | null | undefined,
  rawText?: string | null
): string | null {
  if (upiId) {
    const localPart = upiId.split("@")[0] || "";
    const digitsOnly = localPart.replace(/\D/g, "");
    // Match 91XXXXXXXXXX or XXXXXXXXXX starting with 6-9
    const match12 = digitsOnly.match(/91([6-9]\d{9})/);
    if (match12) return match12[1];
    const match10 = digitsOnly.match(/([6-9]\d{9})/);
    if (match10) return match10[1];
  }

  if (rawText) {
    // Look for labeled phone/mobile first
    const labeledMatch = rawText.match(
      /(?:mob(?:ile)?|phone|contact|cust(?:omer)?\s*no\.?|whatsapp)\s*[:\-]?\s*(?:\+?91[\s-]?)?([6-9]\d{9})\b/i
    );
    if (labeledMatch) return labeledMatch[1];

    // Look for any standalone 10-digit Indian mobile (excluding 12-digit RRNs)
    const standaloneMatches = rawText.match(/(?<!\d)(?:\+?91[\s-]?)?([6-9]\d{9})(?!\d)/g);
    if (standaloneMatches && standaloneMatches.length > 0) {
      const cleaned = standaloneMatches[0].replace(/\D/g, "").slice(-10);
      if (/^[6-9]\d{9}$/.test(cleaned)) return cleaned;
    }
  }

  return null;
}

export function formatWithdrawalWhatsAppMessage(
  receipt: ExtractedWithdrawalReceipt,
  shopName = "GAZI ONLINE"
): string {
  const statusEmoji =
    receipt.status === "success" ? "✅" : receipt.status === "failed" ? "❌" : "ℹ️";
  const statusLabel =
    receipt.status === "success"
      ? "Cash Withdrawal Successful!"
      : receipt.status === "failed"
        ? "Transaction Failed"
        : "Transaction Receipt";

  const lines = [
    `🌐 *${shopName.toUpperCase()}*`,
    "",
    `${statusEmoji} *${statusLabel}*`,
    "",
    `💳 Type: ${receipt.transactionType || "AEPS / UPI Cash Withdrawal"}`,
  ];

  if (receipt.customerName) lines.push(`👤 Customer: ${receipt.customerName}`);
  if (receipt.amount) lines.push(`💰 Amount: ₹${receipt.amount}`);
  if (receipt.rrnNumber) lines.push(`🧾 RRN / UTR: ${receipt.rrnNumber}`);
  if (receipt.upiId) lines.push(`📲 UPI ID: ${receipt.upiId}`);
  if (receipt.bankOrPortal) lines.push(`🏦 Bank / Portal: ${receipt.bankOrPortal}`);
  if (receipt.dateTime) lines.push(`🕒 Date & Time: ${receipt.dateTime}`);

  lines.push("", "🙏 Thank you for visiting us!");
  return lines.join("\n");
}

function parseReceiptTextHeuristics(
  rawText: string,
  provider: "ocr_space" | "text_parser"
): ExtractedWithdrawalReceipt {
  const text = rawText || "";
  const lower = text.toLowerCase();

  let status: ExtractedWithdrawalReceipt["status"] = "unknown";
  if (/\b(success|successful|completed|approved|credited|debited)\b/i.test(text)) {
    status = "success";
  } else if (/\b(failed|failure|declined|rejected|error)\b/i.test(text)) {
    status = "failed";
  } else if (/\b(pending|processing|initiated)\b/i.test(text)) {
    status = "pending";
  }

  const transactionType = lower.includes("aeps")
    ? "AEPS Cash Withdrawal"
    : lower.includes("upi")
      ? "UPI Cash Withdrawal"
      : lower.includes("withdraw")
        ? "Cash Withdrawal"
        : "AEPS / UPI Cash Withdrawal";

  // RRN / UTR (12 digits typically)
  const rrnMatch =
    text.match(/(?:rrn|utr|ref(?:erence)?\s*(?:no|id|number)?|txn\s*id)\s*[:\-#]?\s*([A-Z0-9]{10,22})/i) ||
    text.match(/\b(\d{12})\b/);
  const rrnNumber = rrnMatch ? rrnMatch[1].trim() : null;

  // UPI ID
  const upiMatch = text.match(/\b([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32})\b/);
  const upiId = upiMatch ? upiMatch[1].trim() : null;

  // Amount
  const amountMatch =
    text.match(/(?:amount|amt|rs\.?|inr|₹)\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/₹\s*([\d,]+(?:\.\d{1,2})?)/);
  const amount = amountMatch ? amountMatch[1].replace(/,/g, "") : null;

  // Customer Name
  const nameMatch = text.match(
    /(?:customer\s*name|cust\.?\s*name|name|beneficiary|a\/c\s*holder|paid\s*by|from)\s*[:\-]\s*([A-Za-z][A-Za-z\s.]{2,45})/i
  );
  const customerName = nameMatch
    ? nameMatch[1].split(/\r?\n/)[0].trim()
    : null;

  // Bank / Portal
  const bankMatch = text.match(
    /(?:bank\s*name|bank|portal)\s*[:\-]\s*([A-Za-z][A-Za-z\s.&]{2,40})/i
  );
  const bankOrPortal = bankMatch ? bankMatch[1].split(/\r?\n/)[0].trim() : null;

  // Date & Time
  const dateMatch = text.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)/i
  );
  const dateTime = dateMatch ? dateMatch[1].trim() : null;

  const extractedPhone = extractPhoneFromUpiOrText(upiId, text);

  return {
    status,
    transactionType,
    customerName,
    amount,
    rrnNumber,
    upiId,
    extractedPhone,
    bankOrPortal,
    dateTime,
    rawText: text,
    provider,
  };
}

async function analyzeWithGemini(
  base64Data: string,
  mimeType: string
): Promise<ExtractedWithdrawalReceipt | null> {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are an Indian AEPS / UPI Cash Withdrawal receipt analyzer.
Extract the following fields from this receipt image/PDF and return ONLY valid JSON:
{
  "status": "success" | "failed" | "pending" | "unknown",
  "transactionType": "string (e.g. AEPS Cash Withdrawal or UPI Cash Withdrawal)",
  "customerName": "string or null",
  "amount": "numeric string without currency symbol or null",
  "rrnNumber": "12-digit RRN/UTR or transaction reference or null",
  "upiId": "full UPI ID like 9876543210@ybl or null",
  "mobileNumber": "10-digit mobile number if visible on receipt or inside UPI ID, or null",
  "bankOrPortal": "bank or AEPS portal name or null",
  "dateTime": "date and time string or null",
  "rawText": "concise transcription of key receipt lines"
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { inlineData: { data: base64Data, mimeType } },
      prompt,
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  const textOut = response.text || "";
  const parsed = JSON.parse(textOut) as Record<string, unknown>;

  const upiId = typeof parsed.upiId === "string" ? parsed.upiId.trim() : null;
  const rawText = typeof parsed.rawText === "string" ? parsed.rawText : "";
  const explicitMob =
    typeof parsed.mobileNumber === "string"
      ? normalizeWhatsAppPhone(parsed.mobileNumber)?.slice(-10) || null
      : null;

  const extractedPhone = explicitMob || extractPhoneFromUpiOrText(upiId, rawText);

  return {
    status: (["success", "failed", "pending", "unknown"].includes(String(parsed.status))
      ? parsed.status
      : "unknown") as ExtractedWithdrawalReceipt["status"],
    transactionType:
      typeof parsed.transactionType === "string" && parsed.transactionType
        ? parsed.transactionType
        : "AEPS / UPI Cash Withdrawal",
    customerName: typeof parsed.customerName === "string" ? parsed.customerName : null,
    amount: typeof parsed.amount === "string" || typeof parsed.amount === "number"
      ? String(parsed.amount)
      : null,
    rrnNumber: typeof parsed.rrnNumber === "string" ? parsed.rrnNumber : null,
    upiId,
    extractedPhone,
    bankOrPortal: typeof parsed.bankOrPortal === "string" ? parsed.bankOrPortal : null,
    dateTime: typeof parsed.dateTime === "string" ? parsed.dateTime : null,
    rawText,
    provider: "gemini",
  };
}

async function analyzeWithOcrSpace(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ExtractedWithdrawalReceipt> {
  const apiKey = (process.env.OCR_SPACE_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Neither GEMINI_API_KEY nor OCR_SPACE_API_KEY is configured.");
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("file", blob, filename);
  formData.append("apikey", apiKey);
  formData.append("language", "eng");
  formData.append("OCREngine", "2");
  formData.append("scale", "true");

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`OCR.space HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string[] | string;
    ParsedResults?: Array<{ ParsedText?: string }>;
  };

  if (data.IsErroredOnProcessing) {
    const errMsg = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join("; ")
      : data.ErrorMessage || "OCR processing failed";
    throw new Error(errMsg);
  }

  const parsedText = (data.ParsedResults || [])
    .map((r) => r.ParsedText || "")
    .join("\n")
    .trim();

  return parseReceiptTextHeuristics(parsedText, "ocr_space");
}

export async function analyzeWithdrawalReceipt(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<ExtractedWithdrawalReceipt> {
  try {
    const geminiResult = await analyzeWithGemini(
      params.buffer.toString("base64"),
      params.mimeType
    );
    if (geminiResult) {
      return geminiResult;
    }
  } catch (err) {
    console.warn("[analyzeWithdrawalReceipt] Gemini failed, falling back to OCR.space:", err);
  }

  return analyzeWithOcrSpace(params.buffer, params.filename, params.mimeType);
}

export function analyzeWithdrawalReceiptText(rawText: string): ExtractedWithdrawalReceipt {
  return parseReceiptTextHeuristics(rawText, "text_parser");
}
