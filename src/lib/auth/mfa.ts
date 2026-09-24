import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// GCDS MFA DOMAIN TYPES (DTOs)
// Intentionally free of tokens, secrets, or internal GoTrue session structures.
// ============================================================================

export type MfaAssuranceLevel = 'aal1' | 'aal2';

export interface MfaAssuranceState {
  currentLevel: MfaAssuranceLevel | null;
  nextLevel: MfaAssuranceLevel | null;
  isAal2: boolean;
  needsVerification: boolean;
}

export interface MfaFactorSummary {
  id: string;
  status: 'verified' | 'unverified';
  friendlyName?: string;
  factorType: 'totp';
  createdAt: string;
  updatedAt: string;
}

export interface MfaFactorsListResult {
  all: MfaFactorSummary[];
  verified: MfaFactorSummary[];
  unverified: MfaFactorSummary[];
  hasVerifiedFactor: boolean;
  error?: string;
}

export interface MfaEnrollmentResult {
  success: boolean;
  factorId?: string;
  totp?: {
    qrCodeSvg: string;
    secret: string;
    uri: string;
  };
  error?: string;
}

export interface MfaVerificationResult {
  success: boolean;
  currentLevel?: MfaAssuranceLevel | null;
  error?: string;
}

export interface MfaUnenrollResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ============================================================================
// CODE VALIDATION & ERROR SANITIZATION
// ============================================================================

/**
 * Validates that an OTP code consists of exactly 6 numeric digits.
 */
export function isValidTotpCode(code: string): boolean {
  if (typeof code !== 'string') return false;
  return /^\d{6}$/.test(code.trim());
}

/**
 * Sanitizes errors so internal provider traces, database messages,
 * or raw exception objects never leak to UI consumers.
 */
export function sanitizeMfaError(error: unknown, fallbackMessage: string): string {
  if (!error) return fallbackMessage;

  const msg = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message).toLowerCase()
    : '';

  if (msg.includes('auth') || msg.includes('jwt') || msg.includes('session') || msg.includes('unauthorized')) {
    return 'Authentication required.';
  }
  if (msg.includes('expired') || msg.includes('timeout')) {
    return 'Verification code expired. Please try again.';
  }
  if (msg.includes('invalid') || msg.includes('incorrect') || msg.includes('mismatch')) {
    return 'Invalid verification code.';
  }
  if (msg.includes('not found')) {
    return 'Factor not found or not eligible for removal.';
  }

  return fallbackMessage;
}

// ============================================================================
// CORE MFA HELPERS
// ============================================================================

/**
 * Determines the current Authenticator Assurance Level (AAL) for the active session.
 * Safely maps native Supabase levels (aal1 / aal2) into application DTOs.
 */
export async function getMfaAssuranceLevel(supabase: SupabaseClient): Promise<MfaAssuranceState> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error || !data) {
      return {
        currentLevel: null,
        nextLevel: null,
        isAal2: false,
        needsVerification: false,
      };
    }

    const currentLevel: MfaAssuranceLevel | null =
      data.currentLevel === 'aal2' ? 'aal2' : data.currentLevel === 'aal1' ? 'aal1' : null;

    const nextLevel: MfaAssuranceLevel | null =
      data.nextLevel === 'aal2' ? 'aal2' : data.nextLevel === 'aal1' ? 'aal1' : null;

    const isAal2 = currentLevel === 'aal2';
    // User needs verification if they have a verified factor capable of aal2, but current session is aal1
    const needsVerification = currentLevel !== 'aal2' && nextLevel === 'aal2';

    return {
      currentLevel,
      nextLevel,
      isAal2,
      needsVerification,
    };
  } catch {
    return {
      currentLevel: null,
      nextLevel: null,
      isAal2: false,
      needsVerification: false,
    };
  }
}

/**
 * Retrieves the user's enrolled MFA factors, separating verified from unverified factors.
 * Strictly filters to TOTP factors and excludes internal secrets from the result.
 */
export async function listMfaFactors(supabase: SupabaseClient): Promise<MfaFactorsListResult> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error || !data) {
      return {
        all: [],
        verified: [],
        unverified: [],
        hasVerifiedFactor: false,
        error: sanitizeMfaError(error, 'Unable to load MFA status.'),
      };
    }

    const allTotpFactors: MfaFactorSummary[] = (data.all || [])
      .filter((factor) => factor.factor_type === 'totp')
      .map((factor) => ({
        id: factor.id,
        status: factor.status === 'verified' ? 'verified' : 'unverified',
        friendlyName: factor.friendly_name,
        factorType: 'totp',
        createdAt: factor.created_at,
        updatedAt: factor.updated_at,
      }));

    const verified = allTotpFactors.filter((f) => f.status === 'verified');
    const unverified = allTotpFactors.filter((f) => f.status === 'unverified');

    return {
      all: allTotpFactors,
      verified,
      unverified,
      hasVerifiedFactor: verified.length > 0,
    };
  } catch (err) {
    return {
      all: [],
      verified: [],
      unverified: [],
      hasVerifiedFactor: false,
      error: sanitizeMfaError(err, 'Unable to load MFA status.'),
    };
  }
}

/**
 * Enrolls a new TOTP MFA factor for the currently authenticated user.
 * Returns the QR code SVG and manual entry secret ONLY to the immediate caller.
 * Does NOT persist secrets or write to application databases/logs.
 */
export async function enrollTotpFactor(
  supabase: SupabaseClient,
  options?: { friendlyName?: string }
): Promise<MfaEnrollmentResult> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: 'Authentication required.',
      };
    }

    const friendlyName = options?.friendlyName || user.email || 'GCDS Authenticator';

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'GCDS',
      friendlyName,
    });

    if (error || !data || !data.totp) {
      return {
        success: false,
        error: sanitizeMfaError(error, 'Unable to start MFA setup.'),
      };
    }

    return {
      success: true,
      factorId: data.id,
      totp: {
        qrCodeSvg: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeMfaError(err, 'Unable to start MFA setup.'),
    };
  }
}

/**
 * Validates the 6-digit TOTP code and completes verification via native challengeAndVerify.
 * Does NOT expose tokens or sensitive session credentials to the UI caller.
 */
export async function verifyTotpFactor(
  supabase: SupabaseClient,
  params: { factorId: string; code: string }
): Promise<MfaVerificationResult> {
  try {
    if (!params.factorId || typeof params.factorId !== 'string') {
      return {
        success: false,
        error: 'Invalid factor ID.',
      };
    }

    const trimmedCode = params.code ? params.code.trim() : '';

    if (!isValidTotpCode(trimmedCode)) {
      return {
        success: false,
        error: 'Invalid verification code. Must be 6 digits.',
      };
    }

    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: params.factorId,
      code: trimmedCode,
    });

    if (error || !data) {
      return {
        success: false,
        error: sanitizeMfaError(error, 'Invalid verification code.'),
      };
    }

    return {
      success: true,
      currentLevel: 'aal2',
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeMfaError(err, 'Verification failed. Please try again.'),
    };
  }
}

/**
 * Unenrolls a TOTP factor.
 * Security requirements:
 * 1. User must be authenticated.
 * 2. Factor must exist in user's TOTP factors.
 * 3. If factor is verified, session must already be at aal2 (step-up protection).
 *
 * NOTE: This function is strictly an internal core utility and IS NOT WIRED TO ANY UI in S2A.
 */
export async function unenrollTotpFactor(
  supabase: SupabaseClient,
  factorId: string
): Promise<MfaUnenrollResult> {
  try {
    if (!factorId || typeof factorId !== 'string') {
      return {
        success: false,
        error: 'Invalid factor ID.',
      };
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return {
        success: false,
        error: 'Authentication required.',
      };
    }

    // Verify factor belongs to this user
    const factorsResult = await listMfaFactors(supabase);
    const targetFactor = factorsResult.all.find((f) => f.id === factorId);

    if (!targetFactor) {
      return {
        success: false,
        error: 'Factor not found or not eligible for removal.',
      };
    }

    // Step-up verification rule: If removing a verified factor, user must have an active AAL2 session
    if (targetFactor.status === 'verified') {
      const assurance = await getMfaAssuranceLevel(supabase);
      if (assurance.currentLevel !== 'aal2') {
        return {
          success: false,
          error: 'Verification required before removing an active factor.',
        };
      }
    }

    const { data, error } = await supabase.auth.mfa.unenroll({ factorId });

    if (error || !data) {
      return {
        success: false,
        error: sanitizeMfaError(error, 'Failed to remove factor.'),
      };
    }

    return {
      success: true,
      id: data.id,
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeMfaError(err, 'Failed to remove factor.'),
    };
  }
}
