"use server";

import { createClient } from "@/lib/supabase/server";
import {
  listMfaFactors,
  getMfaAssuranceLevel,
  enrollTotpFactor,
  verifyTotpFactor,
  unenrollTotpFactor,
  MfaFactorSummary,
} from "@/lib/auth/mfa";
import { revalidatePath } from "next/cache";

export interface MfaStatusActionResult {
  success: boolean;
  hasVerifiedFactor: boolean;
  verifiedFactors: MfaFactorSummary[];
  isAal2: boolean;
  userEmail?: string;
  error?: string;
}

export interface MfaEnrollmentActionResult {
  success: boolean;
  factorId?: string;
  totp?: {
    qrCodeSvg: string;
    secret: string;
    uri: string;
  };
  alreadyVerified?: boolean;
  error?: string;
}

export interface MfaVerificationActionResult {
  success: boolean;
  currentLevel?: string | null;
  error?: string;
}

export interface MfaCancelActionResult {
  success: boolean;
  error?: string;
}

/**
 * Retrieves the MFA status for the currently authenticated user.
 * Derived strictly from the authenticated server session.
 */
export async function getMfaStatusAction(): Promise<MfaStatusActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        hasVerifiedFactor: false,
        verifiedFactors: [],
        isAal2: false,
        error: "Authentication required.",
      };
    }

    const [factorsResult, assurance] = await Promise.all([
      listMfaFactors(supabase),
      getMfaAssuranceLevel(supabase),
    ]);

    return {
      success: true,
      hasVerifiedFactor: factorsResult.hasVerifiedFactor,
      verifiedFactors: factorsResult.verified,
      isAal2: assurance.isAal2,
      userEmail: user.email,
    };
  } catch {
    return {
      success: false,
      hasVerifiedFactor: false,
      verifiedFactors: [],
      isAal2: false,
      error: "Unable to load security status.",
    };
  }
}

/**
 * Starts TOTP enrollment on explicit user request.
 * Cleans up any prior stale unverified factors to prevent orphaned factors.
 * Rejects if user already has a verified factor.
 */
export async function startMfaEnrollmentAction(): Promise<MfaEnrollmentActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Authentication required.",
      };
    }

    // Inspect existing factors
    const factorsResult = await listMfaFactors(supabase);

    // If verified factor already exists, do not permit re-enrollment in S2B
    if (factorsResult.hasVerifiedFactor) {
      return {
        success: false,
        alreadyVerified: true,
        error: "Two-step verification is already enabled for your account.",
      };
    }

    // Controlled cleanup: remove any abandoned unverified factors from prior attempts
    if (factorsResult.unverified.length > 0) {
      for (const unverifiedFactor of factorsResult.unverified) {
        await unenrollTotpFactor(supabase, unverifiedFactor.id);
      }
    }

    // Call S2A enrollment helper with issuer 'GCDS'
    const enrollment = await enrollTotpFactor(supabase, {
      friendlyName: user.email || "GCDS Authenticator",
    });

    if (!enrollment.success || !enrollment.factorId || !enrollment.totp) {
      return {
        success: false,
        error: enrollment.error || "Unable to start MFA setup.",
      };
    }

    return {
      success: true,
      factorId: enrollment.factorId,
      totp: enrollment.totp,
    };
  } catch {
    return {
      success: false,
      error: "Unable to start MFA setup.",
    };
  }
}

/**
 * Verifies the 6-digit TOTP code and activates the factor to verified status.
 * Updates session cookies via @supabase/ssr setAll in server action context.
 */
export async function verifyMfaEnrollmentAction(
  factorId: string,
  code: string
): Promise<MfaVerificationActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Authentication required.",
      };
    }

    const verification = await verifyTotpFactor(supabase, { factorId, code });

    if (!verification.success) {
      return {
        success: false,
        error: verification.error || "The code is incorrect or expired. Try the latest code from your authenticator app.",
      };
    }

    revalidatePath("/settings");
    revalidatePath("/settings/security/mfa");

    return {
      success: true,
      currentLevel: verification.currentLevel,
    };
  } catch {
    return {
      success: false,
      error: "Verification failed. Please try again.",
    };
  }
}

/**
 * Cancels a pending enrollment, safely removing the unverified factor
 * so no orphaned factors remain in the user's account.
 */
export async function cancelMfaEnrollmentAction(factorId: string): Promise<MfaCancelActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Authentication required.",
      };
    }

    // Only unenroll if it is an unverified factor
    const factorsResult = await listMfaFactors(supabase);
    const target = factorsResult.unverified.find((f) => f.id === factorId);

    if (target) {
      await unenrollTotpFactor(supabase, factorId);
    }

    return { success: true };
  } catch {
    return { success: false, error: "Failed to cancel enrollment." };
  }
}
