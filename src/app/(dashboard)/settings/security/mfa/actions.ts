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

export interface MfaUnenrollActionResult {
  success: boolean;
  mustEnroll?: boolean;
  remainingFactorCount?: number;
  redirectUrl?: string;
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
 * Allows primary and backup authenticator factors (GCDS application policy limits to 2 factors; Supabase platform supports multiple factors).
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

    // GCDS application policy: limit to 2 verified factors (primary and backup)
    if (factorsResult.verified.length >= 2) {
      return {
        success: false,
        alreadyVerified: true,
        error: "GCDS policy allows a maximum of 2 authenticator factors (primary and backup).",
      };
    }

    // Controlled cleanup: remove any abandoned unverified factors from prior attempts
    if (factorsResult.unverified.length > 0) {
      for (const unverifiedFactor of factorsResult.unverified) {
        await unenrollTotpFactor(supabase, unverifiedFactor.id);
      }
    }

    const isBackup = factorsResult.verified.length === 1;
    const factorLabel = isBackup
      ? (user.email ? `${user.email} (Backup Authenticator)` : "Backup Authenticator")
      : (user.email || "Primary Authenticator");

    // Call S2A enrollment helper with issuer 'GCDS'
    const enrollment = await enrollTotpFactor(supabase, {
      friendlyName: factorLabel,
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

/**
 * Allows an authenticated user to remove their own verified MFA factor.
 * Security requirements:
 * 1. User must be authenticated.
 * 2. User must have an active AAL2 session (elevation required).
 * 3. Factor must belong to current user.
 */
export async function unenrollOwnMfaFactorAction(
  factorId: string
): Promise<MfaUnenrollActionResult> {
  try {
    if (!factorId || typeof factorId !== "string") {
      return { success: false, error: "Invalid factor ID." };
    }

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Authentication required." };
    }

    // Step-up verification rule: Must be AAL2
    const assurance = await getMfaAssuranceLevel(supabase);
    if (assurance.currentLevel !== "aal2") {
      return {
        success: false,
        error: "Verification required before removing an active factor. AAL2 assurance required.",
      };
    }

    // Factor ownership check: verify factor belongs to this user
    const factorsResult = await listMfaFactors(supabase);
    const target = factorsResult.all.find((f) => f.id === factorId);
    if (!target) {
      return {
        success: false,
        error: "Factor not found or not eligible for removal.",
      };
    }

    const unenrollResult = await unenrollTotpFactor(supabase, factorId);
    if (!unenrollResult.success) {
      return {
        success: false,
        error: unenrollResult.error || "Failed to remove factor.",
      };
    }

    // Inspect remaining factors authoritatively
    const remainingFactorsResult = await listMfaFactors(supabase);
    const remainingCount = remainingFactorsResult.verified.length;

    if (remainingCount === 0) {
      // Final verified factor was removed. Supabase JWT may remain AAL2 until refreshSession().
      // Explicitly refresh session to immediately downgrade AAL2 -> AAL1.
      let refreshSuccess = false;
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data?.session) {
          refreshSuccess = true;
        }
      } catch {
        refreshSuccess = false;
      }

      if (!refreshSuccess) {
        // Refresh failed; force sign out fail-closed to prevent stale AAL2 bypass
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore signOut errors, fail closed
        }
        return {
          success: false,
          error: "Session could not be securely refreshed. Please sign in again.",
          redirectUrl: "/login",
        };
      }

      // Re-read assurance and factor state to confirm authoritative downgrade
      const [recheckedAssurance, recheckedFactors] = await Promise.all([
        getMfaAssuranceLevel(supabase),
        listMfaFactors(supabase),
      ]);

      const isDowngraded = recheckedAssurance.currentLevel !== "aal2" && !recheckedAssurance.isAal2;
      const isZeroFactors = recheckedFactors.verified.length === 0;

      if (!isDowngraded || !isZeroFactors) {
        // Authoritative downgrade could not be confirmed; force sign out fail-closed
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore signOut errors
        }
        return {
          success: false,
          error: "Session assurance could not be securely downgraded. Please sign in again.",
          redirectUrl: "/login",
        };
      }

      revalidatePath("/", "layout");
      revalidatePath("/settings");
      revalidatePath("/settings/security/mfa");

      return {
        success: true,
        mustEnroll: true,
        remainingFactorCount: 0,
        redirectUrl: "/settings/security/mfa",
      };
    }

    // One or more verified factors remain (e.g. removed backup, primary remains)
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Safe to continue if at least one factor remains
    }

    revalidatePath("/", "layout");
    revalidatePath("/settings");
    revalidatePath("/settings/security/mfa");

    return {
      success: true,
      mustEnroll: false,
      remainingFactorCount: remainingCount,
    };
  } catch {
    return { success: false, error: "Failed to remove factor." };
  }
}
