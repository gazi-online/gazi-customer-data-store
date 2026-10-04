/**
 * Extension Authentication & Pairing Token Security Engine
 * File: src/lib/auth/extensionAuth.ts
 *
 * Provides cryptographic token generation, SHA-256 hashing, token validation,
 * tenant boundary verification, and scope enforcement for the Browser Extension API.
 *
 * Invariants:
 * - Plaintext tokens are NEVER stored in the database.
 * - Plaintext tokens are NEVER logged.
 * - All tokens are strictly bound to a tenant (business_id) and user (user_id).
 * - Every request authoritatively verifies that the token owner maintains an active business membership.
 */

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabaseClient } from './adminMfaReset';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

export const EXTENSION_TOKEN_PREFIX = 'gcds_ext_';
export const EXTENSION_TOKEN_REGEX = /^gcds_ext_[0-9a-f]{64}$/i;

export type ExtensionScope = 'customers:search' | 'customers:form_fill';
export const VALID_EXTENSION_SCOPES: readonly ExtensionScope[] = [
  'customers:search',
  'customers:form_fill',
] as const;

export interface ExtensionTokenRecord {
  id: string;
  business_id: string;
  user_id: string;
  token_hash: string;
  name: string | null;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ExtensionTokenPublicInfo {
  id: string;
  name: string | null;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface ExtensionAuthContext {
  userId: string;
  businessId: string;
  scopes: string[];
  tokenId: string;
}

export interface ExtensionAuthValidationResult {
  authorized: boolean;
  status?: number;
  error?: string;
  code?: string;
  context?: ExtensionAuthContext;
}

/**
 * Computes a secure SHA-256 hex digest for an extension token.
 */
export function hashExtensionToken(plaintextToken: string): string {
  return crypto.createHash('sha256').update(plaintextToken.trim()).digest('hex');
}

/**
 * Validates the structural format of a plaintext extension token.
 */
export function isValidExtensionTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  return EXTENSION_TOKEN_REGEX.test(token.trim());
}

/**
 * Resolves a database client for extension verification.
 * Prefers the server admin client if available, else server-side client.
 */
async function resolveDbClient(customClient?: SupabaseClient): Promise<SupabaseClient> {
  if (customClient) return customClient;
  const adminClient = getAdminSupabaseClient();
  if (adminClient) return adminClient;
  return await createServerSupabaseClient();
}

/**
 * Authoritatively validates an incoming request Bearer token against stored token hashes,
 * verifies tenant binding, and checks user business membership active status.
 */
export async function validateExtensionAuth(
  req: Request,
  requiredScope?: ExtensionScope,
  dbClientOverride?: SupabaseClient
): Promise<ExtensionAuthValidationResult> {
  // 1. Extract Authorization header
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader) {
    return {
      authorized: false,
      status: 401,
      error: 'Missing Authorization header.',
      code: 'MISSING_AUTHORIZATION',
    };
  }

  // 2. Parse Bearer token
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return {
      authorized: false,
      status: 401,
      error: 'Malformed Authorization header. Format: Bearer <token>',
      code: 'MALFORMED_AUTHORIZATION_HEADER',
    };
  }

  const plaintextToken = parts[1];

  // 3. Validate token format
  if (!isValidExtensionTokenFormat(plaintextToken)) {
    return {
      authorized: false,
      status: 401,
      error: 'Invalid token format.',
      code: 'INVALID_TOKEN_FORMAT',
    };
  }

  // 4. Compute SHA-256 hash
  const tokenHash = hashExtensionToken(plaintextToken);

  try {
    const db = await resolveDbClient(dbClientOverride);

    // 5. Query token record by hash
    const { data: tokenRecord, error: tokenErr } = await db
      .from('extension_pairing_tokens')
      .select('id, business_id, user_id, token_hash, name, scopes, expires_at, revoked_at, last_used_at, created_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr || !tokenRecord) {
      return {
        authorized: false,
        status: 401,
        error: 'Invalid or unknown pairing token.',
        code: 'TOKEN_NOT_FOUND',
      };
    }

    // 6. Check revocation
    if (tokenRecord.revoked_at !== null) {
      return {
        authorized: false,
        status: 401,
        error: 'Pairing token has been revoked.',
        code: 'TOKEN_REVOKED',
      };
    }

    // 7. Check expiration
    const expiryTime = new Date(tokenRecord.expires_at).getTime();
    if (Date.now() >= expiryTime) {
      return {
        authorized: false,
        status: 401,
        error: 'Pairing token has expired.',
        code: 'TOKEN_EXPIRED',
      };
    }

    // 8. Verify required scope
    if (requiredScope && (!Array.isArray(tokenRecord.scopes) || !tokenRecord.scopes.includes(requiredScope))) {
      return {
        authorized: false,
        status: 403,
        error: `Insufficient permissions. Missing required scope: ${requiredScope}`,
        code: 'INSUFFICIENT_SCOPE',
      };
    }

    // 9. Authoritatively verify active business membership of the token owner
    const { data: membership, error: memErr } = await db
      .from('business_memberships')
      .select('business_id, user_id, status')
      .eq('user_id', tokenRecord.user_id)
      .eq('business_id', tokenRecord.business_id)
      .eq('status', 'active')
      .maybeSingle();

    if (memErr || !membership) {
      return {
        authorized: false,
        status: 403,
        error: 'Token owner does not have an active membership in this business.',
        code: 'INACTIVE_BUSINESS_MEMBERSHIP',
      };
    }

    // 10. Non-blocking telemetry: update last_used_at safely
    const nowIso = new Date().toISOString();
    void Promise.resolve(
      db
        .from('extension_pairing_tokens')
        .update({ last_used_at: nowIso })
        .eq('id', tokenRecord.id)
    ).catch(() => {
      // Intentionally ignored: telemetry failures must not block valid authentication
    });

    return {
      authorized: true,
      context: {
        userId: tokenRecord.user_id,
        businessId: tokenRecord.business_id,
        scopes: tokenRecord.scopes || [],
        tokenId: tokenRecord.id,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Auth evaluation error';
    return {
      authorized: false,
      status: 500,
      error: 'Authentication system failure: ' + errorMsg,
      code: 'AUTH_SYSTEM_FAILURE',
    };
  }
}

export interface GeneratePairingTokenParams {
  businessId: string;
  userId: string;
  name?: string;
  scopes?: ExtensionScope[];
  expiresInDays?: number;
  dbClientOverride?: SupabaseClient;
}

export interface GeneratePairingTokenResult {
  plaintextToken: string;
  record: ExtensionTokenPublicInfo;
}

/**
 * Generates a new cryptographic pairing token for the extension.
 * The plaintext token is returned ONCE to the caller and NEVER stored in the database.
 */
export async function generatePairingToken(
  params: GeneratePairingTokenParams
): Promise<GeneratePairingTokenResult> {
  const {
    businessId,
    userId,
    name = 'Gazi Smart Form Filler',
    scopes = ['customers:search', 'customers:form_fill'],
    expiresInDays = 30,
    dbClientOverride,
  } = params;

  // Validate scopes
  for (const s of scopes) {
    if (!VALID_EXTENSION_SCOPES.includes(s)) {
      throw new Error(`Invalid scope requested: ${s}`);
    }
  }

  // Generate 32 bytes of cryptographic randomness (64-char hex)
  const randomHex = crypto.randomBytes(32).toString('hex');
  const plaintextToken = `${EXTENSION_TOKEN_PREFIX}${randomHex}`;
  const tokenHash = hashExtensionToken(plaintextToken);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const db = await resolveDbClient(dbClientOverride);

  const { data, error } = await db
    .from('extension_pairing_tokens')
    .insert([
      {
        business_id: businessId,
        user_id: userId,
        token_hash: tokenHash,
        name: name.trim() || 'Gazi Smart Form Filler',
        scopes,
        expires_at: expiresAt,
        revoked_at: null,
      },
    ])
    .select('id, name, scopes, expires_at, revoked_at, last_used_at, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create pairing token: ${error?.message || 'Database insert failed'}`);
  }

  const record: ExtensionTokenPublicInfo = {
    id: data.id,
    name: data.name,
    scopes: data.scopes,
    expires_at: data.expires_at,
    revoked_at: data.revoked_at,
    last_used_at: data.last_used_at,
    created_at: data.created_at,
    status: 'active',
  };

  return {
    plaintextToken,
    record,
  };
}

/**
 * Revokes an existing pairing token for a given business.
 */
export async function revokePairingToken(
  tokenId: string,
  businessId: string,
  dbClientOverride?: SupabaseClient
): Promise<boolean> {
  const db = await resolveDbClient(dbClientOverride);
  const nowIso = new Date().toISOString();

  const { error } = await db
    .from('extension_pairing_tokens')
    .update({ revoked_at: nowIso })
    .eq('id', tokenId)
    .eq('business_id', businessId);

  if (error) {
    throw new Error(`Failed to revoke pairing token: ${error.message}`);
  }

  return true;
}

/**
 * Lists all pairing tokens for a business.
 * Strictly omits token_hash to prevent hash exposure.
 */
export async function listPairingTokens(
  businessId: string,
  dbClientOverride?: SupabaseClient
): Promise<ExtensionTokenPublicInfo[]> {
  const db = await resolveDbClient(dbClientOverride);

  const { data, error } = await db
    .from('extension_pairing_tokens')
    .select('id, name, scopes, expires_at, revoked_at, last_used_at, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list pairing tokens: ${error.message}`);
  }

  const nowTime = Date.now();

  return (data || []).map((row) => {
    let status: 'active' | 'expired' | 'revoked' = 'active';
    if (row.revoked_at) {
      status = 'revoked';
    } else if (new Date(row.expires_at).getTime() <= nowTime) {
      status = 'expired';
    }

    return {
      id: row.id,
      name: row.name,
      scopes: row.scopes,
      expires_at: row.expires_at,
      revoked_at: row.revoked_at,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      status,
    };
  });
}
