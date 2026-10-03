/**
 * Electoral Constituency Provider (Safety Hardened)
 *
 * Implements deterministic Assembly Constituency (AC) and Parliamentary Constituency (PC)
 * lookup for Customer Create/Edit flows.
 *
 * Built strictly according to Election Commission of India (ECI) Delimitation Orders
 * and CEO West Bengal electoral roll jurisdiction mapping.
 *
 * Invariants:
 * 1. Never guesses or infers constituency from vague similarity.
 * 2. Only auto-fills without operator selection when a location mapping is sufficiently
 *    verified, deterministic, and backed by traceable official/local provenance.
 * 3. Ambiguous PINs, operator-curated mappings, or address keyword matches NEVER silently auto-fill;
 *    they return candidates with status 'multiple' for explicit operator review and selection.
 * 4. Priority: correct but manual > fast but wrong.
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
   * AUTO-FILL POLICY:
   * Only auto-fills (status 'unique') when the mapping is:
   * - isUnique === true
   * - isDeterministic === true
   * - exactly 1 candidate
   * - source_type === 'verified_local_mapping'
   * - confidence === 'high'
   *
   * If any condition fails (ambiguous, multi-AC, or operator-curated):
   * Returns status 'multiple' with candidates for operator review.
   * NEVER GUESSES.
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

    const canAutoFill =
      mapping.isUnique &&
      mapping.isDeterministic &&
      validCandidates.length === 1 &&
      mapping.provenance.source_type === 'verified_local_mapping' &&
      mapping.provenance.confidence === 'high';

    if (canAutoFill) {
      return {
        status: 'unique',
        candidates: validCandidates,
        source: validCandidates[0].source,
        reason: 'Constituency matched from address',
      };
    }

    // Ambiguous, multi-constituency, or operator-curated mapping:
    // Requires operator selection. DO NOT GUESS.
    return {
      status: 'multiple',
      candidates: validCandidates,
      source: validCandidates[0]?.source,
      reason: 'Multiple constituencies found — select the correct one',
    };
  }

  /**
   * Fallback resolution when PIN is unmapped or absent, searching canonical constituency
   * names within address or post office text.
   *
   * Critical safety rule:
   * Unverified locality keywords from free text MUST NEVER produce an authoritative unique match.
   * Any keyword match returns status 'multiple' so operator must confirm.
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
        reason: 'Multiple constituencies found — select the correct one',
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
