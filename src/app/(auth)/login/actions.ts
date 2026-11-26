"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getMfaAssuranceLevel, listMfaFactors } from "@/lib/auth/mfa";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";
import { determinePostAuthRedirect } from "@/lib/auth/mfaEnforcement";
import { isWhatsAppConfigured, sendWhatsAppText } from "@/lib/whatsapp/openwaClient";
import {
  WA_OTP_COOKIE_NAME,
  createOtpChallengeToken,
  generateSixDigitOtp,
  generateSupabaseMagicLinkToken,
  maskPhoneNumber,
  resolveUserForWhatsAppOtp,
  sendNewDeviceLoginAlert,
  verifyOtpChallengeToken,
} from "@/lib/whatsapp/loginAuth";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const nextParam = formData.get("next") as string | null;
  const safeNext = getSafeNextPath(nextParam || "/dashboard");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createClient();

  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (signInData?.user?.id) {
    const headerList = await headers();
    await sendNewDeviceLoginAlert({
      userId: signInData.user.id,
      method: "Email & Password",
      headerList,
    });
  }

  // Authoritatively resolve post-password MFA state
  const [assurance, factorsResult] = await Promise.all([
    getMfaAssuranceLevel(supabase),
    listMfaFactors(supabase),
  ]);

  const targetPath = determinePostAuthRedirect({
    isAal2: assurance.isAal2,
    hasVerifiedFactor: factorsResult.hasVerifiedFactor && factorsResult.verified.length > 0,
    safeNext,
  });

  revalidatePath("/", "layout");
  redirect(targetPath);
}

export async function requestWhatsAppOtpAction(identifier: string): Promise<{
  success?: boolean;
  maskedPhone?: string;
  error?: string;
}> {
  if (!isWhatsAppConfigured()) {
    return { error: "WhatsApp login is not configured on this server." };
  }

  const trimmed = (identifier || "").trim();
  if (!trimmed) {
    return { error: "Please enter your registered mobile number or email." };
  }

  const user = await resolveUserForWhatsAppOtp(trimmed);
  if (!user) {
    return {
      error:
        "No user account found with a linked WhatsApp mobile number for this email/number.",
    };
  }

  const otp = generateSixDigitOtp();
  const challengeToken = createOtpChallengeToken({
    userId: user.userId,
    email: user.email,
    phone: user.phone,
    otp,
  });

  try {
    await sendWhatsAppText({
      phone: user.phone,
      text: `🔐 *Gazi Online Login OTP*: *${otp}*\n\nValid for 5 minutes. Do not share this code with anyone.`,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Failed to send WhatsApp OTP: ${err.message}`
          : "Failed to send WhatsApp OTP.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(WA_OTP_COOKIE_NAME, challengeToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
  });

  return {
    success: true,
    maskedPhone: maskPhoneNumber(user.phone),
  };
}

export async function verifyWhatsAppOtpLoginAction(params: {
  otp: string;
  next?: string | null;
}) {
  const otpClean = (params.otp || "").replace(/\D/g, "");
  if (otpClean.length !== 6) {
    return { error: "Please enter the 6-digit OTP sent to your WhatsApp." };
  }

  const cookieStore = await cookies();
  const challengeToken = cookieStore.get(WA_OTP_COOKIE_NAME)?.value;
  if (!challengeToken) {
    return { error: "OTP session expired or missing. Please request a new code." };
  }

  const verification = verifyOtpChallengeToken(challengeToken, otpClean);
  if (!verification.valid) {
    return { error: verification.error };
  }

  // Single-use: clear challenge cookie immediately
  cookieStore.delete(WA_OTP_COOKIE_NAME);

  let hashedToken: string;
  try {
    hashedToken = await generateSupabaseMagicLinkToken(verification.email);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to initialize login session.",
    };
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });

  if (verifyErr) {
    return { error: verifyErr.message || "Failed to verify login session." };
  }

  const headerList = await headers();
  await sendNewDeviceLoginAlert({
    userId: verification.userId,
    method: "WhatsApp 6-Digit OTP",
    headerList,
  });

  const safeNext = getSafeNextPath(params.next || "/dashboard");
  const [assurance, factorsResult] = await Promise.all([
    getMfaAssuranceLevel(supabase),
    listMfaFactors(supabase),
  ]);

  const targetPath = determinePostAuthRedirect({
    isAal2: assurance.isAal2,
    hasVerifiedFactor: factorsResult.hasVerifiedFactor && factorsResult.verified.length > 0,
    safeNext,
  });

  revalidatePath("/", "layout");
  redirect(targetPath);
}
