import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";
import {
  createRecoveryMarker,
  getRecoveryCookieOptions,
} from "@/lib/auth/recoverySession";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Supabase Auth Callback & Recovery Confirmation Route Handler.
 * Supports both PKCE authorization code exchange and email OTP token_hash verification.
 * When type === 'recovery', explicitly establishes trusted recovery provenance
 * by issuing a short-lived, HttpOnly, SameSite, HMAC-signed recovery marker cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");

  // Validate next destination, default to /update-password for recovery flows
  const rawTarget = nextParam || "/update-password";
  const safeNext = getSafeNextPath(rawTarget);

  const supabase = await createClient();
  const isRecovery = type === "recovery";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(safeNext, origin));
      if (isRecovery) {
        const marker = createRecoveryMarker();
        if (!marker) {
          // Fails closed if signing secret is missing/invalid in production
          return NextResponse.redirect(new URL("/forgot-password?error=invalid_link", origin));
        }
        response.cookies.set({
          ...getRecoveryCookieOptions(),
          value: marker,
        });
      }
      return response;
    }
  } else if (token_hash) {
    const otpType: EmailOtpType = type || "email";
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: otpType,
    });
    if (!error) {
      const response = NextResponse.redirect(new URL(safeNext, origin));
      if (isRecovery) {
        const marker = createRecoveryMarker();
        if (!marker) {
          // Fails closed if signing secret is missing/invalid in production
          return NextResponse.redirect(new URL("/forgot-password?error=invalid_link", origin));
        }
        response.cookies.set({
          ...getRecoveryCookieOptions(),
          value: marker,
        });
      }
      return response;
    }
  }

  // If verification fails or parameters are missing, redirect to forgot-password with error flag
  return NextResponse.redirect(new URL("/forgot-password?error=invalid_link", origin));
}
