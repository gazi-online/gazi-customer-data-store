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
 * Extracts a 10-digit Indian mobile number from a UPI ID (e.g. 9749383710-z2da@axl, 9876543210@ybl)
 * or falls back to explicit customer mobile numbers in receipt text (skipping CSP/Agent mobile).
 */
export function extractPhoneFromUpiOrText(
  upiId: string | null | undefined,
  rawText?: string | null
): string | null {
  if (upiId) {
    const localPart = upiId.split("@")[0] || "";
    // Match 91XXXXXXXXXX or XXXXXXXXXX starting with 6-9 (even if followed by -z2da etc.)
    const match12 = localPart.match(/(?:^|\D)91([6-9]\d{9})(?:\D|$)/);
    if (match12) return match12[1];
    const match10 = localPart.match(/(?:^|\D)([6-9]\d{9})(?:\D|$)/);
    if (match10) return match10[1];
  }

  if (rawText) {
    // 1. Prefer Payer VPA / Customer VPA in raw text
    const payerVpaMatch = rawText.match(
      /(?:payer\s*vpa|customer\s*upi|sender\s*vpa|upi\s*id)\s*[:\-]?\s*([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9]{2,32})/i
    );
    if (payerVpaMatch) {
      const fromPayer = extractPhoneFromUpiOrText(payerVpaMatch[1], null);
      if (fromPayer) return fromPayer;
    }

    // 2. Check all UPI IDs in text for an embedded 10-digit mobile number
    const allUpis = rawText.match(/\b[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9]{2,32}\b/g) || [];
    for (const u of allUpis) {
      const fromU = extractPhoneFromUpiOrText(u, null);
      if (fromU) return fromU;
    }

    // 3. Look for labeled customer phone/mobile (explicitly exclude CSP / Agent / Merchant mobile)
    const lines = rawText.split(/\r?\n/);
    for (const line of lines) {
      if (/\b(?:csp|agent|merchant|retailer|shop|helpline|support|toll)\b/i.test(line)) {
        continue;
      }
      const labeledMatch = line.match(
        /(?:cust(?:omer)?\s*(?:mob(?:ile)?|phone|no\.?)|payer\s*(?:mob|phone)|mob(?:ile)?|phone|contact|whatsapp)\s*[:\-]?\s*(?:\+?91[\s-]?)?([6-9]\d{9})\b/i
      );
      if (labeledMatch) return labeledMatch[1];
    }

    // 4. Standalone 10-digit mobile not on a CSP/Merchant/RRN line
    for (const line of lines) {
      if (/\b(?:csp|agent|merchant|rrn|utr|order|txn|transaction)\b/i.test(line)) {
        continue;
      }
      const m = line.match(/(?<!\d)(?:\+?91[\s-]?)?([6-9]\d{9})(?!\d)/);
      if (m) return m[1];
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

/**
 * Extracts a field value that may be on the same line (after tab/spaces/colon)
 * or on the immediately following line.
 */
function extractFieldAcrossLines(lines: string[], labelRegex: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(labelRegex);
    if (!match) continue;

    // Value on same line after label
    const sameLineRest = line.slice((match.index || 0) + match[0].length).replace(/^[\s:\-]+/, "").trim();
    if (sameLineRest) {
      return sameLineRest;
    }

    // Value on next non-empty line
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = lines[j].trim();
      if (nextLine) return nextLine;
    }
  }
  return null;
}

export function parseReceiptTextHeuristics(
  rawText: string,
  provider: "ocr_space" | "text_parser"
): ExtractedWithdrawalReceipt {
  const text = rawText || "";
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

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

  // RRN / UTR (12 digits typically, or Transaction Id)
  const rrnField = extractFieldAcrossLines(lines, /^(?:rrn|utr(?:\s*no\.?)?|ref(?:erence)?\s*(?:no|id|number)?)\b/i);
  const rrnFromField = rrnField?.match(/([A-Z0-9]{10,22})/i)?.[1] || null;
  const rrnFallback = text.match(/\b(\d{12})\b/)?.[1] || null;
  const rrnNumber = rrnFromField || rrnFallback;

  // UPI ID: strongly prefer Payer VPA (customer) over Payee VPA (merchant)
  const payerVpaField = extractFieldAcrossLines(lines, /^(?:payer\s*vpa|customer\s*vpa|customer\s*upi|sender\s*vpa)\b/i);
  const payerUpi = payerVpaField?.match(/([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9]{2,32})/)?.[1] || null;
  const allUpis = text.match(/\b[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9]{2,32}\b/g) || [];
  // If payerUpi isn't labeled, pick any UPI ID that contains a 10-digit mobile, else first UPI ID
  const mobileUpi = allUpis.find((u) => extractPhoneFromUpiOrText(u, null) !== null) || null;
  const upiId = payerUpi || mobileUpi || allUpis[0] || null;

  // Amount (handles "Transaction Amount  ₹ 500.00", "Amount  1000.00", or across newlines)
  const amountField = extractFieldAcrossLines(
    lines,
    /^(?:transaction\s*amount|txn\s*amount|withdrawal\s*amount|amount|amt)\b/i
  );
  const amountFromField =
    amountField?.match(/(?:₹|₽|rs\.?|inr)?[^\d\n]*([\d,]+(?:\.\d{1,2})?)/i)?.[1]?.replace(/,/g, "") || null;
  const amountFallback =
    text.match(/(?:₹|₽|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]?.replace(/,/g, "") || null;
  const amount = amountFromField || amountFallback;

  // Customer Name (handles "Payer Name  RASEK MOLLA", "Name  ALAMIN DAFADAR", "Customer Name  ...", ignoring "CSP FIRM NAME")
  const nameField = extractFieldAcrossLines(
    lines,
    /^(?:payer\s*name|customer\s*name|cust\.?\s*name|beneficiary\s*name|a\/c\s*holder\s*name|name)\b/i
  );
  const customerName = nameField && !/^gazi\s*online$/i.test(nameField)
    ? nameField.replace(/^[:\-\s]+/, "").trim()
    : null;

  // Bank / Portal
  let bankOrPortal: string | null = extractFieldAcrossLines(
    lines,
    /^(?:bank\s*name|bank|portal|csp\s*firm\s*name)\b/i
  );
  if (!bankOrPortal) {
    if (lower.includes("payments bank") || lower.includes("airtel") || lower.includes("mairtel")) {
      bankOrPortal = "Airtel Payments Bank";
    } else if (lower.includes("relipay") || lower.includes("rnfi")) {
      bankOrPortal = "Relipay (RNFI)";
    } else if (lower.includes("paynearby")) {
      bankOrPortal = "PayNearby";
    } else if (lower.includes("spice money")) {
      bankOrPortal = "Spice Money";
    } else if (lower.includes("fino")) {
      bankOrPortal = "Fino Payments Bank";
    }
  }

  // Date & Time (handles DD/MM/YYYY, HH:MM and YYYY-MM-DD HH:MM:SS)
  const dateMatch =
    text.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/) ||
    text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i) ||
    text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
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
  "customerName": "customer/payer name (NOT the shop/CSP/payee name) or null",
  "amount": "numeric string without currency symbol or null",
  "rrnNumber": "12-digit RRN/UTR or transaction reference or null",
  "upiId": "customer/payer UPI ID (e.g. Payer VPA like 9749383710-z2da@axl) rather than merchant Payee VPA, or null",
  "mobileNumber": "customer 10-digit mobile number if visible on receipt or inside Payer UPI ID (NOT CSP/merchant mobile), or null",
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
  formData.append("isTable", "true");

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
