/**
 * src/app/api/bengali-suggestions/route.ts
 *
 * POST-only internal GCDS route for Bengali name suggestions.
 *
 * Architecture:
 *   ReviewPanel (client)
 *     → POST /api/bengali-suggestions  { full_name: "Reshma Khatun" }
 *     → GoogleInputToolsProvider (server)
 *     → HTTPS GET https://inputtools.google.com/request
 *     → Bengali suggestions → client
 *
 * Privacy rationale:
 *   POST body is not recorded in browser URL history, access logs, or
 *   reverse-proxy analytics, unlike GET query parameters.
 *
 * Response shapes:
 *   200  { suggestions: GoogleBengaliSuggestion[] }
 *   200  { suggestions: [], skipped: true }     — Bengali/govt-header input
 *   200  { suggestions: [], unavailable: true } — Google timeout / HTTP error
 *   400  { error: "...", code: "..." }           — bad request
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchBengaliSuggestions } from '@/lib/names/GoogleInputToolsProvider';
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

  const { full_name } = body as Record<string, unknown>;

  // ── Validate full_name field ─────────────────────────────────────────────
  if (typeof full_name !== 'string') {
    return NextResponse.json(
      { error: 'full_name must be a string.', code: 'INVALID_FIELD' },
      { status: 400 }
    );
  }

  const trimmed = full_name.trim();

  if (!trimmed) {
    return NextResponse.json(
      { error: 'full_name must not be empty.', code: 'EMPTY_NAME' },
      { status: 400 }
    );
  }

  if (trimmed.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `full_name exceeds maximum length of ${MAX_NAME_LENGTH} characters.`, code: 'NAME_TOO_LONG' },
      { status: 400 }
    );
  }

  // ── Safety pre-check (shared with OCR path) ─────────────────────────────
  // isNonPersonNameCandidate is also checked inside GoogleInputToolsProvider,
  // but we short-circuit early here to avoid unnecessary provider invocation.
  if (isNonPersonNameCandidate(trimmed)) {
    return NextResponse.json({ suggestions: [], skipped: true });
  }

  // ── Delegate to Google Input Tools provider ──────────────────────────────
  const result = await fetchBengaliSuggestions(trimmed);

  if (!result.ok) {
    if (result.error === 'skipped') {
      return NextResponse.json({ suggestions: [], skipped: true });
    }
    // 'unavailable' — Google timed out or returned an error
    return NextResponse.json({ suggestions: [], unavailable: true });
  }

  return NextResponse.json({ suggestions: result.suggestions });
}
