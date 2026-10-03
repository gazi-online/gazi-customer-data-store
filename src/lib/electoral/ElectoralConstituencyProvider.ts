/**
 * Authoritative Electoral Constituency Provider
 *
 * Implements deterministic Assembly Constituency (AC) and Parliamentary Constituency (PC)
 * lookup for Customer Create/Edit flows.
 *
 * Built strictly according to Election Commission of India (ECI) Delimitation Orders
 * and CEO West Bengal electoral roll jurisdiction mapping.
 *
 * Invariant: Never guesses or infers constituency from vague similarity.
 * Single/unique match auto-fills; ambiguous multi-AC PINs return all candidates for operator selection.
 */

import {
  IElectoralConstituencyProvider,
  ElectoralLookupLocationContext,
  ElectoralLookupResult,
  ElectoralCandidate,
} from './electoral-types';
import { WEST_BENGAL_PINCODE_MAPPINGS, PincodeElectoralMapping } from './data/westBengalConstituencies';

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

      // 6. Match against authoritative dataset
      const mapping = cleanPin
        ? WEST_BENGAL_PINCODE_MAPPINGS.find(m => m.pincode === cleanPin)
        : undefined;

      if (mapping) {
        result = this.resolvePincodeMapping(mapping, postOffice, address);
      } else {
        // Fallback: search by locality/post office keywords if PIN is missing or unmapped in dataset
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
   * If unique: returns single candidate with status 'unique'.
   * If multi-AC: attempts deterministic disambiguation via post office and address keywords.
   * If still ambiguous: returns all candidates with status 'multiple' — NEVER GUESSES.
   */
  private resolvePincodeMapping(
    mapping: PincodeElectoralMapping,
    postOffice: string,
    address: string
  ): ElectoralLookupResult {
    // Case A: PIN is geographically unique to a single Assembly Constituency
    if (mapping.isUnique && mapping.candidates.length === 1) {
      return {
        status: 'unique',
        candidates: mapping.candidates,
        source: mapping.candidates[0].source,
        reason: 'Constituency matched from address',
      };
    }

    // Case B: PIN covers multiple Assembly Constituencies
    const searchText = `${postOffice} ${address}`.trim();

    if (mapping.subMappings && mapping.subMappings.length > 0 && searchText) {
      const matchedCandidates: ElectoralCandidate[] = [];

      for (const sub of mapping.subMappings) {
        let isMatched = false;

        // Check exact or partial post office name
        if (sub.postOffices && postOffice) {
          isMatched = sub.postOffices.some(po => {
            const cleanPo = po.toLowerCase();
            return postOffice.includes(cleanPo) || cleanPo.includes(postOffice);
          });
        }

        // Check locality keywords in address or post office
        if (!isMatched && sub.localityKeywords) {
          isMatched = sub.localityKeywords.some(keyword => {
            const cleanKeyword = keyword.toLowerCase();
            const regex = new RegExp(`\\b${cleanKeyword}\\b`, 'i');
            return regex.test(searchText);
          });
        }

        if (isMatched) {
          // Avoid duplicate candidate entries
          if (!matchedCandidates.some(c => c.assembly_constituency_number === sub.candidate.assembly_constituency_number)) {
            matchedCandidates.push(sub.candidate);
          }
        }
      }

      // If exactly one sub-mapping resolved uniquely
      if (matchedCandidates.length === 1) {
        return {
          status: 'unique',
          candidates: matchedCandidates,
          source: matchedCandidates[0].source,
          reason: 'Constituency matched from address',
        };
      }

      // If multiple sub-mappings matched, return them as candidates
      if (matchedCandidates.length > 1) {
        return {
          status: 'multiple',
          candidates: matchedCandidates,
          source: matchedCandidates[0].source,
          reason: 'Multiple constituencies found — select the correct one',
        };
      }
    }

    // Default for ambiguous PIN with unresolved or missing post office/address details:
    // Return all possible candidates for operator selection. DO NOT GUESS.
    return {
      status: 'multiple',
      candidates: mapping.candidates,
      source: mapping.candidates[0]?.source,
      reason: 'Multiple constituencies found — select the correct one',
    };
  }

  /**
   * Fallback resolution when PIN is unmapped or absent, searching authoritative constituency
   * names and known localities within address text.
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

    for (const mapping of WEST_BENGAL_PINCODE_MAPPINGS) {
      for (const cand of mapping.candidates) {
        const acName = cand.assembly_constituency.toLowerCase();
        // Regex word boundary match on full constituency name
        const regex = new RegExp(`\\b${acName.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (regex.test(searchText)) {
          if (!matchedCandidates.some(c => c.assembly_constituency_number === cand.assembly_constituency_number)) {
            matchedCandidates.push(cand);
          }
        }
      }

      // Also check subMapping localities
      if (mapping.subMappings) {
        for (const sub of mapping.subMappings) {
          if (sub.localityKeywords) {
            const hasKeyword = sub.localityKeywords.some(kw => {
              const regex = new RegExp(`\\b${kw}\\b`, 'i');
              return regex.test(searchText);
            });
            if (hasKeyword) {
              if (!matchedCandidates.some(c => c.assembly_constituency_number === sub.candidate.assembly_constituency_number)) {
                matchedCandidates.push(sub.candidate);
              }
            }
          }
        }
      }
    }

    if (matchedCandidates.length === 1) {
      return {
        status: 'unique',
        candidates: matchedCandidates,
        source: matchedCandidates[0].source,
        reason: 'Constituency matched from address',
      };
    }

    if (matchedCandidates.length > 1) {
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
