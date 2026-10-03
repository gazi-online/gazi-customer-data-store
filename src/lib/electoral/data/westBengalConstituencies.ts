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
  // Strip reservation suffix for flexible matching if needed
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
    provenance.source_type === 'verified_local_mapping'
      ? 'Verified Local Mapping: '
      : provenance.source_type === 'operator_curated'
      ? 'Operator Curated Mapping: '
      : 'Official ECI Delimitation: ';

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
      (provenance.source_type === 'verified_local_mapping'
        ? `Postal area mapped to ${official.ac_name} (AC ${official.ac_number})`
        : `Candidate ${official.ac_name} (AC ${official.ac_number}) — operator review required`),
  };
}

/**
 * ============================================================================
 * 2. LOCATION RESOLUTION DATA
 * ============================================================================
 * PIN / post-office / locality → candidate constituency mapping.
 *
 * SAFETY RULES:
 * - DO NOT label any postal PIN mapping as "official" unless an official source
 *   explicitly establishes that postal-area boundary.
 * - Mappings derived from India Post Sub-Offices matching administrative CD blocks
 *   are tagged as 'verified_local_mapping'.
 * - Mappings covering multiple constituencies or postal zones spanning boundaries
 *   are tagged as 'operator_curated' with confidence 'medium'. They NEVER auto-fill.
 * - Fabricated submappings (unverified keywords, fictitious "sectors") are REMOVED.
 */

export interface PincodeElectoralMapping {
  pincode: string;
  district: string;
  state: string;
  isUnique: boolean;
  isDeterministic: boolean; // Only true when single verified local mapping exists
  provenance: LocationResolutionProvenance;
  candidates: ElectoralCandidate[];
}

export const WEST_BENGAL_PINCODE_MAPPINGS: PincodeElectoralMapping[] = [
  // ── Basirhat Region (North 24 Parganas) ──────────────────────────────────
  {
    // PIN 743411: Basirhat Head Post Office delivery jurisdiction.
    // Official Delimitation: Basirhat Municipality & Basirhat-I CD Block = AC 124 (Basirhat Dakshin).
    // Basirhat-II CD Block = AC 125 (Basirhat Uttar).
    // Postal delivery area crosses AC boundaries.
    // Invariant: MUST NOT auto-fill. Ambiguous / requires operator selection.
    pincode: '743411',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'Barasat Postal Division / Basirhat delivery area spans AC 124 & 125',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog(
        '124',
        {
          source_type: 'operator_curated',
          source_reference: 'Basirhat Town / Municipality delivery zone (AC 124)',
          confidence: 'medium',
        },
        'Basirhat Dakshin (AC 124) candidate for PIN 743411 — operator confirmation required'
      ),
      buildCandidateFromCatalog(
        '125',
        {
          source_type: 'operator_curated',
          source_reference: 'Basirhat North / Rural delivery border (AC 125)',
          confidence: 'medium',
        },
        'Basirhat Uttar (AC 125) candidate for PIN 743411 — operator confirmation required'
      ),
    ],
  },
  {
    // PIN 743412: Hasnabad Sub Post Office.
    // Spans Sandeshkhali (ST) (AC 123) and Hingalganj (SC) (AC 126).
    // Invariant: MUST NOT auto-fill. Ambiguous / requires operator selection.
    pincode: '743412',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'Barasat Postal Division / Hasnabad delivery area spans AC 123 & 126',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog(
        '123',
        {
          source_type: 'operator_curated',
          source_reference: 'Sandeshkhali area under Hasnabad delivery zone',
          confidence: 'medium',
        },
        'Sandeshkhali (ST) (AC 123) candidate — operator confirmation required'
      ),
      buildCandidateFromCatalog(
        '126',
        {
          source_type: 'operator_curated',
          source_reference: 'Hasnabad / Hingalganj area under Hasnabad delivery zone',
          confidence: 'medium',
        },
        'Hingalganj (SC) (AC 126) candidate — operator confirmation required'
      ),
    ],
  },
  {
    // PIN 743423: Deganga Sub Office.
    // Deganga CD Block falls inside AC 120 (Deganga), PC 17 (Barasat).
    pincode: '743423',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Deganga SO delimited to Deganga CD Block (AC 120)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('120', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Deganga SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743424: Haroa Sub Office.
    // Haroa CD Block falls inside AC 121 (Haroa), PC 18 (Basirhat).
    pincode: '743424',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Haroa SO delimited to Haroa CD Block (AC 121)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('121', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Haroa SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743425: Baduria Sub Office.
    // Baduria Municipality & CD Block falls inside AC 99 (Baduria), PC 18 (Basirhat).
    pincode: '743425',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Baduria SO delimited to Baduria Municipality (AC 99)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('99', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Baduria SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743426: Kholapota Sub Office.
    // Located in Basirhat-II CD Block which constitutes AC 125 (Basirhat Uttar), PC 18 (Basirhat).
    pincode: '743426',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Kholapota SO delimited to Basirhat-II CD Block (AC 125)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('125', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Kholapota SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743427: Minakhan Sub Office.
    // Minakhan CD Block constitutes AC 122 (Minakhan SC), PC 18 (Basirhat).
    pincode: '743427',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Minakhan SO delimited to Minakhan CD Block (AC 122)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('122', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Minakhan SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743429: Sandeshkhali Sub Office.
    // Sandeshkhali-II CD Block constitutes AC 123 (Sandeshkhali ST), PC 18 (Basirhat).
    pincode: '743429',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Sandeshkhali SO delimited to Sandeshkhali-II CD Block (AC 123)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('123', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Sandeshkhali SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743435: Hingalganj Sub Office.
    // Hingalganj CD Block constitutes AC 126 (Hingalganj SC), PC 18 (Basirhat).
    pincode: '743435',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Hingalganj SO delimited to Hingalganj CD Block (AC 126)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('126', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Hingalganj SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743456: Bhebia Sub Office.
    // Bhebia Gram Panchayat is explicitly delimited into AC 125 (Basirhat Uttar), PC 18 (Basirhat).
    pincode: '743456',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Bhebia SO delimited to Bhebia GP (AC 125)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('125', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Bhebia SO',
        confidence: 'high',
      }),
    ],
  },

  // ── Barasat / Urban North 24 Parganas ────────────────────────────────────
  {
    pincode: '700124',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Barasat Head Post Office (AC 119)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('119', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Barasat HPO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700125',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Nabapally SO (AC 119)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('119', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Nabapally SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700129',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Madhyamgram SO (AC 118)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('118', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Madhyamgram SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 700136: Rajarhat Sub Office.
    // Falls in AC 117 (Rajarhat Gopalpur), PC 16 (Dum Dum).
    pincode: '700136',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Rajarhat SO (AC 117 / PC 16 Dum Dum)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('117', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Rajarhat SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700156',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / New Town Action Area SO (AC 115)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('115', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / New Town Action Area SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700091',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Salt Lake Sector V SO (AC 116)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('116', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Salt Lake Sector V SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700064',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Salt Lake Sector I & II SO (AC 116)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('116', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Salt Lake Sector I & II SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743263: Habra Sub Office.
    // Habra Municipality & Block falls inside AC 100 (Habra), PC 17 (Barasat).
    pincode: '743263',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Habra SO delimited to Habra (AC 100)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('100', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Habra SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743273: Ashoknagar Sub Office.
    // Ashoknagar Kalyangarh Municipality falls inside AC 101 (Ashoknagar), PC 17 (Barasat).
    pincode: '743273',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Ashoknagar SO delimited to Ashoknagar (AC 101)',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('101', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Ashoknagar SO',
        confidence: 'high',
      }),
    ],
  },
  {
    // PIN 743235: Bangaon Sub Office.
    // Delivery area spans Bangaon Municipality (AC 95) and surrounding GPs (partly AC 96).
    // Invariant: MUST NOT auto-fill. Ambiguous / requires operator selection.
    pincode: '743235',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    isDeterministic: false,
    provenance: {
      source_type: 'operator_curated',
      source_reference: 'Barasat Postal Division / Bangaon delivery area spans AC 95 & 96',
      confidence: 'medium',
    },
    candidates: [
      buildCandidateFromCatalog('95', {
        source_type: 'operator_curated',
        source_reference: 'Bangaon Municipality area (AC 95)',
        confidence: 'medium',
      }),
      buildCandidateFromCatalog('96', {
        source_type: 'operator_curated',
        source_reference: 'Bangaon South rural border area (AC 96)',
        confidence: 'medium',
      }),
    ],
  },
  {
    // PIN 743245: Chandpara Bazar Sub Office.
    // Chandpara GP in Gaighata CD Block falls inside AC 96 (Bangaon Dakshin SC), PC 14 (Bangaon SC).
    pincode: '743245',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Barasat Division / Chandpara Bazar SO delimited to AC 96',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('96', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Barasat Division / Chandpara Bazar SO',
        confidence: 'high',
      }),
    ],
  },

  // ── Kolkata Urban ────────────────────────────────────────────────────────
  {
    // PIN 700001: Kolkata General Post Office.
    // Central BBD Bagh area spans AC 162 (Chowrangee) and AC 165 (Jorasanko).
    // Invariant: MUST NOT auto-fill without operator selection.
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
        source_reference: 'Dalhousie / Chowringhee sector (AC 162)',
        confidence: 'medium',
      }),
      buildCandidateFromCatalog('165', {
        source_type: 'operator_curated',
        source_reference: 'Burrabazar / northern commercial border sector (AC 165)',
        confidence: 'medium',
      }),
    ],
  },
  {
    pincode: '700007',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Burrabazar SO delimited to AC 165',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('165', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Burrabazar SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700006',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Beadon Street SO delimited to AC 166',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('166', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Beadon Street SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700004',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Shyambazar SO delimited to AC 166',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('166', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Shyambazar SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700019',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Ballygunge SO delimited to AC 161',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('161', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Ballygunge SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700020',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Bhowanipore & AJC Bose Road SO delimited to AC 159',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('159', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Bhowanipore SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700025',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Bhowanipore delivery area delimited to AC 159',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('159', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Bhowanipore SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700029',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Sarat Bose Road & Southern Avenue delimited to AC 160',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('160', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Sarat Bose Road SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700034',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Behala Chowrasta SO delimited to AC 154',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('154', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Behala Chowrasta SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700038',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Behala East SO delimited to AC 153',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('153', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Behala East SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700042',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Kasba SO delimited to AC 149',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('149', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Kasba SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700043',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Garden Reach & Kolkata Port SO delimited to AC 158',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('158', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Garden Reach SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700032',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Jadavpur SO delimited to AC 150',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('150', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Jadavpur SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '700033',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Kolkata / Tollygunge SO delimited to AC 152',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('152', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Kolkata / Tollygunge SO',
        confidence: 'high',
      }),
    ],
  },

  // ── Howrah, Hooghly & Nadia ──────────────────────────────────────────────
  {
    pincode: '711101',
    district: 'Howrah',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Howrah / Howrah Head Post Office delimited to AC 171',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('171', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Howrah / Howrah HPO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '711102',
    district: 'Howrah',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Howrah / Shibpur SO delimited to AC 172',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('172', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Howrah / Shibpur SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '712201',
    district: 'Hooghly',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Hooghly / Serampore SO delimited to AC 186',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('186', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Hooghly / Serampore SO',
        confidence: 'high',
      }),
    ],
  },
  {
    pincode: '741201',
    district: 'Nadia',
    state: 'West Bengal',
    isUnique: true,
    isDeterministic: true,
    provenance: {
      source_type: 'verified_local_mapping',
      source_reference: 'India Post Nadia / Ranaghat SO delimited to AC 90',
      confidence: 'high',
    },
    candidates: [
      buildCandidateFromCatalog('90', {
        source_type: 'verified_local_mapping',
        source_reference: 'India Post Nadia / Ranaghat SO',
        confidence: 'high',
      }),
    ],
  },
];
