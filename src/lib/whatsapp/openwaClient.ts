import crypto from "crypto";
import { normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";

const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY_MS = 1200;

export interface OpenWAConfig {
  url: string;
  apiKey: string;
  sessionId: string;
}

export function getOpenWAConfig(): OpenWAConfig | null {
  const url = (process.env.OPENWA_URL || "").trim().replace(/\/$/, "");
  const apiKey = (process.env.OPENWA_API_KEY || "").trim();
  const sessionId = (process.env.OPENWA_SESSION_ID || "").trim();

  if (!url || !apiKey || !sessionId) {
    return null;
  }

  return { url, apiKey, sessionId };
}

export function isWhatsAppConfigured(): boolean {
  return getOpenWAConfig() !== null;
}

export function isAutoNotifyEnabled(): boolean {
  if (!isWhatsAppConfigured()) return false;
  return process.env.OPENWA_AUTO_NOTIFY !== "false";
}

/**
 * Formats a phone number into OpenWA chatId format (e.g. "919876543210@c.us").
 */
export function formatOpenWAChatId(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.includes("@c.us") || trimmed.includes("@g.us")) {
    return trimmed;
  }
  const normalized = normalizeWhatsAppPhone(trimmed);
  if (!normalized) {
    throw new Error("Invalid phone number for WhatsApp");
  }
  return `${normalized}@c.us`;
}

/**
 * Verifies HMAC-SHA256 signature from X-OpenWA-Signature or X-Signature header.
 */
export function verifyOpenWAWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = (process.env.WEBHOOK_SECRET || process.env.OPENWA_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return true;
  }
  if (!signatureHeader) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedWithPrefix = Buffer.from(`sha256=${expectedHex}`);
  const expectedBare = Buffer.from(expectedHex);
  const actual = Buffer.from(signatureHeader.trim());

  if (actual.length === expectedWithPrefix.length) {
    return crypto.timingSafeEqual(actual, expectedWithPrefix);
  }
  if (actual.length === expectedBare.length) {
    return crypto.timingSafeEqual(actual, expectedBare);
  }
  return false;
}

async function postOpenWAWithRetry<T = Record<string, unknown>>(
  endpointPath: string,
  payload: Record<string, unknown>,
  maxRetries = DEFAULT_RETRY_COUNT
): Promise<T> {
  const config = getOpenWAConfig();
  if (!config) {
    throw new Error(
      "WhatsApp service is not configured (missing OPENWA_URL, OPENWA_API_KEY, or OPENWA_SESSION_ID)."
    );
  }

  const url = `${config.url}/sessions/${encodeURIComponent(config.sessionId)}/${endpointPath}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": config.apiKey,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg =
          (data as { message?: string; error?: string }).message ||
          (data as { error?: string }).error ||
          JSON.stringify(data);
        throw new Error(`OpenWA HTTP ${response.status}: ${msg}`);
      }

      return data as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, DEFAULT_RETRY_DELAY_MS * attempt));
      }
    }
  }

  throw lastError || new Error("Failed to send WhatsApp request");
}

export async function sendWhatsAppText(params: {
  phone: string;
  text: string;
}): Promise<{ id?: string; [key: string]: unknown }> {
  const chatId = formatOpenWAChatId(params.phone);
  return postOpenWAWithRetry("messages/send-text", {
    chatId,
    text: params.text,
  });
}

export async function sendWhatsAppMedia(params: {
  phone: string;
  url: string;
  filename?: string;
  caption?: string;
  mimeType?: string | null;
}): Promise<{ id?: string; [key: string]: unknown }> {
  const chatId = formatOpenWAChatId(params.phone);
  const isImage = Boolean(
    params.mimeType?.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/i.test(params.filename || "")
  );

  if (isImage) {
    return postOpenWAWithRetry("messages/send-image", {
      chatId,
      url: params.url,
      ...(params.caption ? { caption: params.caption } : {}),
    });
  }

  return postOpenWAWithRetry("messages/send-document", {
    chatId,
    url: params.url,
    ...(params.filename ? { filename: params.filename } : {}),
    ...(params.caption ? { caption: params.caption } : {}),
  });
}
