"use server";

import { ElectoralConstituencyProvider } from './ElectoralConstituencyProvider';
import { ElectoralLookupLocationContext, ElectoralLookupResult } from './electoral-types';

/**
 * Server action: Safe electoral constituency lookup.
 * Protects server boundary and performs deterministic AC / PC resolution.
 */
export async function lookupElectoralConstituency(
  context: ElectoralLookupLocationContext
): Promise<ElectoralLookupResult> {
  return ElectoralConstituencyProvider.lookup(context);
}
