/**
 * Electoral Constituency Provider (Safety Hardened & Fail-Closed)
 *
 * Implements Assembly Constituency (AC) and Parliamentary Constituency (PC)
 * resolution for Customer Create/Edit flows.
 *
 * Built strictly according to Election Commission of India (ECI) Delimitation Orders
 * and CEO West Bengal electoral roll jurisdiction mapping.
 *
 * CRITICAL FAIL-CLOSED SAFETY INVARIANTS:
 * 1. Delimitation documents establish electoral boundaries (CD Blocks, Wards, GPs).
 *    They DO NOT establish that an entire postal PIN belongs uniquely to one AC.
 * 2. status='unique' (silent auto-fill) is STRICTLY PROHIBITED unless certified
 *    statutory evidence proves the WHOLE postal PIN delivery area is 100% contained
 *    within a single constituency.
 * 3. All uncertified, operator-curated, or multi-constituency PINs fail closed to
 *    status='multiple' with candidates presented for explicit operator review.
 * 4. Free-text address or locality keyword matching NEVER generates status='unique'.
 * 5. Priority: correct but manual > fast but wrong.
 */

import {
  IElectoralConstituencyProvider,
  ElectoralLookupLocationContext,
  ElectoralLookupResult,
  ElectoralCandidate,
} from './electoral-types';
import {
  WEST_BENGAL_PINCODE_MAPPINGS,
  PincodeElectoralMapping,
  OFFICIAL_CONSTITUENCY_CATALOG,
  validateConstituency,
} from './data/westBengalConstituencies';

interface CacheEntry {
  result: ElectoralLookupResult;
  timestamp: number;
}

const lookupCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AuthoritativeElectoralConstituencyProvider implements IElectoralConstituencyProvider {
  async lookup(context: ElectoralLookupLocationContext): Promise<ElectoralLookupResult> {
    try {
      // 1. Normalize location context
      const rawPin = context.pincode || '';
      const cleanPin = rawPin.replace(/\D/g, '').trim();
      const rawCountry = (context.country || 'India').trim().toLowerCase();
      const rawState = (context.state || '').trim().toLowerCase();
      const postOffice = (context.post_office || '').trim().toLowerCase();
      const address = (context.address || '').trim().toLowerCase();

      // 2. Validate Country
      if (rawCountry && rawCountry !== 'india') {
        return {
          status: 'not_found',
          candidates: [],
          reason: 'Electoral lookup is only available for Indian addresses.',
        };
      }

      // 3. Validate minimum input requirements
      if (cleanPin.length !== 6 && !address && !postOffice) {
        return {
          status: 'insufficient_data',
          candidates: [],
          reason: 'Need more address details',
        };
      }

      // 4. Validate State (West Bengal authority scope)
      const isWestBengal =
        !rawState ||
        rawState === 'west bengal' ||
        rawState === 'wb' ||
        rawState.includes('bengal');

      if (rawState && !isWestBengal) {
        return {
          status: 'not_found',
          candidates: [],
          reason: 'Authoritative constituency mapping is only available for West Bengal at this time.',
        };
      }

      // 5. Cache Key check
      const cacheKey = `${cleanPin}|${postOffice}|${address.slice(0, 100)}`;
      const cached = lookupCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.result;
      }

      let result: ElectoralLookupResult;

      // 6. Match against dataset
      const mapping = cleanPin
        ? WEST_BENGAL_PINCODE_MAPPINGS.find(m => m.pincode === cleanPin)
        : undefined;

      if (mapping) {
        result = this.resolvePincodeMapping(mapping);
      } else {
        // Fallback: search by locality/post office keywords if PIN is missing or unmapped
        result = this.resolveByLocalityFallback(postOffice, address);
      }

      // 7. Store in cache and return
      lookupCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown provider error';
      return {
        status: 'provider_error',
        candidates: [],
        error: errorMsg,
        reason: 'Unable to check constituency',
      };
    }
  }

  /**
   * Resolves a known PIN mapping.
   *
   * FAIL-CLOSED AUTOFILL POLICY:
   * status='unique' (silent auto-fill) is permitted IF AND ONLY IF:
   * - mapping.isUnique === true
   * - mapping.isDeterministic === true
   * - exactly 1 valid candidate
   * - mapping.provenance.source_type === 'official' (statutory certified source only)
   * - mapping.provenance.confidence === 'high'
   *
   * If ANY condition is not met (operator-curated, uncertified, ambiguous, or medium/low confidence):
   * Provider FAILS CLOSED to status='multiple' with candidates presented for operator confirmation.
   * NEVER SILENTLY AUTO-FILLS UNLESS PROVENANCE IS OFFICIAL & TRUSTWORTHY.
   */
  private resolvePincodeMapping(
    mapping: PincodeElectoralMapping
  ): ElectoralLookupResult {
    // Validate all candidates against canonical catalog
    const validCandidates = mapping.candidates.filter(cand =>
      validateConstituency(
        cand.assembly_constituency_number,
        cand.assembly_constituency,
        cand.parliamentary_constituency_number,
        cand.parliamentary_constituency
      )
    );

    if (validCandidates.length === 0) {
      return {
        status: 'not_found',
        candidates: [],
        reason: 'No verified constituency match found in canonical catalog',
      };
    }

    // Fail-closed gate: Requires statutory 'official' source_type and 'high' confidence
    const isStatutoryOfficialSource = mapping.provenance.source_type === 'official';
    const canAutoFill =
      mapping.isUnique === true &&
      mapping.isDeterministic === true &&
      validCandidates.length === 1 &&
      isStatutoryOfficialSource &&
      mapping.provenance.confidence === 'high';

    if (canAutoFill) {
      return {
        status: 'unique',
        candidates: validCandidates,
        source: validCandidates[0].source,
        reason: 'Constituency matched from verified official statutory electoral mapping',
      };
    }

    // Default fail-closed: return candidate(s) for operator review. NEVER GUESS OR SILENTLY AUTO-FILL.
    return {
      status: 'multiple',
      candidates: validCandidates,
      source: validCandidates[0]?.source,
      reason: 'Constituency candidates found — operator confirmation required',
    };
  }

  /**
   * Fallback resolution when PIN is unmapped or absent, searching canonical constituency
   * names within address or post office text.
   *
   * Invariant: Free-text/locality keywords NEVER produce status='unique'.
   * Always fails closed to status='multiple' with confidence 'low' for operator review.
   */
  private resolveByLocalityFallback(
    postOffice: string,
    address: string
  ): ElectoralLookupResult {
    const searchText = `${postOffice} ${address}`.trim();
    if (!searchText || searchText.length < 3) {
      return {
        status: 'not_found',
        candidates: [],
        reason: 'No reliable constituency match found',
      };
    }

    const matchedCandidates: ElectoralCandidate[] = [];

    // Search against OFFICIAL_CONSTITUENCY_CATALOG
    for (const [acNum, official] of Object.entries(OFFICIAL_CONSTITUENCY_CATALOG)) {
      const acBaseName = official.ac_name.replace(/\s*\((sc|st)\)\s*$/i, '').trim().toLowerCase();
      const regex = new RegExp(`\\b${acBaseName.replace(/\s+/g, '\\s+')}\\b`, 'i');

      if (regex.test(searchText)) {
        if (!matchedCandidates.some(c => c.assembly_constituency_number === acNum)) {
          matchedCandidates.push({
            assembly_constituency: official.ac_name,
            assembly_constituency_number: official.ac_number,
            parliamentary_constituency: official.pc_name,
            parliamentary_constituency_number: official.pc_number,
            source: 'Locality Keyword Suggestion (Unverified)',
            source_type: 'operator_curated',
            source_reference: `Keyword matched in text: "${official.ac_name}"`,
            confidence: 'low',
            reason: `Locality name found in address text — operator verification required`,
          });
        }
      }
    }

    if (matchedCandidates.length > 0) {
      // Safety rule: Unverified keyword matches ALWAYS require operator review.
      // NEVER return 'unique' from free-text keyword heuristics.
      return {
        status: 'multiple',
        candidates: matchedCandidates,
        source: matchedCandidates[0].source,
        reason: 'Constituency candidates found — operator confirmation required',
      };
    }

    return {
      status: 'not_found',
      candidates: [],
      reason: 'No reliable constituency match found',
    };
  }

  static clearCache() {
    lookupCache.clear();
  }
}

// Active singleton provider instance
const activeElectoralProvider: IElectoralConstituencyProvider =
  new AuthoritativeElectoralConstituencyProvider();

export class ElectoralConstituencyProvider {
  static async lookup(context: ElectoralLookupLocationContext): Promise<ElectoralLookupResult> {
    return activeElectoralProvider.lookup(context);
  }

  static clearCache() {
    AuthoritativeElectoralConstituencyProvider.clearCache();
  }
}
