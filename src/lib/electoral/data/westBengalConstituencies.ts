import {
  ElectoralCandidate,
  LocationResolutionProvenance,
} from '../electoral-types';

/**
 * ============================================================================
 * 1. OFFICIAL CANONICAL CONSTITUENCY CATALOG
 * ============================================================================
 * Authority: Election Commission of India (ECI) / CEO West Bengal
 * Primary Reference: Delimitation of Parliamentary and Assembly Constituencies
 * Order, 2008 (Schedule XXII - West Bengal).
 *
 * Invariant: Every AC Number, AC Name, Reservation status, PC Number, and
 * PC Name in this catalog is verified against official delimitation orders.
 */

export interface OfficialConstituency {
  ac_number: string;
  ac_name: string;
  reservation?: 'GEN' | 'SC' | 'ST';
  pc_number: string;
  pc_name: string;
  district: string;
  official_source: string;
}

export const OFFICIAL_ECI_SOURCE =
  'Delimitation Commission Order / Election Commission of India & CEO West Bengal';

export const OFFICIAL_CONSTITUENCY_CATALOG: Record<string, OfficialConstituency> = {
  // ── Nadia District (Segments of PC 13 & PC 14) ───────────────────────────
  '90': {
    ac_number: '90',
    ac_name: 'Ranaghat Dakshin (SC)',
    reservation: 'SC',
    pc_number: '13',
    pc_name: 'Ranaghat (SC)',
    district: 'Nadia',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '92': {
    ac_number: '92',
    ac_name: 'Kalyani (SC)',
    reservation: 'SC',
    pc_number: '14',
    pc_name: 'Bangaon (SC)',
    district: 'Nadia',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '93': {
    ac_number: '93',
    ac_name: 'Haringhata (SC)',
    reservation: 'SC',
    pc_number: '14',
    pc_name: 'Bangaon (SC)',
    district: 'Nadia',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── North 24 Parganas: PC 14 Bangaon (SC) Segments ───────────────────────
  '94': {
    ac_number: '94',
    ac_name: 'Bagda (SC)',
    reservation: 'SC',
    pc_number: '14',
    pc_name: 'Bangaon (SC)',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '95': {
    ac_number: '95',
    ac_name: 'Bangaon Uttar (SC)',
    reservation: 'SC',
    pc_number: '14',
    pc_name: 'Bangaon (SC)',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '96': {
    ac_number: '96',
    ac_name: 'Bangaon Dakshin (SC)',
    reservation: 'SC',
    pc_number: '14',
    pc_name: 'Bangaon (SC)',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '97': {
    ac_number: '97',
    ac_name: 'Gaighata (SC)',
    reservation: 'SC',
    pc_number: '14',
    pc_name: 'Bangaon (SC)',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '98': {
    ac_number: '98',
    ac_name: 'Swarupnagar (SC)',
    reservation: 'SC',
    pc_number: '14',
    pc_name: 'Bangaon (SC)',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── North 24 Parganas: PC 15 Barrackpur Segments ─────────────────────────
  '102': {
    ac_number: '102',
    ac_name: 'Amdanga',
    reservation: 'GEN',
    pc_number: '15',
    pc_name: 'Barrackpur',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '103': {
    ac_number: '103',
    ac_name: 'Bijpur',
    reservation: 'GEN',
    pc_number: '15',
    pc_name: 'Barrackpur',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '104': {
    ac_number: '104',
    ac_name: 'Naihati',
    reservation: 'GEN',
    pc_number: '15',
    pc_name: 'Barrackpur',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '105': {
    ac_number: '105',
    ac_name: 'Bhatpara',
    reservation: 'GEN',
    pc_number: '15',
    pc_name: 'Barrackpur',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '106': {
    ac_number: '106',
    ac_name: 'Jagatdal',
    reservation: 'GEN',
    pc_number: '15',
    pc_name: 'Barrackpur',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '107': {
    ac_number: '107',
    ac_name: 'Noapara',
    reservation: 'GEN',
    pc_number: '15',
    pc_name: 'Barrackpur',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '108': {
    ac_number: '108',
    ac_name: 'Barrackpur',
    reservation: 'GEN',
    pc_number: '15',
    pc_name: 'Barrackpur',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── North 24 Parganas: PC 16 Dum Dum Segments ────────────────────────────
  '109': {
    ac_number: '109',
    ac_name: 'Khardaha',
    reservation: 'GEN',
    pc_number: '16',
    pc_name: 'Dum Dum',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '110': {
    ac_number: '110',
    ac_name: 'Dum Dum Uttar',
    reservation: 'GEN',
    pc_number: '16',
    pc_name: 'Dum Dum',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '111': {
    ac_number: '111',
    ac_name: 'Panihati',
    reservation: 'GEN',
    pc_number: '16',
    pc_name: 'Dum Dum',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '112': {
    ac_number: '112',
    ac_name: 'Kamarhati',
    reservation: 'GEN',
    pc_number: '16',
    pc_name: 'Dum Dum',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '113': {
    ac_number: '113',
    ac_name: 'Baranagar',
    reservation: 'GEN',
    pc_number: '16',
    pc_name: 'Dum Dum',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '114': {
    ac_number: '114',
    ac_name: 'Dum Dum',
    reservation: 'GEN',
    pc_number: '16',
    pc_name: 'Dum Dum',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '117': {
    ac_number: '117',
    ac_name: 'Rajarhat Gopalpur',
    reservation: 'GEN',
    pc_number: '16',
    pc_name: 'Dum Dum',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── North 24 Parganas: PC 17 Barasat Segments ────────────────────────────
  '100': {
    ac_number: '100',
    ac_name: 'Habra',
    reservation: 'GEN',
    pc_number: '17',
    pc_name: 'Barasat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '101': {
    ac_number: '101',
    ac_name: 'Ashoknagar',
    reservation: 'GEN',
    pc_number: '17',
    pc_name: 'Barasat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '115': {
    ac_number: '115',
    ac_name: 'Rajarhat New Town',
    reservation: 'GEN',
    pc_number: '17',
    pc_name: 'Barasat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '116': {
    ac_number: '116',
    ac_name: 'Bidhannagar',
    reservation: 'GEN',
    pc_number: '17',
    pc_name: 'Barasat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '118': {
    ac_number: '118',
    ac_name: 'Madhyamgram',
    reservation: 'GEN',
    pc_number: '17',
    pc_name: 'Barasat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '119': {
    ac_number: '119',
    ac_name: 'Barasat',
    reservation: 'GEN',
    pc_number: '17',
    pc_name: 'Barasat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '120': {
    ac_number: '120',
    ac_name: 'Deganga',
    reservation: 'GEN',
    pc_number: '17',
    pc_name: 'Barasat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── North 24 Parganas: PC 18 Basirhat Segments ───────────────────────────
  '99': {
    ac_number: '99',
    ac_name: 'Baduria',
    reservation: 'GEN',
    pc_number: '18',
    pc_name: 'Basirhat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '121': {
    ac_number: '121',
    ac_name: 'Haroa',
    reservation: 'GEN',
    pc_number: '18',
    pc_name: 'Basirhat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '122': {
    ac_number: '122',
    ac_name: 'Minakhan (SC)',
    reservation: 'SC',
    pc_number: '18',
    pc_name: 'Basirhat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '123': {
    ac_number: '123',
    ac_name: 'Sandeshkhali (ST)',
    reservation: 'ST',
    pc_number: '18',
    pc_name: 'Basirhat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '124': {
    ac_number: '124',
    ac_name: 'Basirhat Dakshin',
    reservation: 'GEN',
    pc_number: '18',
    pc_name: 'Basirhat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '125': {
    ac_number: '125',
    ac_name: 'Basirhat Uttar',
    reservation: 'GEN',
    pc_number: '18',
    pc_name: 'Basirhat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '126': {
    ac_number: '126',
    ac_name: 'Hingalganj (SC)',
    reservation: 'SC',
    pc_number: '18',
    pc_name: 'Basirhat',
    district: 'North 24 Parganas',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── Kolkata & South 24 Parganas Segments ─────────────────────────────────
  '149': {
    ac_number: '149',
    ac_name: 'Kasba',
    reservation: 'GEN',
    pc_number: '23',
    pc_name: 'Kolkata Dakshin',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '150': {
    ac_number: '150',
    ac_name: 'Jadavpur',
    reservation: 'GEN',
    pc_number: '22',
    pc_name: 'Jadavpur',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '152': {
    ac_number: '152',
    ac_name: 'Tollyganj',
    reservation: 'GEN',
    pc_number: '22',
    pc_name: 'Jadavpur',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '153': {
    ac_number: '153',
    ac_name: 'Behala Purba',
    reservation: 'GEN',
    pc_number: '23',
    pc_name: 'Kolkata Dakshin',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '154': {
    ac_number: '154',
    ac_name: 'Behala Paschim',
    reservation: 'GEN',
    pc_number: '23',
    pc_name: 'Kolkata Dakshin',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '158': {
    ac_number: '158',
    ac_name: 'Kolkata Port',
    reservation: 'GEN',
    pc_number: '23',
    pc_name: 'Kolkata Dakshin',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '159': {
    ac_number: '159',
    ac_name: 'Bhabanipur',
    reservation: 'GEN',
    pc_number: '23',
    pc_name: 'Kolkata Dakshin',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '160': {
    ac_number: '160',
    ac_name: 'Rashbehari',
    reservation: 'GEN',
    pc_number: '23',
    pc_name: 'Kolkata Dakshin',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '161': {
    ac_number: '161',
    ac_name: 'Ballygunge',
    reservation: 'GEN',
    pc_number: '23',
    pc_name: 'Kolkata Dakshin',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '162': {
    ac_number: '162',
    ac_name: 'Chowrangee',
    reservation: 'GEN',
    pc_number: '24',
    pc_name: 'Kolkata Uttar',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '165': {
    ac_number: '165',
    ac_name: 'Jorasanko',
    reservation: 'GEN',
    pc_number: '24',
    pc_name: 'Kolkata Uttar',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '166': {
    ac_number: '166',
    ac_name: 'Shyampukur',
    reservation: 'GEN',
    pc_number: '24',
    pc_name: 'Kolkata Uttar',
    district: 'Kolkata',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── Howrah District ──────────────────────────────────────────────────────
  '171': {
    ac_number: '171',
    ac_name: 'Howrah Madhya',
    reservation: 'GEN',
    pc_number: '25',
    pc_name: 'Howrah',
    district: 'Howrah',
    official_source: OFFICIAL_ECI_SOURCE,
  },
  '172': {
    ac_number: '172',
    ac_name: 'Shibpur',
    reservation: 'GEN',
    pc_number: '25',
    pc_name: 'Howrah',
    district: 'Howrah',
    official_source: OFFICIAL_ECI_SOURCE,
  },

  // ── Hooghly District ─────────────────────────────────────────────────────
  '186': {
    ac_number: '186',
    ac_name: 'Sreerampur',
    reservation: 'GEN',
    pc_number: '27',
    pc_name: 'Sreerampur',
    district: 'Hooghly',
    official_source: OFFICIAL_ECI_SOURCE,
  },
};

/**
 * Validates constituency data against the official canonical catalog.
 * Rejects invalid AC number / name combinations or mismatches with PC.
 */
export function validateConstituency(
  acNumber: string,
  acName: string,
  pcNumber?: string,
  pcName?: string
): boolean {
  const canonical = OFFICIAL_CONSTITUENCY_CATALOG[acNumber.trim()];
  if (!canonical) return false;

  const cleanName = acName.trim().toLowerCase();
  const canonicalName = canonical.ac_name.toLowerCase();
  const baseCanonicalName = canonicalName.replace(/\s*\((sc|st)\)\s*$/i, '').trim();
  const baseCleanName = cleanName.replace(/\s*\((sc|st)\)\s*$/i, '').trim();

  if (cleanName !== canonicalName && baseCleanName !== baseCanonicalName) {
    return false;
  }

  if (pcNumber && pcNumber.trim() !== canonical.pc_number) {
    return false;
  }

  if (pcName) {
    const cleanPcName = pcName.trim().toLowerCase().replace(/\s*\((sc|st)\)\s*$/i, '').trim();
    const canonicalPcName = canonical.pc_name.toLowerCase().replace(/\s*\((sc|st)\)\s*$/i, '').trim();
    if (cleanPcName !== canonicalPcName) {
      return false;
    }
  }

  return true;
}

export function getCanonicalConstituency(acNumber: string): OfficialConstituency | undefined {
  return OFFICIAL_CONSTITUENCY_CATALOG[acNumber.trim()];
}

export type ConstituencyMatchReason =
  | 'exact_ac_number'
  | 'exact_ac_name'
  | 'ac_name_prefix'
  | 'ac_name_contains'
  | 'exact_pc_number'
  | 'exact_pc_name'
  | 'location_context_candidate';

export interface ConstituencySearchResult extends ElectoralCandidate {
  match_reason: ConstituencyMatchReason;
  match_strength: number;
}

/**
 * Searches the canonical West Bengal constituency catalog without guessing.
 *
 * Deterministic ordering:
 * 1. exact AC number
 * 2. exact normalized AC name
 * 3. AC name prefix
 * 4. AC name contains
 * 5. exact PC name/number
 * 6. PC name contains
 *
 * INVARIANT: Every returned candidate strictly exists in OFFICIAL_CONSTITUENCY_CATALOG.
 * Ranking never means auto-selection — explicit operator selection is required.
 */
export function searchWestBengalConstituencies(query: string): ConstituencySearchResult[] {
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q || q.length === 0) {
    return [];
  }

  const qLower = q.toLowerCase();
  const cleanDigits = q.replace(/\D/g, '');
  const isPureNumeric = /^\d+$/.test(q);

  const results: ConstituencySearchResult[] = [];

  for (const [acNum, official] of Object.entries(OFFICIAL_CONSTITUENCY_CATALOG)) {
    const acNameFull = official.ac_name.toLowerCase();
    const acNameClean = official.ac_name.replace(/\s*\((sc|st)\)\s*$/i, '').trim().toLowerCase();
    const pcNameFull = official.pc_name.toLowerCase();
    const pcNameClean = official.pc_name.replace(/\s*\((sc|st)\)\s*$/i, '').trim().toLowerCase();

    let matchReason: ConstituencyMatchReason | null = null;
    let matchStrength = 99;

    // 1. Exact AC Number (Highest Priority)
    if (q === official.ac_number || (isPureNumeric && cleanDigits === official.ac_number)) {
      matchReason = 'exact_ac_number';
      matchStrength = 1;
    }
    // 2. Exact AC Name
    else if (qLower === acNameClean || qLower === acNameFull) {
      matchReason = 'exact_ac_name';
      matchStrength = 2;
    }
    // 3. AC Name Prefix
    else if (acNameClean.startsWith(qLower) || acNameFull.startsWith(qLower)) {
      matchReason = 'ac_name_prefix';
      matchStrength = 3;
    }
    // 4. AC Name Contains
    else if (acNameClean.includes(qLower) || acNameFull.includes(qLower)) {
      matchReason = 'ac_name_contains';
      matchStrength = 4;
    }
    // 5. Exact PC Number (e.g. "18" or "PC 18" or "PC-18")
    else if (
      (qLower.startsWith('pc') && cleanDigits === official.pc_number) ||
      (isPureNumeric && q === official.pc_number)
    ) {
      matchReason = 'exact_pc_number';
      matchStrength = 5;
    }
    // 5b. Exact PC Name
    else if (qLower === pcNameClean || qLower === pcNameFull) {
      matchReason = 'exact_pc_name';
      matchStrength = 5;
    }
    // 6. PC Name Contains (e.g. "Basir" matching PC "Basirhat")
    else if (pcNameClean.includes(qLower) || pcNameFull.includes(qLower)) {
      matchReason = 'exact_pc_name';
      matchStrength = 6;
    }

    if (matchReason) {
      const baseCandidate = buildCandidateFromCatalog(
        acNum,
        {
          source_type: 'operator_curated',
          source_reference: `Canonical Catalog Manual Search (${matchReason})`,
          confidence: 'medium',
        },
        `Manual search candidate (${matchReason}) — operator confirmation required`
      );

      results.push({
        ...baseCandidate,
        source: 'Canonical Catalog Manual Search',
        match_reason: matchReason,
        match_strength: matchStrength,
      });
    }
  }

  // Deterministic sorting:
  // 1. match_strength ascending (1 = strongest)
  // 2. AC number numeric ascending
  results.sort((a, b) => {
    if (a.match_strength !== b.match_strength) {
      return a.match_strength - b.match_strength;
    }
    return parseInt(a.assembly_constituency_number, 10) - parseInt(b.assembly_constituency_number, 10);
  });

  return results;
}

/**
 * Helper to construct an ElectoralCandidate strictly linked to canonical catalog data.
 */
export function buildCandidateFromCatalog(
  acNumber: string,
  provenance: LocationResolutionProvenance,
  reason?: string
): ElectoralCandidate {
  const official = OFFICIAL_CONSTITUENCY_CATALOG[acNumber];
  if (!official) {
    throw new Error(`AC Number ${acNumber} not found in canonical official catalog`);
  }

  const prefix =
    provenance.source_type === 'official'
      ? 'Official Statutory Source: '
      : 'Operator Curated Candidate: ';

  return {
    assembly_constituency: official.ac_name,
    assembly_constituency_number: official.ac_number,
    parliamentary_constituency: official.pc_name,
    parliamentary_constituency_number: official.pc_number,
    source: `${prefix}${provenance.source_reference}`,
    source_type: provenance.source_type,
    source_reference: provenance.source_reference,
    confidence: provenance.confidence,
    reason:
      reason ||
      `Candidate ${official.ac_name} (AC ${official.ac_number}) — operator confirmation required`,
  };
}

/**
 * ============================================================================
 * 2. LOCATION RESOLUTION DATA
 * ============================================================================
 * PIN / post-office / locality → candidate constituency mapping.
 *
 * CRITICAL SAFETY & PROVENANCE INVARIANTS:
 * 1. Delimitation documents establish electoral boundaries (CD Blocks, Wards, GPs).
 *    They DO NOT establish that an entire postal PIN belongs uniquely to one AC.
 * 2. Unless certified traceable evidence proves the WHOLE PIN delivery area is
 *    100% contained within one AC, all mappings MUST be:
 *    - isUnique: false
 *    - isDeterministic: false
 *    - source_type: 'operator_curated'
 *    - confidence: 'medium'
 * 3. Such mappings MUST NEVER silently auto-fill; they return candidate(s) for
 *    explicit operator review and selection (status: 'multiple').
 * 4. Never invent extra constituencies merely to create multiple candidates.
 */

export interface PincodeElectoralMapping {
  pincode: string;
  district: string;
  state: string;
  isUnique: boolean;
  isDeterministic: boolean;
  provenance: LocationResolutionProvenance;
  candidates: ElectoralCandidate[];
}

export const WEST_BENGAL_PINCODE_MAPPINGS: PincodeElectoralMapping[] = [
  // ── Basirhat Region (North 24 Parganas) ──────────────────────────────────
  {
    // PIN 743411: Basirhat Head Post Office delivery area.
    // Intersects Basirhat Municipality (AC 124) and adjoining rural GPs (AC 125).
    pincode: '743411',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Basirhat HPO; delivery beats intersect AC 124 and AC 125',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog(
        '124',
        {
          source_type: 'operator_curated',
          source_reference: 'Basirhat town / municipality postal beat',
          confidence: 'medium',
        },
        'Basirhat Dakshin (AC 124) candidate for PIN 743411 — operator confirmation required'
      ),
      buildCandidateFromCatalog(
        '125',
        {
          source_type: 'operator_curated',
          source_reference: 'Basirhat rural / northern postal beat',
          confidence: 'medium',
        },
        'Basirhat Uttar (AC 125) candidate for PIN 743411 — operator confirmation required'
      ),
    ],
  },
  {
    // PIN 743412: Hasnabad Sub Post Office.
    // Intersects Sandeshkhali (ST) (AC 123) and Hingalganj (SC) (AC 126).
    pincode: '743412',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Hasnabad SO; delivery beats intersect AC 123 and AC 126',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog(
        '123',
        {
          source_type: 'operator_curated',
          source_reference: 'Sandeshkhali area postal delivery beat',
          confidence: 'medium',
        },
        'Sandeshkhali (ST) (AC 123) candidate for PIN 743412 — operator confirmation required'
      ),
      buildCandidateFromCatalog(
        '126',
        {
          source_type: 'operator_curated',
          source_reference: 'Hasnabad / Hingalganj area postal delivery beat',
          confidence: 'medium',
        },
        'Hingalganj (SC) (AC 126) candidate for PIN 743412 — operator confirmation required'
      ),
    ],
  },
  {
    // PIN 743423: Deganga Sub Office.
    // Located in Deganga block; uncertified postal boundary containment.
    pincode: '743423',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Deganga SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('120', {
        source_type: 'operator_curated',
        source_reference: 'India Post Deganga SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743424: Haroa Sub Office.
    // Located in Haroa block; uncertified postal boundary containment.
    pincode: '743424',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Haroa SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('121', {
        source_type: 'operator_curated',
        source_reference: 'India Post Haroa SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743425: Baduria Sub Office.
    // Located in Baduria; uncertified postal boundary containment.
    pincode: '743425',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Baduria SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('99', {
        source_type: 'operator_curated',
        source_reference: 'India Post Baduria SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743426: Kholapota Sub Office.
    // Located in Basirhat-II; uncertified postal boundary containment.
    pincode: '743426',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Kholapota SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('125', {
        source_type: 'operator_curated',
        source_reference: 'India Post Kholapota SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743427: Minakhan Sub Office.
    // Located in Minakhan; uncertified postal boundary containment.
    pincode: '743427',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Minakhan SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('122', {
        source_type: 'operator_curated',
        source_reference: 'India Post Minakhan SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743429: Sandeshkhali Sub Office.
    // Located in Sandeshkhali; uncertified postal boundary containment.
    pincode: '743429',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Sandeshkhali SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('123', {
        source_type: 'operator_curated',
        source_reference: 'India Post Sandeshkhali SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743435: Hingalganj Sub Office.
    // Located in Hingalganj; uncertified postal boundary containment.
    pincode: '743435',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Hingalganj SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('126', {
        source_type: 'operator_curated',
        source_reference: 'India Post Hingalganj SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743456: Bhebia Sub Office.
    // Located in Hasnabad block; uncertified postal boundary containment.
    pincode: '743456',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Bhebia SO location; delivery beat boundary uncertified by ECI',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('125', {
        source_type: 'operator_curated',
        source_reference: 'India Post Bhebia SO location',
        confidence: 'medium',
      }),
    ],
  },

  // ── Barasat / Urban North 24 Parganas ────────────────────────────────────
  {
    pincode: '700124',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Barasat HPO location; municipal ward delivery beats uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('119', {
        source_type: 'operator_curated',
        source_reference: 'India Post Barasat HPO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700125',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Nabapally SO location; municipal ward delivery beats uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('119', {
        source_type: 'operator_curated',
        source_reference: 'India Post Nabapally SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700129',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Madhyamgram SO location; municipal ward delivery beats uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('118', {
        source_type: 'operator_curated',
        source_reference: 'India Post Madhyamgram SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700136',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Rajarhat SO location; delivery beat boundary uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('117', {
        source_type: 'operator_curated',
        source_reference: 'India Post Rajarhat SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700156',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post New Town SO location; delivery beats uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('115', {
        source_type: 'operator_curated',
        source_reference: 'India Post New Town SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700091',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Salt Lake Sector V SO location; municipal boundary uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('116', {
        source_type: 'operator_curated',
        source_reference: 'India Post Salt Lake Sector V SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700064',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Salt Lake Sector I/II SO location; municipal boundary uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('116', {
        source_type: 'operator_curated',
        source_reference: 'India Post Salt Lake Sector I/II SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '743263',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Habra SO location; rural delivery beats uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('100', {
        source_type: 'operator_curated',
        source_reference: 'India Post Habra SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '743273',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Ashoknagar SO location; rural delivery beats uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('101', {
        source_type: 'operator_curated',
        source_reference: 'India Post Ashoknagar SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743235: Bangaon Sub Office.
    // Delivery area spans Bangaon Municipality (AC 95) and surrounding rural GPs (AC 96).
    pincode: '743235',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Bangaon SO; delivery beats intersect AC 95 and AC 96',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('95', {
        source_type: 'operator_curated',
        source_reference: 'Bangaon Municipality area',
        confidence: 'medium',
      }),
      buildCandidateFromCatalog('96', {
        source_type: 'operator_curated',
        source_reference: 'Bangaon rural border area',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '743245',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Chandpara Bazar SO location; rural delivery beats uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('96', {
        source_type: 'operator_curated',
        source_reference: 'India Post Chandpara Bazar SO location',
        confidence: 'medium',
      }),
    ],
  },

  // ── Kolkata Urban ────────────────────────────────────────────────────────
  {
    // PIN 700001: Kolkata General Post Office.
    // Central BBD Bagh area spans AC 162 (Chowrangee) and AC 165 (Jorasanko).
    pincode: '700001',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'Kolkata GPO Central Business District delivery area spans AC 162 & 165',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('162', {
        source_type: 'operator_curated',
        source_reference: 'Dalhousie / Chowringhee sector',
        confidence: 'medium',
      }),
      buildCandidateFromCatalog('165', {
        source_type: 'operator_curated',
        source_reference: 'Burrabazar / northern commercial border sector',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700007',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Burrabazar SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('165', {
        source_type: 'operator_curated',
        source_reference: 'India Post Burrabazar SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700006',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Beadon Street SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('166', {
        source_type: 'operator_curated',
        source_reference: 'India Post Beadon Street SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700004',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Shyambazar SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('166', {
        source_type: 'operator_curated',
        source_reference: 'India Post Shyambazar SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700019',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Ballygunge SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('161', {
        source_type: 'operator_curated',
        source_reference: 'India Post Ballygunge SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700020',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Bhowanipore SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('159', {
        source_type: 'operator_curated',
        source_reference: 'India Post Bhowanipore SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700025',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Bhowanipore SO delivery beats; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('159', {
        source_type: 'operator_curated',
        source_reference: 'India Post Bhowanipore SO delivery beat',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700029',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Sarat Bose Road SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('160', {
        source_type: 'operator_curated',
        source_reference: 'India Post Sarat Bose Road SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700034',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Behala Chowrasta SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('154', {
        source_type: 'operator_curated',
        source_reference: 'India Post Behala Chowrasta SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700038',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Behala East SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('153', {
        source_type: 'operator_curated',
        source_reference: 'India Post Behala East SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700042',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Kasba SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('149', {
        source_type: 'operator_curated',
        source_reference: 'India Post Kasba SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700043',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Garden Reach SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('158', {
        source_type: 'operator_curated',
        source_reference: 'India Post Garden Reach SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700032',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Jadavpur SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('150', {
        source_type: 'operator_curated',
        source_reference: 'India Post Jadavpur SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700033',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Tollygunge SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('152', {
        source_type: 'operator_curated',
        source_reference: 'India Post Tollygunge SO location',
        confidence: 'medium',
      }),
    ],
  },

  // ── Howrah, Hooghly & Nadia ──────────────────────────────────────────────
  {
    pincode: '711101',
    district: 'Howrah',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Howrah HPO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('171', {
        source_type: 'operator_curated',
        source_reference: 'India Post Howrah HPO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '711102',
    district: 'Howrah',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Shibpur SO location; ward boundary containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('172', {
        source_type: 'operator_curated',
        source_reference: 'India Post Shibpur SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '712201',
    district: 'Hooghly',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Serampore SO location; municipal ward containment uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('186', {
        source_type: 'operator_curated',
        source_reference: 'India Post Serampore SO location',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '741201',
    district: 'Nadia',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'India Post Ranaghat SO location; delivery beat boundary uncertified',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('90', {
        source_type: 'operator_curated',
        source_reference: 'India Post Ranaghat SO location',
        confidence: 'medium',
      }),
    ],
  },
];
