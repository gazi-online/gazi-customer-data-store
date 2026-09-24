"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getTrustedRecoveryRedirectUrl,
  GENERIC_RECOVERY_SUCCESS_MESSAGE,
} from "@/lib/auth/safeRedirect";

export interface ForgotPasswordActionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Initiates password recovery via Supabase resetPasswordForEmail.
 * Strictly protects against account enumeration:
 * Returns the exact same generic completion message regardless of whether
 * the email address exists in the auth database.
 */
export async function requestPasswordResetAction(
  formData: FormData
): Promise<ForgotPasswordActionResult> {
  const emailRaw = formData.get("email");
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return {
      success: false,
      message: "",
      error: "Please enter a valid email address.",
    };
  }

  try {
    const supabase = await createClient();
    const redirectTo = getTrustedRecoveryRedirectUrl();
    if (!redirectTo) {
      // Fails closed in production if canonical URL is not configured/invalid
      return {
        success: false,
        message: "",
        error: "Password recovery is temporarily unavailable. Please contact support.",
      };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      const errMsg = error.message.toLowerCase();
      if (
        errMsg.includes("rate limit") ||
        errMsg.includes("too many requests") ||
        errMsg.includes("over_email_send_rate_limit")
      ) {
        return {
          success: false,
          message: "",
          error: "Too many recovery requests. Please wait a few minutes before trying again.",
        };
      }
      // Non-rate-limit errors return generic success to prevent account enumeration
    }

    return {
      success: true,
      message: GENERIC_RECOVERY_SUCCESS_MESSAGE,
    };
  } catch {
    return {
      success: true,
      message: GENERIC_RECOVERY_SUCCESS_MESSAGE,
    };
  }
}
