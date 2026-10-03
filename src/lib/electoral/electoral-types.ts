/**
 * Electoral Constituency Provider Types
 * Defines lookup contracts, candidate models, and resolution states
 * for Assembly and Parliamentary Constituency mapping.
 */

export type ElectoralLookupStatus =
  | 'unique'
  | 'multiple'
  | 'not_found'
  | 'insufficient_data'
  | 'provider_error';

export interface ElectoralCandidate {
  assembly_constituency: string;
  assembly_constituency_number: string;
  parliamentary_constituency?: string;
  parliamentary_constituency_number?: string;
  source: string;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
}

export interface ElectoralLookupLocationContext {
  pincode?: string | null;
  state?: string | null;
  district?: string | null;
  post_office?: string | null;
  address?: string | null;
  country?: string | null;
}

export interface ElectoralLookupResult {
  status: ElectoralLookupStatus;
  candidates: ElectoralCandidate[];
  source?: string;
  error?: string;
  reason?: string;
}

export interface IElectoralConstituencyProvider {
  lookup(context: ElectoralLookupLocationContext): Promise<ElectoralLookupResult>;
}
