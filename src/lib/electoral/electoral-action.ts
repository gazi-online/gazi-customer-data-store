"use server";

import { ElectoralConstituencyProvider } from './ElectoralConstituencyProvider';
import {
  ElectoralLookupLocationContext,
  ElectoralLookupResult,
  ElectoralCandidate,
} from './electoral-types';
import { searchWestBengalConstituencies } from './data/westBengalConstituencies';

/**
 * Server action: Safe electoral constituency lookup from address context.
 * Protects server boundary and performs deterministic AC / PC resolution.
 */
export async function lookupElectoralConstituency(
  context: ElectoralLookupLocationContext
): Promise<ElectoralLookupResult> {
  return ElectoralConstituencyProvider.lookup(context);
}

/**
 * Server action: Safe manual search over canonical West Bengal constituencies.
 * Allows searching by AC number, AC name, partial name, or PC number/name.
 */
export async function searchConstituenciesAction(
  query: string
): Promise<ElectoralCandidate[]> {
  return searchWestBengalConstituencies(query);
}
