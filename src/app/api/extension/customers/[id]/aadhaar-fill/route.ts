/**
 * Extension Customer Secure Aadhaar Autofill API Endpoint
 * File: src/app/api/extension/customers/[id]/aadhaar-fill/route.ts
 *
 * GET  /api/extension/customers/{id}/aadhaar-fill -> Returns verification status and masked representation ONLY (never full number).
 * POST /api/extension/customers/{id}/aadhaar-fill -> Secure, operator-approved single-use retrieval with document verification check.
 *
 * Security Invariants:
 * 1. Strictly separate from general form-fill API to prevent broad customer DTO exposure.
 * 2. Enforces operator pairing token authentication with tenant boundary verification.
 * 3. Requires explicit operator approval payload (operatorApproved: true).
 * 4. Checks single-use nonce freshness (<= 60s) and prevents replay attacks via persistent, atomic database storage.
 * 5. Requires supporting document verification in customer_documents (never relies on electoral_verification_status alone).
 * 6. Verifies that the verified document belongs to the customer and matches the stored Aadhaar number.
 * 7. Returns Cache-Control: no-store, no-cache headers.
 * 8. Plaintext Aadhaar is NEVER logged to console, analytics, or persistent storage.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateExtensionAuth } from '@/lib/auth/extensionAuth';
import {
  handleExtensionCorsPreflight,
  jsonResponseWithCors,
  isAllowedExtensionOrigin,
} from '@/lib/auth/extensionCors';
import { getAdminSupabaseClient } from '@/lib/auth/adminMfaReset';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NONCE_REGEX = /^[0-9a-zA-Z_-]{16,128}$/;

const MAX_CLOCK_SKEW_MS = 60 * 1000; // 60 seconds

export interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function OPTIONS(req: NextRequest) {
  return handleExtensionCorsPreflight(req);
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Authoritatively and atomically records a single-use approval nonce in the database.
 * Prevents replay attacks across all Vercel serverless instances without ephemeral in-memory state.
 * Uses dedicated table public.extension_fill_nonces backed by a PostgreSQL UNIQUE constraint.
 * Never inserts into or modifies extension_pairing_tokens.
 * Returns true if the nonce was accepted, false if it has already been used (replayed).
 */
async function consumeAtomicApprovalNonce(
  db: any,
  businessId: string,
  userId: string,
  customerId: string,
  nonce: string
): Promise<{ ok: boolean; replayed: boolean; error?: string }> {
  const nonceHash = 'nonce_' + crypto.createHash('sha256').update(nonce.trim()).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 minutes TTL

  // Dedicated extension_fill_nonces table (backed by PostgreSQL UNIQUE constraint on nonce_hash)
  const { error } = await db
    .from('extension_fill_nonces')
    .insert([
      {
        nonce_hash: nonceHash,
        business_id: businessId,
        user_id: userId,
        customer_id: customerId,
        expires_at: expiresAt,
      },
    ]);

  if (!error) {
    return { ok: true, replayed: false };
  }

  // Postgres code 23505 is unique_violation (replayed nonce)
  if (error.code === '23505' || error.message?.includes('duplicate key')) {
    return { ok: false, replayed: true };
  }

  return { ok: false, replayed: false, error: error.message };
}

export interface AadhaarDocumentMatchResult {
  verified: boolean;
  mismatch: boolean;
  maskedOnly: boolean;
  code:
    | 'EXACT_MATCH'
    | 'AADHAAR_VERIFICATION_REQUIRED'
    | 'AADHAAR_DOCUMENT_MISMATCH'
    | 'UNVERIFIED_AADHAAR_DOCUMENT';
}

/**
 * Normalizes an Aadhaar string by safely removing spaces, hyphens, slashes, and dots.
 */
export function normalizeAadhaarDigits(val: string | null | undefined): string {
  if (!val || typeof val !== 'string') return '';
  return val.replace(/[\s\-\/\.]/g, '').replace(/\D/g, '');
}

/**
 * Checks if a document number string is masked or partial
 * (contains '*', 'X', 'x', '•', or has fewer than 12 digits).
 */
export function isMaskedOrPartialAadhaar(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  if (/[*xX•]/.test(trimmed)) return true;
  const digits = normalizeAadhaarDigits(trimmed);
  return digits.length > 0 && digits.length < 12;
}

/**
 * Authoritatively validates whether verified documents in the Document Vault match
 * the stored customer Aadhaar number.
 *
 * Rules:
 * 1. Require exact match between stored 12-digit Aadhaar and independently verified 12-digit document number.
 * 2. Normalize spaces and separators safely before comparison.
 * 3. Never accept only the last 4 digits as proof of identity.
 * 4. Reject masked, partial, missing, malformed, or mismatched document numbers.
 * 5. If a document contains only a masked Aadhaar number, return AADHAAR_VERIFICATION_REQUIRED.
 * 6. Keep Aadhaar autofill disabled until the operator completes an appropriate verification process.
 * 7. Do not automatically change any customer's verification status.
 * 8. Do not expose Aadhaar numbers in responses or errors.
 */
export function verifyAadhaarDocumentMatch(
  customerAadhaar: string,
  verifiedDocs: any[]
): AadhaarDocumentMatchResult {
  if (!Array.isArray(verifiedDocs) || verifiedDocs.length === 0) {
    return {
      verified: false,
      mismatch: false,
      maskedOnly: false,
      code: 'UNVERIFIED_AADHAAR_DOCUMENT',
    };
  }

  const cleanCustomerAadhaar = normalizeAadhaarDigits(customerAadhaar);
  if (cleanCustomerAadhaar.length !== 12) {
    return {
      verified: false,
      mismatch: false,
      maskedOnly: false,
      code: 'UNVERIFIED_AADHAAR_DOCUMENT',
    };
  }

  let hasExact12DigitMatch = false;
  let has12DigitMismatch = false;
  let hasMaskedOrPartialDoc = false;

  for (const doc of verifiedDocs) {
    const rawDocNum = doc.document_number;
    if (!rawDocNum || typeof rawDocNum !== 'string' || !rawDocNum.trim()) {
      // Missing or empty document number on verified document -> insufficient proof
      hasMaskedOrPartialDoc = true;
      continue;
    }

    const trimmedDocNum = rawDocNum.trim();

    // Reject masked or partial numbers (e.g. "**** **** 1234", "XXXX-XXXX-1234", or "1234")
    if (isMaskedOrPartialAadhaar(trimmedDocNum)) {
      hasMaskedOrPartialDoc = true;
      continue;
    }

    const cleanDocNum = normalizeAadhaarDigits(trimmedDocNum);

    // Document number must be exactly 12 digits
    if (cleanDocNum.length === 12) {
      if (cleanDocNum === cleanCustomerAadhaar) {
        hasExact12DigitMatch = true;
      } else {
        has12DigitMismatch = true;
      }
    } else {
      // Malformed / non-standard length
      hasMaskedOrPartialDoc = true;
    }
  }

  // Priority 1: Conflicting 12-digit document in vault (security mismatch)
  if (has12DigitMismatch) {
    return {
      verified: false,
      mismatch: true,
      maskedOnly: false,
      code: 'AADHAAR_DOCUMENT_MISMATCH',
    };
  }

  // Priority 2: Verified exact 12-digit match found
  if (hasExact12DigitMatch) {
    return {
      verified: true,
      mismatch: false,
      maskedOnly: false,
      code: 'EXACT_MATCH',
    };
  }

  // Priority 3: Masked or partial document number found without full 12-digit verification
  if (hasMaskedOrPartialDoc) {
    return {
      verified: false,
      mismatch: false,
      maskedOnly: true,
      code: 'AADHAAR_VERIFICATION_REQUIRED',
    };
  }

  return {
    verified: false,
    mismatch: false,
    maskedOnly: false,
    code: 'UNVERIFIED_AADHAAR_DOCUMENT',
  };
}

/**
 * GET /api/extension/customers/{id}/aadhaar-fill
 * Authoritatively inspects Aadhaar availability and verification status.
 * STRICT PRIVACY INVARIANT: Never returns plaintext Aadhaar number.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const origin = req.headers.get('origin');
  if (origin && !isAllowedExtensionOrigin(origin)) {
    return new NextResponse(
      JSON.stringify({ error: 'Disallowed origin.', code: 'FORBIDDEN_ORIGIN' }),
      { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } }
    );
  }

  // 1. Authenticate with extension pairing token
  const authRes = await validateExtensionAuth(req, 'customers:form_fill');
  if (!authRes.authorized || !authRes.context) {
    return jsonResponseWithCors(
      {
        error: authRes.error || 'Authentication required.',
        code: authRes.code || 'UNAUTHORIZED',
      },
      { status: authRes.status || 401, headers: NO_CACHE_HEADERS },
      req
    );
  }

  const { businessId } = authRes.context;
  const { id } = await context.params;

  if (!id || !UUID_REGEX.test(id)) {
    return jsonResponseWithCors(
      { error: 'Invalid customer ID format.', code: 'INVALID_CUSTOMER_ID' },
      { status: 400, headers: NO_CACHE_HEADERS },
      req
    );
  }

  try {
    const adminDb = getAdminSupabaseClient();
    const db = adminDb || (await createServerSupabaseClient());

    // 2. Fetch customer identity (tenant isolated)
    const { data: customer, error: cErr } = await db
      .from('customers')
      .select('id, aadhaar_number')
      .eq('id', id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .maybeSingle();

    if (cErr) {
      return jsonResponseWithCors(
        { error: 'Database query error.', code: 'DATABASE_ERROR' },
        { status: 500, headers: NO_CACHE_HEADERS },
        req
      );
    }

    if (!customer) {
      return jsonResponseWithCors(
        { error: 'Customer not found or inaccessible.', code: 'CUSTOMER_NOT_FOUND' },
        { status: 404, headers: NO_CACHE_HEADERS },
        req
      );
    }

    const rawAadhaar = (customer.aadhaar_number || '').trim().replace(/\D/g, '');
    const hasAadhaar = rawAadhaar.length === 12;
    const maskedAadhaar = hasAadhaar ? `**** **** ${rawAadhaar.slice(-4)}` : null;

    if (!hasAadhaar) {
      return jsonResponseWithCors(
        {
          ok: true,
          customerId: customer.id,
          hasAadhaar: false,
          verificationStatus: 'unavailable',
          maskedAadhaar: null,
          documentVerified: false,
        },
        { status: 200, headers: NO_CACHE_HEADERS },
        req
      );
    }

    // 3. Inspect supporting document verification in customer_documents
    // Statutory requirement: Never treat electoral_verification_status alone as proof of Aadhaar verification.
    const { data: verifiedDocs, error: docErr } = await db
      .from('customer_documents')
      .select('id, customer_id, document_type, document_number, verified')
      .eq('customer_id', customer.id)
      .ilike('document_type', '%aadhaar%')
      .eq('verified', true);

    if (docErr) {
      return jsonResponseWithCors(
        { error: 'Failed to verify supporting documents.', code: 'DATABASE_ERROR' },
        { status: 500, headers: NO_CACHE_HEADERS },
        req
      );
    }

    const docMatch = verifyAadhaarDocumentMatch(rawAadhaar, verifiedDocs || []);
    const documentVerified = docMatch.verified;
    const verificationStatus = docMatch.mismatch
      ? 'document_mismatch'
      : docMatch.maskedOnly || docMatch.code === 'AADHAAR_VERIFICATION_REQUIRED'
      ? 'verification_required'
      : documentVerified
      ? 'verified'
      : 'unverified';

    return jsonResponseWithCors(
      {
        ok: true,
        customerId: customer.id,
        hasAadhaar: true,
        verificationStatus,
        maskedAadhaar,
        documentVerified,
      },
      { status: 200, headers: NO_CACHE_HEADERS },
      req
    );
  } catch {
    return jsonResponseWithCors(
      { error: 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500, headers: NO_CACHE_HEADERS },
      req
    );
  }
}

/**
 * POST /api/extension/customers/{id}/aadhaar-fill
 * Authoritatively retrieves verified Aadhaar number under strict operator approval and document verification checks.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const origin = req.headers.get('origin');
  if (origin && !isAllowedExtensionOrigin(origin)) {
    return new NextResponse(
      JSON.stringify({ error: 'Disallowed origin.', code: 'FORBIDDEN_ORIGIN' }),
      { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } }
    );
  }

  // 1. Authenticate with extension pairing token
  const authRes = await validateExtensionAuth(req, 'customers:form_fill');
  if (!authRes.authorized || !authRes.context) {
    return jsonResponseWithCors(
      {
        error: authRes.error || 'Authentication required.',
        code: authRes.code || 'UNAUTHORIZED',
      },
      { status: authRes.status || 401, headers: NO_CACHE_HEADERS },
      req
    );
  }

  const { businessId, userId } = authRes.context;
  const { id } = await context.params;

  if (!id || !UUID_REGEX.test(id)) {
    return jsonResponseWithCors(
      { error: 'Invalid customer ID format.', code: 'INVALID_CUSTOMER_ID' },
      { status: 400, headers: NO_CACHE_HEADERS },
      req
    );
  }

  // 2. Parse and validate operator approval payload
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponseWithCors(
      { error: 'Malformed JSON payload.', code: 'MALFORMED_JSON' },
      { status: 400, headers: NO_CACHE_HEADERS },
      req
    );
  }

  const { operatorApproved, nonce, timestamp, customerId } = body || {};

  if (!operatorApproved) {
    return jsonResponseWithCors(
      {
        error: 'Explicit operator approval is strictly required for Aadhaar autofill.',
        code: 'OPERATOR_APPROVAL_REQUIRED',
      },
      { status: 403, headers: NO_CACHE_HEADERS },
      req
    );
  }

  // Verify that the requested customer matches the approved customer in body
  if (customerId && customerId !== id) {
    return jsonResponseWithCors(
      {
        error: 'Customer mismatch: Approved customer ID does not match route target.',
        code: 'CUSTOMER_MISMATCH',
      },
      { status: 400, headers: NO_CACHE_HEADERS },
      req
    );
  }

  // Verify timestamp freshness to prevent stale or delayed authorization
  const now = Date.now();
  if (typeof timestamp !== 'number' || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) {
    return jsonResponseWithCors(
      {
        error: 'Approval request expired or timestamp out of synchronization window.',
        code: 'APPROVAL_EXPIRED',
      },
      { status: 400, headers: NO_CACHE_HEADERS },
      req
    );
  }

  // Verify single-use nonce format
  if (!nonce || typeof nonce !== 'string' || !NONCE_REGEX.test(nonce)) {
    return jsonResponseWithCors(
      {
        error: 'Invalid or missing cryptographic approval nonce.',
        code: 'INVALID_NONCE',
      },
      { status: 400, headers: NO_CACHE_HEADERS },
      req
    );
  }

  try {
    const adminDb = getAdminSupabaseClient();
    const db = adminDb || (await createServerSupabaseClient());

    // 3. Persistent, atomic single-use nonce check (serverless-safe, zero in-memory Map)
    const nonceRes = await consumeAtomicApprovalNonce(db, businessId, userId, id, nonce);
    if (!nonceRes.ok) {
      if (nonceRes.replayed) {
        return jsonResponseWithCors(
          {
            error: 'Replay detected: This approval nonce has already been consumed.',
            code: 'NONCE_REPLAY_DETECTED',
          },
          { status: 409, headers: NO_CACHE_HEADERS },
          req
        );
      }
      return jsonResponseWithCors(
        {
          error: 'Security verification failure validating approval nonce.',
          code: 'NONCE_VERIFICATION_ERROR',
        },
        { status: 500, headers: NO_CACHE_HEADERS },
        req
      );
    }

    // 4. Query customer record (strictly tenant isolated)
    const { data: customer, error: cErr } = await db
      .from('customers')
      .select('id, aadhaar_number')
      .eq('id', id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .maybeSingle();

    if (cErr) {
      return jsonResponseWithCors(
        { error: 'Database query error.', code: 'DATABASE_ERROR' },
        { status: 500, headers: NO_CACHE_HEADERS },
        req
      );
    }

    if (!customer) {
      return jsonResponseWithCors(
        { error: 'Customer not found or inaccessible.', code: 'CUSTOMER_NOT_FOUND' },
        { status: 404, headers: NO_CACHE_HEADERS },
        req
      );
    }

    const cleanAadhaar = (customer.aadhaar_number || '').trim().replace(/\D/g, '');
    if (!cleanAadhaar || cleanAadhaar.length !== 12) {
      return jsonResponseWithCors(
        {
          error: 'Customer has no valid 12-digit Aadhaar number on file.',
          code: 'AADHAAR_NOT_AVAILABLE',
        },
        { status: 422, headers: NO_CACHE_HEADERS },
        req
      );
    }

    // 5. Authoritative Supporting Document Verification & Integrity Check
    // Statutory requirement: Never treat electoral_verification_status alone as proof of Aadhaar verification.
    const { data: verifiedDocs, error: docErr } = await db
      .from('customer_documents')
      .select('id, customer_id, document_type, document_number, verified')
      .eq('customer_id', customer.id)
      .ilike('document_type', '%aadhaar%')
      .eq('verified', true);

    if (docErr) {
      return jsonResponseWithCors(
        { error: 'Failed to verify supporting documents.', code: 'DATABASE_ERROR' },
        { status: 500, headers: NO_CACHE_HEADERS },
        req
      );
    }

    const docMatch = verifyAadhaarDocumentMatch(cleanAadhaar, verifiedDocs || []);

    if (docMatch.mismatch) {
      return jsonResponseWithCors(
        {
          error:
            'Aadhaar document number in Document Vault does not match customer record. Manual verification required.',
          code: 'AADHAAR_DOCUMENT_MISMATCH',
          verificationStatus: 'document_mismatch',
          maskedAadhaar: `**** **** ${cleanAadhaar.slice(-4)}`,
        },
        { status: 422, headers: NO_CACHE_HEADERS },
        req
      );
    }

    if (docMatch.maskedOnly || docMatch.code === 'AADHAAR_VERIFICATION_REQUIRED') {
      return jsonResponseWithCors(
        {
          error:
            'Aadhaar document in Document Vault contains only a masked or partial number. Independent 12-digit verification required.',
          code: 'AADHAAR_VERIFICATION_REQUIRED',
          verificationStatus: 'verification_required',
          maskedAadhaar: `**** **** ${cleanAadhaar.slice(-4)}`,
        },
        { status: 422, headers: NO_CACHE_HEADERS },
        req
      );
    }

    if (!docMatch.verified) {
      return jsonResponseWithCors(
        {
          error:
            'Aadhaar has not been verified against supporting documents in the Document Vault. Manual entry required.',
          code: 'AADHAAR_UNVERIFIED',
          verificationStatus: 'unverified',
          maskedAadhaar: `**** **** ${cleanAadhaar.slice(-4)}`,
        },
        { status: 422, headers: NO_CACHE_HEADERS },
        req
      );
    }

    // 6. Success: Return minimal data for authorized fill with strictly non-cached headers
    const maskedAadhaar = `**** **** ${cleanAadhaar.slice(-4)}`;
    return jsonResponseWithCors(
      {
        ok: true,
        customerId: customer.id,
        aadhaarNumber: cleanAadhaar,
        maskedAadhaar,
        verified: true,
      },
      { status: 200, headers: NO_CACHE_HEADERS },
      req
    );
  } catch {
    return jsonResponseWithCors(
      { error: 'Internal server error processing Aadhaar fill.', code: 'INTERNAL_ERROR' },
      { status: 500, headers: NO_CACHE_HEADERS },
      req
    );
  }
}
