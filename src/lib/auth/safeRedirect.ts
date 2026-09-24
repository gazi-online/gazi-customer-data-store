/**
 * Safe Return Destination Validator for GCDS.
 * 
 * Strictly ensures post-login/post-verification redirects only target
 * internal relative application routes. Blocks open redirects, external
 * URLs, protocol-relative paths, javascript/data protocols, control characters,
 * and URLs attempting to pass sensitive token/secret query parameters.
 */

export function getSafeNextPath(input?: string | null): string {
  if (!input || typeof input !== 'string') {
    return '/dashboard';
  }

  const trimmed = input.trim();

  // Reject paths that don't begin with a single slash, or start with protocol-relative '//', '/\', or contain '\'
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('\\')
  ) {
    return '/dashboard';
  }

  // Reject control characters or null bytes
  if (/[\r\n\0]/.test(trimmed)) {
    return '/dashboard';
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');

    // Ensure protocol and origin did not change (rejects javascript:, data:, external hosts)
    if (parsed.origin !== 'http://localhost') {
      return '/dashboard';
    }

    const fullPath = parsed.pathname + parsed.search + parsed.hash;
    const lower = fullPath.toLowerCase();

    // Guard against token, secret, or credentials in redirect URL
    if (
      lower.includes('access_token') ||
      lower.includes('refresh_token') ||
      lower.includes('secret') ||
      lower.includes('totp')
    ) {
      return '/dashboard';
    }

    return fullPath;
  } catch {
    return '/dashboard';
  }
}

/**
 * Returns the canonical trusted application origin.
 * Strictly derives from configured server/environment settings.
 * Fails closed in production if missing, invalid, or pointing to localhost.
 */
export function getCanonicalAppUrl(): string | null {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // In production, block localhost/loopback addresses
        if (process.env.NODE_ENV === 'production') {
          if (
            parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1' ||
            parsed.hostname === '::1'
          ) {
            return null;
          }
        }
        return parsed.origin;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Fail closed in production if no valid canonical URL is configured
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  // Development fallback only
  return 'http://localhost:3000';
}

/**
 * Constructs the canonical, trusted recovery redirect URL for resetPasswordForEmail.
 * Never allows arbitrary client-provided hosts or headers.
 * Returns null if canonical app URL is unavailable/invalid (fails closed).
 */
export function getTrustedRecoveryRedirectUrl(): string | null {
  const base = getCanonicalAppUrl();
  if (!base) {
    return null;
  }
  return `${base}/auth/confirm?type=recovery&next=/update-password`;
}

/**
 * Generic response message for password recovery to prevent account enumeration.
 */
export const GENERIC_RECOVERY_SUCCESS_MESSAGE =
  "If an account exists for this email, a password recovery link has been sent.";
