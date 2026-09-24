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
