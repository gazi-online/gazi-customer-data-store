/**
 * Extension Customer Search API Endpoint
 * File: src/app/api/extension/customers/search/route.ts
 *
 * GET /api/extension/customers/search?q=...
 *
 * Provides minimal, privacy-hardened customer lookups for the browser extension.
 * Returns ONLY: { id, customerCode, name, mobileMasked }.
 * Strictly excludes Aadhaar, PAN, GST, documents, notes, and financial data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateExtensionAuth } from '@/lib/auth/extensionAuth';
import {
  handleExtensionCorsPreflight,
  jsonResponseWithCors,
  isAllowedExtensionOrigin,
} from '@/lib/auth/extensionCors';
import { getAdminSupabaseClient } from '@/lib/auth/adminMfaReset';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Masks a mobile number to protect customer privacy in search listings.
 * e.g. "+91-9876543210" -> "+91-******3210"
 * e.g. "9876543210" -> "******3210"
 */
export function maskMobile(phone: string | null | undefined): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return '****';

  if (cleaned.startsWith('+')) {
    const parts = cleaned.split('-');
    if (parts.length > 1) {
      const prefix = parts[0];
      const rest = parts.slice(1).join('-');
      const last4 = rest.slice(-4);
      return `${prefix}-******${last4}`;
    }
  }

  const last4 = cleaned.slice(-4);
  return `******${last4}`;
}

export async function OPTIONS(req: NextRequest) {
  return handleExtensionCorsPreflight(req);
}

export async function GET(req: NextRequest) {
  // 0. Verify origin if present
  const origin = req.headers.get('origin');
  if (origin && !isAllowedExtensionOrigin(origin)) {
    return new NextResponse(
      JSON.stringify({ error: 'Disallowed origin.', code: 'FORBIDDEN_ORIGIN' }),
      { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } }
    );
  }

  // 1. Authenticate & authorize token with 'customers:search' scope
  const authRes = await validateExtensionAuth(req, 'customers:search');
  if (!authRes.authorized || !authRes.context) {
    return jsonResponseWithCors(
      {
        error: authRes.error || 'Authentication required.',
        code: authRes.code || 'UNAUTHORIZED',
      },
      { status: authRes.status || 401 },
      req
    );
  }

  const { businessId } = authRes.context;

  // 2. Extract and validate search parameter
  const q = req.nextUrl.searchParams.get('q')?.trim() || '';
  if (q.length < 2 || q.length > 100) {
    return jsonResponseWithCors(
      {
        error: 'Search query must be between 2 and 100 characters.',
        code: 'INVALID_QUERY_LENGTH',
      },
      { status: 400 },
      req
    );
  }

  try {
    // 3. Resolve database client (server-side authenticated)
    const adminDb = getAdminSupabaseClient();
    const db = adminDb || (await createServerSupabaseClient());

    // 4. Query customers strictly matching business_id, active status, and not deleted
    // Searches: customer_code, first_name, middle_name, last_name, phone
    const safeQ = q.replace(/[%_,]/g, '\\$&'); // Sanitize wildcards

    const { data, error } = await db
      .from('customers')
      .select('id, customer_code, first_name, middle_name, last_name, phone')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .or(
        `customer_code.ilike.%${safeQ}%,first_name.ilike.%${safeQ}%,middle_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`
      )
      .order('first_name', { ascending: true })
      .limit(15);

    if (error) {
      return jsonResponseWithCors(
        {
          error: 'Failed to execute customer search.',
          code: 'DATABASE_QUERY_ERROR',
        },
        { status: 500 },
        req
      );
    }

    // 5. Transform into minimal, privacy-compliant DTO
    const results = (data || []).map((c) => ({
      id: c.id,
      customerCode: c.customer_code,
      name: [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' '),
      mobileMasked: maskMobile(c.phone),
    }));

    return jsonResponseWithCors(results, { status: 200 }, req);
  } catch {
    return jsonResponseWithCors(
      {
        error: 'Internal server error while searching customers.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
      req
    );
  }
}
