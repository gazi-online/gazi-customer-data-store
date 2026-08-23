/**
 * src/lib/names/GoogleInputToolsProvider.ts
 *
 * Server-only Bengali name transliteration via Google Input Tools.
 *
 * Privacy rules (STRICT):
 *   - ONLY the English full_name (plain text, person name) is sent.
 *   - NO document images.
 *   - NO Aadhaar / PAN / Voter ID numbers.
 *   - NO addresses, DOB, gender, or OCR text.
 *   - NO raw documents.
 *
 * Failure policy:
 *   - Timeout (5 s), 4xx, 5xx, or malformed response → { ok: false, error: 'unavailable' }
 *   - Smart Import continues normally — no crash, no fallback to Gemini/OpenAI/Claude.
 *
 * Cache: in-memory, normalized name → suggestions, 24 h TTL.
 */

import { isNonPersonNameCandidate } from './nameSafety';
import { isBengaliScript } from './BengaliNameTransliterator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GoogleBengaliSuggestion {
  value: string;
  source: 'google_input_tools';
}

export type BengaliSuggestionResult =
  | { ok: true;  suggestions: GoogleBengaliSuggestion[] }
  | { ok: false; error: 'unavailable' | 'skipped' };

// ---------------------------------------------------------------------------
// In-memory server-side cache (24 h TTL, keyed by normalised name)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  suggestions: GoogleBengaliSuggestion[];
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

function _cacheKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function _getCached(key: string): GoogleBengaliSuggestion[] | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.suggestions;
}

function _setCached(key: string, suggestions: GoogleBengaliSuggestion[]): void {
  _cache.set(key, { suggestions, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Google Input Tools endpoint constants
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://inputtools.google.com/request';
const TRANSLITERATION_CODE = 'bn-t-i0-und';
const MAX_SUGGESTIONS = 3;
const TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Parses the raw Google Input Tools response array.
 *
 * Expected shape:
 *   ["SUCCESS", [["input_text", ["sug1", "sug2", "sug3"], {}]]]
 *
 * Returns [] on any deviation (never throws).
 */
function parseGoogleResponse(raw: unknown): GoogleBengaliSuggestion[] {
  if (!Array.isArray(raw)) return [];
  if (raw[0] !== 'SUCCESS') return [];

  const resultSet = raw[1];
  if (!Array.isArray(resultSet) || resultSet.length === 0) return [];

  // Each element of resultSet corresponds to one input word/phrase.
  // We look at the first (and usually only) element.
  const firstResult = resultSet[0];
  if (!Array.isArray(firstResult) || firstResult.length < 2) return [];

  const candidates = firstResult[1];
  if (!Array.isArray(candidates)) return [];

  const seen = new Set<string>();
  const suggestions: GoogleBengaliSuggestion[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    // Must contain Bengali Unicode characters — reject Latin-only responses
    if (!/[\u0980-\u09FF]/.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    suggestions.push({ value: trimmed, source: 'google_input_tools' });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch Bengali transliteration suggestions for an English full name.
 *
 * Only `fullName` (the plain English person name string) is sent to Google.
 * Never sends documents, IDs, addresses, or any other customer data.
 *
 * Returns:
 *   { ok: true,  suggestions: [] }      — when name is empty / Bengali / govt header
 *   { ok: false, error: 'skipped' }     — when no request should be made (Bengali or header)
 *   { ok: false, error: 'unavailable' } — when Google request fails (timeout/4xx/5xx/parse)
 *   { ok: true,  suggestions: [...] }   — on success
 */
export async function fetchBengaliSuggestions(
  fullName: string
): Promise<BengaliSuggestionResult> {
  if (!fullName || typeof fullName !== 'string') {
    return { ok: true, suggestions: [] };
  }

  const trimmed = fullName.trim();
  if (!trimmed) return { ok: true, suggestions: [] };

  // Guard A: name is already in Bengali script → skip request
  if (isBengaliScript(trimmed)) {
    return { ok: false, error: 'skipped' };
  }

  // Guard B: government/department/header → skip request
  if (isNonPersonNameCandidate(trimmed)) {
    return { ok: false, error: 'skipped' };
  }

  // Cache hit
  const cacheKey = _cacheKey(trimmed);
  const cached = _getCached(cacheKey);
  if (cached !== null) {
    return { ok: true, suggestions: cached };
  }

  // Build HTTPS request URL — ONLY full_name is sent
  const params = new URLSearchParams({
    text: trimmed,
    itc:  TRANSLITERATION_CODE,
    num:  String(MAX_SUGGESTIONS),
    cp:   '0',
    cs:   '1',
    ie:   'utf-8',
    oe:   'utf-8',
    app:  'test',
  });

  const url = `${ENDPOINT}?${params.toString()}`;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timerId);

    if (!response.ok) {
      console.warn(`[GoogleInputTools] HTTP error status=${response.status}`);
      return { ok: false, error: 'unavailable' };
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      console.warn('[GoogleInputTools] JSON parse error');
      return { ok: false, error: 'unavailable' };
    }

    const suggestions = parseGoogleResponse(raw);
    _setCached(cacheKey, suggestions);
    return { ok: true, suggestions };

  } catch (err: unknown) {
    clearTimeout(timerId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[GoogleInputTools] Request timed out after ${TIMEOUT_MS}ms`);
    } else {
      console.warn('[GoogleInputTools] Request failed');
    }
    return { ok: false, error: 'unavailable' };
  }
}
