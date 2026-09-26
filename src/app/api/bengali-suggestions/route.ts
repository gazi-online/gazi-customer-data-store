/**
 * src/app/api/bengali-suggestions/route.ts
 *
 * POST-only internal GCDS route for Hybrid Bengali name suggestions.
 *
 * Architecture:
 *   Client (CustomerForm / ReviewPanel)
 *     → POST /api/bengali-suggestions  { first_name, middle_name, last_name, full_name, doc_candidate }
 *     → constructCustomerCanonicalName (extracts ONLY customer name fields)
 *     → NativeNameSuggestionProvider:
 *         1. Google Input Tools (remote HTTPS request, 3s timeout)
 *         2. LocalBengaliProvider (local dictionary + phonetic syllable engine fallback)
 *         3. Safe document OCR candidate integration
 *     → Client receives deduplicated Bengali suggestions (max 3)
 *
 * Privacy / Security:
 *   - Only minimum customer name text is sent to Google.
 *   - NEVER accepts or sends father_name, guardian_name, mother_name, spouse_name,
 *     address, phone, DOB, Aadhaar, PAN, or other sensitive identifiers.
 *   - No persistent logging of customer names.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  constructCustomerCanonicalName,
  getBengaliNameSuggestions,
} from '@/lib/names/NativeNameSuggestionProvider';
import { isNonPersonNameCandidate } from '@/lib/names/nameSafety';

export const runtime = 'nodejs';

const MAX_NAME_LENGTH = 200;

export async function POST(request: NextRequest) {
  // ── Parse JSON body ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Expected a JSON object body.', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;

  // ── Construct canonical customer name (strictly customer name fields) ───
  const canonicalName = constructCustomerCanonicalName({
    first_name: typeof payload.first_name === 'string' ? payload.first_name : undefined,
    middle_name: typeof payload.middle_name === 'string' ? payload.middle_name : undefined,
    last_name: typeof payload.last_name === 'string' ? payload.last_name : undefined,
    full_name: typeof payload.full_name === 'string' ? payload.full_name : undefined,
  });

  const docCandidate = typeof payload.doc_candidate === 'string' ? payload.doc_candidate : null;

  if (!canonicalName) {
    return NextResponse.json({
      suggestions: [],
      items: [],
      usedFallback: false,
      skipped: true,
    });
  }

  if (canonicalName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Customer name exceeds maximum length of ${MAX_NAME_LENGTH} characters.`, code: 'NAME_TOO_LONG' },
      { status: 400 }
    );
  }

  // ── Non-person safety check ──────────────────────────────────────────────
  if (isNonPersonNameCandidate(canonicalName)) {
    return NextResponse.json({
      suggestions: [],
      items: [],
      usedFallback: false,
      skipped: true,
    });
  }

  // ── Hybrid Suggestion Resolution ─────────────────────────────────────────
  try {
    const result = await getBengaliNameSuggestions(canonicalName, docCandidate);

    return NextResponse.json({
      suggestions: result.suggestions,
      items: result.suggestions.map(s => ({ value: s })),
      usedFallback: result.usedFallback,
    });
  } catch {
    return NextResponse.json({
      suggestions: [],
      items: [],
      usedFallback: true,
      unavailable: true,
    });
  }
}
