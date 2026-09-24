import { cookies } from "next/headers";
import crypto from "crypto";

export const RECOVERY_COOKIE_NAME = "gcds_recovery_auth";
export const RECOVERY_COOKIE_MAX_AGE = 60 * 15; // 15 minutes (900 seconds)
export const SIGNING_ALGORITHM = "sha256";
export const SIGNING_SECRET_ENV = "GCDS_RECOVERY_SIGNING_SECRET";
export const MIN_SECRET_LENGTH = 32;
export const CURRENT_PAYLOAD_VERSION = 1;

// Development-only fallback secret (strictly disallowed in production)
const DEV_FALLBACK_SECRET = "gcds-dev-recovery-signing-secret-minimum-32-chars-long";

export interface RecoveryMarkerPayload {
  v: number;
  iat: number;
  exp: number;
  nonce: string;
}

/**
 * Retrieves and validates the server-only recovery signing secret.
 * Enforces minimum 32 characters/bytes entropy.
 * Fails closed (returns null) in production if missing or weak.
 */
export function getRecoverySigningSecret(secretOverride?: string): string | null {
  if (secretOverride !== undefined) {
    if (typeof secretOverride !== "string" || secretOverride.length < MIN_SECRET_LENGTH) {
      return null;
    }
    return secretOverride;
  }

  const configured = process.env[SIGNING_SECRET_ENV];
  const isProduction = process.env.NODE_ENV === "production";

  if (configured) {
    if (configured.length < MIN_SECRET_LENGTH) {
      return null;
    }
    return configured;
  }

  if (isProduction) {
    return null;
  }

  return DEV_FALLBACK_SECRET;
}

/**
 * Creates a cryptographically authenticated recovery marker.
 * Format: <base64url payload>.<hex HMAC-SHA256 signature>
 * Contains NO access tokens, passwords, OTPs, or auth secrets.
 * Returns null if secret is unavailable or fails requirements.
 */
export function createRecoveryMarker(secretOverride?: string): string | null {
  const secret = getRecoverySigningSecret(secretOverride);
  if (!secret) {
    return null;
  }

  const now = Date.now();
  const payload: RecoveryMarkerPayload = {
    v: CURRENT_PAYLOAD_VERSION,
    iat: now,
    exp: now + RECOVERY_COOKIE_MAX_AGE * 1000,
    nonce: crypto.randomBytes(32).toString("hex"),
  };

  const serialized = JSON.stringify(payload);
  const encodedPayload = Buffer.from(serialized, "utf-8").toString("base64url");
  const signature = crypto.createHmac(SIGNING_ALGORITHM, secret).update(encodedPayload).digest("hex");

  return `${encodedPayload}.${signature}`;
}

/**
 * Alias for backward compatibility.
 */
export function generateRecoveryMarker(secretOverride?: string): string | null {
  return createRecoveryMarker(secretOverride);
}

/**
 * Validates a recovery marker cryptographically.
 * - Enforces exact payload format and version
 * - Verifies HMAC signature using timingSafeEqual
 * - Verifies expiry timestamp
 * - Fails closed if secret is missing or invalid
 */
export function verifyRecoveryMarker(
  marker: string | null | undefined,
  secretOverride?: string,
  currentTimeMs: number = Date.now()
): boolean {
  if (!marker || typeof marker !== "string") {
    return false;
  }

  const secret = getRecoverySigningSecret(secretOverride);
  if (!secret) {
    return false;
  }

  const parts = marker.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return false;
  }

  // 1. Verify HMAC signature with constant-time comparison
  const expectedSignature = crypto.createHmac(SIGNING_ALGORITHM, secret).update(encodedPayload).digest("hex");
  const sigBuf = Buffer.from(signature, "utf-8");
  const expBuf = Buffer.from(expectedSignature, "utf-8");

  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  // 2. Parse payload safely
  let payload: unknown;
  try {
    const jsonStr = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    payload = JSON.parse(jsonStr);
  } catch {
    return false;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("v" in payload) ||
    !("iat" in payload) ||
    !("exp" in payload) ||
    !("nonce" in payload)
  ) {
    return false;
  }

  const p = payload as Record<string, unknown>;

  // 3. Verify format and version
  if (p.v !== CURRENT_PAYLOAD_VERSION) {
    return false;
  }

  if (typeof p.iat !== "number" || typeof p.exp !== "number" || typeof p.nonce !== "string") {
    return false;
  }

  if (p.nonce.length < 32) {
    return false;
  }

  // 4. Verify expiry
  if (currentTimeMs > p.exp) {
    return false;
  }

  // Reject future-dated marker beyond 60s tolerance
  if (p.iat > currentTimeMs + 60_000) {
    return false;
  }

  return true;
}

/**
 * Secure cookie configuration for the recovery provenance marker.
 */
export function getRecoveryCookieOptions() {
  return {
    name: RECOVERY_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: RECOVERY_COOKIE_MAX_AGE,
  };
}

/**
 * Validates whether the active request contains an authentic, unexpired recovery marker.
 */
export async function hasRecoveryAuthorization(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(RECOVERY_COOKIE_NAME)?.value;
  return verifyRecoveryMarker(token);
}

/**
 * Clears and consumes the recovery authorization marker.
 */
export async function clearRecoveryAuthorization(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    ...getRecoveryCookieOptions(),
    value: "",
    maxAge: 0,
  });
}
