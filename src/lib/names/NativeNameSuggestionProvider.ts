/**
 * src/lib/names/NativeNameSuggestionProvider.ts
 *
 * Hybrid Bengali Name Suggestion Orchestrator.
 *
 * Hierarchy:
 *   1. Google Input Tools (Remote Transliteration — optional, non-critical)
 *   2. Local Bengali Transliteration (Deterministic Fallback)
 *
 * Product Rules:
 *   - ONLY the customer's canonical English name (first_name + middle_name + last_name,
 *     or full_name) may be used as transliteration source.
 *   - NEVER use father_name, guardian_name, mother_name, spouse_name, address, or
 *     document headers as the transliteration input.
 *   - Suggestions must be explicitly confirmed by the operator before population.
 *   - Deduplicated, capped at 3 suggestions.
 */

import { fetchBengaliSuggestions } from './GoogleInputToolsProvider';
import { suggestBengaliNames } from './LocalBengaliProvider';
import { isNonPersonNameCandidate, hasMeaningfulNativeScript } from './nameSafety';
import { isBengaliScript } from './BengaliNameTransliterator';

export interface CustomerNameInput {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}

export interface HybridSuggestionResult {
  suggestions: string[];
  usedFallback: boolean;
}

/**
 * Constructs ONLY the customer's canonical English name from customer identity fields.
 * Explicitly ignores and excludes any relationship or non-customer fields.
 */
export function constructCustomerCanonicalName(data: CustomerNameInput): string {
  if (!data || typeof data !== 'object') return '';

  const first = typeof data.first_name === 'string' ? data.first_name.trim() : '';
  const middle = typeof data.middle_name === 'string' ? data.middle_name.trim() : '';
  const last = typeof data.last_name === 'string' ? data.last_name.trim() : '';

  const components = [first, middle, last].filter(Boolean);
  if (components.length > 0) {
    return components.join(' ');
  }

  if (typeof data.full_name === 'string' && data.full_name.trim()) {
    return data.full_name.trim();
  }

  return '';
}

/**
 * Orchestrates hybrid Bengali name suggestions:
 * 1. Tries Google Input Tools (remote)
 * 2. Falls back seamlessly to LocalBengaliProvider if Google is unavailable, times out, or fails
 * 3. Optionally merges a safe document-extracted OCR candidate if valid
 * 4. Deduplicates and caps at 3 suggestions
 */
export async function getBengaliNameSuggestions(
  customerEnglishName: string,
  docNativeCandidate?: string | null,
  providers?: {
    fetchGoogle?: typeof fetchBengaliSuggestions;
    suggestLocal?: typeof suggestBengaliNames;
  }
): Promise<HybridSuggestionResult> {
  const fetchGoogle = providers?.fetchGoogle || fetchBengaliSuggestions;
  const suggestLocal = providers?.suggestLocal || suggestBengaliNames;

  const trimmed = typeof customerEnglishName === 'string' ? customerEnglishName.trim() : '';

  // Blank or invalid English name -> no provider call
  if (!trimmed) {
    return { suggestions: [], usedFallback: false };
  }

  // Reject document headers / organization / non-person strings
  if (isNonPersonNameCandidate(trimmed)) {
    return { suggestions: [], usedFallback: false };
  }

  // If already pure Bengali script, return it directly
  if (isBengaliScript(trimmed) && hasMeaningfulNativeScript(trimmed)) {
    return { suggestions: [trimmed], usedFallback: false };
  }

  let candidates: string[] = [];
  let usedFallback = false;

  // Step 1: Try Google Input Tools
  try {
    const googleResult = await fetchGoogle(trimmed);
    if (googleResult.ok && googleResult.suggestions.length > 0) {
      candidates = googleResult.suggestions.map(s => s.value.trim());
      usedFallback = false;
    } else {
      // Google skipped or unavailable -> fallback to local
      candidates = suggestLocal(trimmed);
      usedFallback = true;
    }
  } catch {
    // Graceful error recovery: never throw, fallback to local
    candidates = suggestLocal(trimmed);
    usedFallback = true;
  }

  // If Google returned 0 candidates, attempt local fallback
  if (candidates.length === 0) {
    candidates = suggestLocal(trimmed);
    usedFallback = true;
  }

  // Step 2: Incorporate safe document OCR candidate if present
  if (docNativeCandidate && typeof docNativeCandidate === 'string') {
    const docClean = docNativeCandidate.trim();
    if (
      docClean &&
      isBengaliScript(docClean) &&
      hasMeaningfulNativeScript(docClean) &&
      !isNonPersonNameCandidate(docClean)
    ) {
      // Prepend document native candidate as first suggestion if not already present
      candidates = [docClean, ...candidates];
    }
  }

  // Step 3: Deduplicate & normalize, cap at 3
  const seen = new Set<string>();
  const finalSuggestions: string[] = [];

  for (const c of candidates) {
    const normalized = c.trim().replace(/\s+/g, ' ');
    if (
      normalized &&
      !seen.has(normalized) &&
      isBengaliScript(normalized) &&
      hasMeaningfulNativeScript(normalized)
    ) {
      seen.add(normalized);
      finalSuggestions.push(normalized);
      if (finalSuggestions.length >= 3) break;
    }
  }

  return {
    suggestions: finalSuggestions,
    usedFallback,
  };
}
