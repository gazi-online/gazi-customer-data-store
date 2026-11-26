import crypto from "crypto";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";
import { isWhatsAppConfigured, sendWhatsAppText } from "@/lib/whatsapp/openwaClient";

export const WA_OTP_COOKIE_NAME = "gcds_wa_otp_challenge";
const OTP_TTL_MS = 5 * 60 * 1000;

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Server auth configuration missing");
  }
  return createSupabaseAdmin(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getSigningSecret(): string {
  const secret =
    process.env.WEBHOOK_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.OPENWA_API_KEY;
  if (!secret) {
    throw new Error("No signing secret configured on server");
  }
  return secret;
}

function hashOtp(otp: string, userId: string): string {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(`${userId}:${otp.trim()}`)
    .digest("hex");
}

export function generateSixDigitOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function createOtpChallengeToken(params: {
  userId: string;
  email: string;
  phone: string;
  otp: string;
}): string {
  const payload = {
    userId: params.userId,
    email: params.email,
    phone: params.phone,
    otpHash: hashOtp(params.otp, params.userId),
    exp: Date.now() + OTP_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${sig}`;
}

export function verifyOtpChallengeToken(
  token: string,
  otpInput: string
): { valid: true; userId: string; email: string; phone: string } | { valid: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid OTP session. Please request a new code." };
  }
  const [encodedPayload, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: "Invalid OTP challenge signature." };
  }

  let payload: { userId: string; email: string; phone: string; otpHash: string; exp: number };
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { valid: false, error: "Corrupted OTP challenge." };
  }

  if (!payload.exp || Date.now() > payload.exp) {
    return { valid: false, error: "OTP has expired. Please request a new 6-digit code." };
  }

  const candidateHash = hashOtp(otpInput, payload.userId);
  const candBuf = Buffer.from(candidateHash, "hex");
  const targetBuf = Buffer.from(payload.otpHash, "hex");
  if (candBuf.length !== targetBuf.length || !crypto.timingSafeEqual(candBuf, targetBuf)) {
    return { valid: false, error: "Incorrect 6-digit OTP. Please try again." };
  }

  return {
    valid: true,
    userId: payload.userId,
    email: payload.email,
    phone: payload.phone,
  };
}

export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `******${digits.slice(-4)}`;
}

function extractUserPhone(user: {
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
}): string | null {
  const meta = user.user_metadata || {};
  const raw =
    (meta.whatsapp_phone as string | undefined) ||
    (meta.phone as string | undefined) ||
    user.phone ||
    null;
  return normalizeWhatsAppPhone(raw);
}

function extractUserName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> },
  fallbackBusinessName?: string | null
): string {
  const meta = user.user_metadata || {};
  return (
    (meta.full_name as string | undefined)?.trim() ||
    (meta.name as string | undefined)?.trim() ||
    fallbackBusinessName?.trim() ||
    user.email ||
    "User"
  );
}

export async function resolveUserForWhatsAppOtp(identifier: string): Promise<{
  userId: string;
  email: string;
  phone: string;
  name: string;
} | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const supabase = getAdminSupabase();
  const isEmail = trimmed.includes("@");
  const normalizedTargetPhone = isEmail ? null : normalizeWhatsAppPhone(trimmed);

  const { data: usersPage, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error || !usersPage?.users) {
    return null;
  }

  // 1. Direct match on auth.users (by email or user_metadata/phone)
  for (const u of usersPage.users) {
    if (!u.email) continue;
    const uPhone = extractUserPhone(u);

    if (isEmail && u.email.toLowerCase() === trimmed.toLowerCase()) {
      if (uPhone) {
        return { userId: u.id, email: u.email, phone: uPhone, name: extractUserName(u) };
      }
      // Fallback to business_settings phone linked via business_memberships
      const bizInfo = await getLinkedBusinessInfo(supabase, u.id);
      if (bizInfo.phone) {
        return {
          userId: u.id,
          email: u.email,
          phone: bizInfo.phone,
          name: extractUserName(u, bizInfo.businessName),
        };
      }
      return null;
    }

    if (normalizedTargetPhone && uPhone === normalizedTargetPhone) {
      return { userId: u.id, email: u.email, phone: uPhone, name: extractUserName(u) };
    }
  }

  // 2. If searching by phone, also check business_settings.phone -> business_memberships
  if (normalizedTargetPhone) {
    const local10 = normalizedTargetPhone.slice(-10);
    const { data: bizRows } = await supabase
      .from("business_settings")
      .select("business_id, business_name, phone")
      .ilike("phone", `%${local10}%`)
      .limit(3);

    if (bizRows && bizRows.length > 0) {
      for (const biz of bizRows) {
        if (normalizeWhatsAppPhone(biz.phone) !== normalizedTargetPhone) continue;
        const { data: member } = await supabase
          .from("business_memberships")
          .select("user_id")
          .eq("business_id", biz.business_id)
          .eq("status", "active")
          .limit(1)
          .single();

        if (member?.user_id) {
          const matchedUser = usersPage.users.find((u) => u.id === member.user_id);
          if (matchedUser?.email) {
            return {
              userId: matchedUser.id,
              email: matchedUser.email,
              phone: normalizedTargetPhone,
              name: extractUserName(matchedUser, biz.business_name),
            };
          }
        }
      }
    }
  }

  return null;
}

async function getLinkedBusinessInfo(
  supabase: ReturnType<typeof getAdminSupabase>,
  userId: string
): Promise<{ phone: string | null; businessName: string | null }> {
  const { data: membership } = await supabase
    .from("business_memberships")
    .select("business_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership?.business_id) {
    return { phone: null, businessName: null };
  }

  const { data: biz } = await supabase
    .from("business_settings")
    .select("business_name, phone")
    .eq("business_id", membership.business_id)
    .limit(1)
    .single();

  return {
    phone: normalizeWhatsAppPhone(biz?.phone),
    businessName: biz?.business_name || null,
  };
}

export async function generateSupabaseMagicLinkToken(email: string): Promise<string> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    throw new Error(error?.message || "Failed to generate login session token");
  }
  return hashedToken;
}

function formatLocationFromHeaders(headerList: Headers): {
  location: string;
  device: string;
} {
  const city = headerList.get("x-vercel-ip-city");
  const region = headerList.get("x-vercel-ip-country-region");
  const country = headerList.get("x-vercel-ip-country");
  const forwardedFor = headerList.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

  const geoParts = [city, region, country]
    .filter(Boolean)
    .map((v) => {
      try {
        return decodeURIComponent(v as string);
      } catch {
        return v as string;
      }
    });

  let location = "Unknown Location";
  if (geoParts.length > 0) {
    location = ip ? `${geoParts.join(", ")} (IP: ${ip})` : geoParts.join(", ");
  } else if (ip && ip !== "::1" && ip !== "127.0.0.1") {
    location = `IP: ${ip}`;
  } else {
    location = "Local / Development";
  }

  const ua = headerList.get("user-agent") || "";
  let browser = "Browser";
  if (ua.includes("Edg/")) browser = "Microsoft Edge";
  else if (ua.includes("Chrome/")) browser = "Google Chrome";
  else if (ua.includes("Firefox/")) browser = "Mozilla Firefox";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";

  let os = "Unknown OS";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  return { location, device: `${browser} on ${os}` };
}

/**
 * Sends a non-blocking "New device login successful" WhatsApp alert
 * with user's name and current location to their profile-linked mobile number.
 */
export async function sendNewDeviceLoginAlert(params: {
  userId: string;
  method: "Email & Password" | "WhatsApp 6-Digit OTP";
  headerList: Headers;
}): Promise<void> {
  try {
    if (!isWhatsAppConfigured()) return;

    const supabase = getAdminSupabase();
    const { data: userRes } = await supabase.auth.admin.getUserById(params.userId);
    const user = userRes?.user;
    if (!user) return;

    let phone = extractUserPhone(user);
    let bizName: string | null = null;
    if (!phone) {
      const bizInfo = await getLinkedBusinessInfo(supabase, user.id);
      phone = bizInfo.phone;
      bizName = bizInfo.businessName;
    }

    if (!phone) return;

    const userName = extractUserName(user, bizName);
    const { location, device } = formatLocationFromHeaders(params.headerList);
    const timeStr = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const text = [
      "🔐 *New Device Login Successful*",
      `User: ${userName}`,
      `Method: ${params.method}`,
      `Location: ${location}`,
      `Device: ${device}`,
      `Time: ${timeStr}`,
      "",
      "If this wasn't you, please change your password immediately.",
    ].join("\n");

    await sendWhatsAppText({ phone, text });
  } catch (err) {
    console.warn("[sendNewDeviceLoginAlert] Failed:", err);
  }
}
