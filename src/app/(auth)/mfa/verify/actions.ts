"use server";

import { createClient } from "@/lib/supabase/server";
import {
  listMfaFactors,
  verifyTotpFactor,
  getMfaAssuranceLevel,
  isValidTotpCode,
  sanitizeMfaError,
} from "@/lib/auth/mfa";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface MfaChallengeActionResult {
  success: boolean;
  next?: string;
  error?: string;
}

/**
 * Server Action to verify a TOTP challenge for an authenticated user's verified factor.
 * Security enforcement:
 * 1. Must have an active authenticated Supabase session.
 * 2. Target factorId must be an enrolled and verified TOTP factor belonging to this user.
 * 3. Code must match exact 6-digit numeric pattern.
 * 4. Calls native challengeAndVerify using the SSR client.
 * 5. Re-confirms assurance level is elevated to AAL2 before confirming success.
 * 6. Validates next destination to prevent open redirects.
 */
export async function verifyMfaChallengeAction(params: {
  factorId: string;
  code: string;
  next?: string;
}): Promise<MfaChallengeActionResult> {
  try {
    const supabase = await createClient();

    // 1. Verify active session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Authentication required. Please sign in again.",
      };
    }

    // 2. Validate OTP code format
    const trimmedCode = params.code ? params.code.trim() : "";
    if (!isValidTotpCode(trimmedCode)) {
      return {
        success: false,
        error: "Invalid verification code. Must be 6 digits.",
      };
    }

    // 3. Verify factor ownership and verified status
    const factorsResult = await listMfaFactors(supabase);
    const verifiedFactor = factorsResult.verified.find(
      (f) => f.id === params.factorId
    );

    if (!verifiedFactor) {
      return {
        success: false,
        error: "Invalid or unverified factor. Please use a verified authenticator.",
      };
    }

    // 4. Perform native challenge and verify
    const verifyResult = await verifyTotpFactor(supabase, {
      factorId: verifiedFactor.id,
      code: trimmedCode,
    });

    if (!verifyResult.success) {
      return {
        success: false,
        error:
          verifyResult.error ||
          "The code is incorrect or expired. Enter the latest code from your authenticator app.",
      };
    }

    // 5. Confirm trusted AAL2 assurance level
    const assurance = await getMfaAssuranceLevel(supabase);
    if (!assurance.isAal2) {
      return {
        success: false,
        error: "Verification succeeded but session could not be confirmed at AAL2.",
      };
    }

    // 6. Compute safe return destination
    const safeNext = getSafeNextPath(params.next);

    revalidatePath("/", "layout");

    return {
      success: true,
      next: safeNext,
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeMfaError(
        err,
        "The code is incorrect or expired. Enter the latest code from your authenticator app."
      ),
    };
  }
}

/**
 * Server Action for secure sign out from the challenge screen.
 */
export async function signOutChallengeAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
