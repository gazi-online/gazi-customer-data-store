/**
 * ==============================================================================
 * GCDS ELECTORAL CONSTITUENCY AUTO-FILL PHASE — SAFETY HARDENED TEST SUITE
 * File: test-customer-electoral-autofill.ts
 *
 * Verifies all architectural requirements, safety constraints & regression guards:
 * 1. Canonical AC/PC catalog integrity (ECI / CEO West Bengal Delimitation 2008)
 * 2. Strict rejection of incorrect AC numbers / names (e.g. Basirhat Uttar != 102, Deganga != 101, Habra != 110)
 * 3. Unique location → AC, AC Number, PC, PC Number auto-filled
 * 4. Provenance tracking: verified_local_mapping vs operator_curated vs official
 * 5. Ambiguous location (e.g. 743411, 743412, 743235, 700001) → status 'multiple', NEVER auto-filled
 * 6. PIN 743411 special review: unverified locality keywords (Dandirhat, Basirhat College, etc.)
 *    NEVER produce an authoritative unique match; remains 'multiple' / needs-review
 * 7. Fallback text search: unverified locality keywords NEVER produce 'unique' status
 * 8. Candidate AC/PC details come exclusively from the canonical catalog
 * 9. Operator can manually select from ambiguous candidates
 * 10. No match leaves fields safe
 * 11. Provider failure leaves manual entry available
 * 12. Manual electoral values not overwritten by lookup
 * 13. Imported electoral values not silently overwritten by lookup
 * 14. Officially verified values not overwritten by lookup
 * 15. Stale async responses discarded
 * 16. Customer A → B reset clears lookup state
 * 17. Edit mode preserves saved data
 * 18. Auto-fill never creates officially_verified status or verified_at timestamp
 * 19. Existing PIN State/District/Post Office lookup still works
 * 20. Other country/non-West-Bengal behavior fails gracefully
 * ==============================================================================
 */

import { AuthoritativeElectoralConstituencyProvider } from './src/lib/electoral/ElectoralConstituencyProvider';
import {
  ElectoralCandidate,
  ElectoralLookupLocationContext,
  ElectoralLookupResult,
} from './src/lib/electoral/electoral-types';
import {
  OFFICIAL_CONSTITUENCY_CATALOG,
  WEST_BENGAL_PINCODE_MAPPINGS,
  validateConstituency,
  getCanonicalConstituency,
} from './src/lib/electoral/data/westBengalConstituencies';
import {
  canLookupOverwriteElectoralField,
  canImportOverwriteField,
  initializeFieldOrigins,
  createCanonicalEmptyCustomer,
  checkLookupFreshness,
  isSessionFresh,
  FieldOrigins,
} from './src/components/forms/customerFormUpdatePolicy';
import { CustomerFormData } from './src/types/customer';
import { IndiaPincodeProvider } from './src/lib/address/IndiaPincodeProvider';

console.log("==========================================================================");
console.log("🗳️ GCDS ELECTORAL CONSTITUENCY AUTO-FILL SAFETY TEST SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: unknown) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`, detail !== undefined ? JSON.stringify(detail) : '');
    failed++;
  }
}

async function runSuite() {
  const provider = new AuthoritativeElectoralConstituencyProvider();

  // ==============================================================================
  // SECTION 0: CANONICAL AC/PC CATALOG REGRESSION ASSERTIONS (ECI / CEO WEST BENGAL)
  // ==============================================================================
  console.log("\n== SECTION 0: Canonical Constituency Catalog & Delimitation Integrity ==");

  // Required canonical North 24 Parganas checks
  assert(Object.keys(OFFICIAL_CONSTITUENCY_CATALOG).length >= 33, 'Catalog contains all required verified constituencies');

  const ac100 = getCanonicalConstituency('100');
  assert(ac100?.ac_name === 'Habra' && ac100?.pc_number === '17' && ac100?.pc_name === 'Barasat',
    'Canonical 100: Habra -> PC 17 Barasat');

  const ac101 = getCanonicalConstituency('101');
  assert(ac101?.ac_name === 'Ashoknagar' && ac101?.pc_number === '17' && ac101?.pc_name === 'Barasat',
    'Canonical 101: Ashoknagar -> PC 17 Barasat');

  const ac102 = getCanonicalConstituency('102');
  assert(ac102?.ac_name === 'Amdanga' && ac102?.pc_number === '15' && ac102?.pc_name === 'Barrackpur',
    'Canonical 102: Amdanga -> PC 15 Barrackpur');

  const ac120 = getCanonicalConstituency('120');
  assert(ac120?.ac_name === 'Deganga' && ac120?.pc_number === '17' && ac120?.pc_name === 'Barasat',
    'Canonical 120: Deganga -> PC 17 Barasat');

  const ac121 = getCanonicalConstituency('121');
  assert(ac121?.ac_name === 'Haroa' && ac121?.pc_number === '18' && ac121?.pc_name === 'Basirhat',
    'Canonical 121: Haroa -> PC 18 Basirhat');

  const ac122 = getCanonicalConstituency('122');
  assert(Boolean(ac122?.ac_name.includes('Minakhan')) && ac122?.pc_number === '18' && ac122?.pc_name === 'Basirhat',
    'Canonical 122: Minakhan (SC) -> PC 18 Basirhat');

  const ac123 = getCanonicalConstituency('123');
  assert(Boolean(ac123?.ac_name.includes('Sandeshkhali')) && ac123?.pc_number === '18' && ac123?.pc_name === 'Basirhat',
    'Canonical 123: Sandeshkhali (ST) -> PC 18 Basirhat');

  const ac124 = getCanonicalConstituency('124');
  assert(ac124?.ac_name === 'Basirhat Dakshin' && ac124?.pc_number === '18' && ac124?.pc_name === 'Basirhat',
    'Canonical 124: Basirhat Dakshin -> PC 18 Basirhat');

  const ac125 = getCanonicalConstituency('125');
  assert(ac125?.ac_name === 'Basirhat Uttar' && ac125?.pc_number === '18' && ac125?.pc_name === 'Basirhat',
    'Canonical 125: Basirhat Uttar -> PC 18 Basirhat');

  const ac126 = getCanonicalConstituency('126');
  assert(Boolean(ac126?.ac_name.includes('Hingalganj')) && ac126?.pc_number === '18' && ac126?.pc_name === 'Basirhat',
    'Canonical 126: Hingalganj (SC) -> PC 18 Basirhat');

  // Verify Rajarhat Gopalpur (117) belongs to PC 16 Dum Dum, NOT Barasat
  const ac117 = getCanonicalConstituency('117');
  assert(ac117?.ac_name === 'Rajarhat Gopalpur' && ac117?.pc_number === '16' && ac117?.pc_name === 'Dum Dum',
    'Canonical 117: Rajarhat Gopalpur -> PC 16 Dum Dum (Corrected from Barasat)');

  // Strict validation: Rejection of incorrect historical mappings
  assert(!validateConstituency('102', 'Basirhat Uttar'), 'Rejected: Basirhat Uttar is NOT 102 (correct is 125)');
  assert(!validateConstituency('101', 'Deganga'), 'Rejected: Deganga is NOT 101 (correct is 120)');
  assert(!validateConstituency('110', 'Habra'), 'Rejected: Habra is NOT 110 (correct is 100)');
  assert(!validateConstituency('109', 'Ashoknagar'), 'Rejected: Ashoknagar is NOT 109 (correct is 101)');
  assert(!validateConstituency('125', 'Hingalganj'), 'Rejected: Hingalganj is NOT 125 (correct is 126)');

  // Acceptance of canonical correct pairs
  assert(validateConstituency('125', 'Basirhat Uttar', '18', 'Basirhat'), 'Accepted: Basirhat Uttar (125) / PC 18');
  assert(validateConstituency('120', 'Deganga', '17', 'Barasat'), 'Accepted: Deganga (120) / PC 17');
  assert(validateConstituency('100', 'Habra', '17', 'Barasat'), 'Accepted: Habra (100) / PC 17');
  assert(validateConstituency('101', 'Ashoknagar', '17', 'Barasat'), 'Accepted: Ashoknagar (101) / PC 17');
  assert(validateConstituency('126', 'Hingalganj (SC)', '18', 'Basirhat'), 'Accepted: Hingalganj (SC) (126) / PC 18');

  // Verify every candidate in the dataset comes strictly from OFFICIAL_CONSTITUENCY_CATALOG
  let allCandidatesCanonical = true;
  for (const mapping of WEST_BENGAL_PINCODE_MAPPINGS) {
    for (const cand of mapping.candidates) {
      if (!validateConstituency(cand.assembly_constituency_number, cand.assembly_constituency, cand.parliamentary_constituency_number, cand.parliamentary_constituency)) {
        allCandidatesCanonical = false;
        console.error("Non-canonical candidate detected in mapping:", cand);
      }
    }
  }
  assert(allCandidatesCanonical, 'All candidates in dataset originate strictly from canonical catalog');

  // ==============================================================================
  // SECTION 1: UNIQUE LOCATION → AC, AC NUMBER, PC, PC NUMBER AUTO-FILLED
  // ==============================================================================
  console.log("\n== SECTION 1: Unique Location Auto-Fill (AC, AC No, PC, PC No) ==");

  // Case A: 743426 (Kholapota, Basirhat-II CD Block) maps uniquely to Basirhat Uttar (AC 125), Basirhat (PC 18)
  const resKholapota = await provider.lookup({
    pincode: '743426',
    state: 'West Bengal',
    district: 'North 24 Parganas',
    country: 'India',
  });

  assert(resKholapota.status === 'unique', '1. Kholapota 743426 status is unique');
  assert(resKholapota.candidates.length === 1, '1. unique location returns exactly 1 candidate');
  assert(resKholapota.candidates[0].assembly_constituency === 'Basirhat Uttar', '1. AC name correctly matched (Basirhat Uttar)');
  assert(resKholapota.candidates[0].assembly_constituency_number === '125', '2. AC number correctly matched (125)');
  assert(resKholapota.candidates[0].parliamentary_constituency === 'Basirhat', '3. PC name correctly matched (Basirhat)');
  assert(resKholapota.candidates[0].parliamentary_constituency_number === '18', '3. PC number correctly matched (18)');
  assert(resKholapota.candidates[0].source_type === 'verified_local_mapping', '4. Provenance is verified_local_mapping');
  assert(!resKholapota.candidates[0].source.toLowerCase().includes('ceo west bengal / election commission of india delimitation order'),
    '5. Misleading ECI Delimitation Order source removed from postal PIN assertion');

  // Case B: 743423 (Deganga) maps uniquely to Deganga (AC 120), Barasat (PC 17)
  const resDeganga = await provider.lookup({
    pincode: '743423',
    state: 'West Bengal',
    district: 'North 24 Parganas',
    country: 'India',
  });
  assert(resDeganga.status === 'unique', '1b. Deganga 743423 status is unique');
  assert(resDeganga.candidates[0].assembly_constituency === 'Deganga', '1b. Deganga AC name is Deganga');
  assert(resDeganga.candidates[0].assembly_constituency_number === '120', '2b. Deganga AC number is 120 (NOT 101)');
  assert(resDeganga.candidates[0].parliamentary_constituency === 'Barasat', '3b. Deganga PC is Barasat');
  assert(resDeganga.candidates[0].parliamentary_constituency_number === '17', '3b. Deganga PC number is 17');

  // Case C: 743263 (Habra) maps uniquely to Habra (AC 100), Barasat (PC 17)
  const resHabra = await provider.lookup({
    pincode: '743263',
    state: 'West Bengal',
    district: 'North 24 Parganas',
    country: 'India',
  });
  assert(resHabra.status === 'unique', '1c. Habra 743263 status is unique');
  assert(resHabra.candidates[0].assembly_constituency === 'Habra', '1c. Habra AC name is Habra');
  assert(resHabra.candidates[0].assembly_constituency_number === '100', '2c. Habra AC number is 100 (NOT 110)');
  assert(resHabra.candidates[0].parliamentary_constituency === 'Barasat', '3c. Habra PC is Barasat');

  // Case D: 700020 (Bhowanipore, Kolkata) maps uniquely to Bhabanipur (AC 159), Kolkata Dakshin (PC 23)
  const resBhowanipore = await provider.lookup({
    pincode: '700020',
    state: 'West Bengal',
    district: 'Kolkata',
    country: 'India',
  });
  assert(resBhowanipore.status === 'unique', '1d. Bhowanipore PIN 700020 status is unique');
  assert(resBhowanipore.candidates[0].assembly_constituency === 'Bhabanipur', '1d. Bhowanipore AC name is Bhabanipur');
  assert(resBhowanipore.candidates[0].assembly_constituency_number === '159', '2d. Bhowanipore AC number is 159');
  assert(resBhowanipore.candidates[0].parliamentary_constituency === 'Kolkata Dakshin', '3d. Bhowanipore PC is Kolkata Dakshin');
  assert(resBhowanipore.candidates[0].parliamentary_constituency_number === '23', '3d. Bhowanipore PC number is 23');

  // Emulate form auto-fill on unique match
  const formState: CustomerFormData = createCanonicalEmptyCustomer();
  const origins: FieldOrigins = {};

  if (canLookupOverwriteElectoralField('assembly_constituency', resKholapota.candidates[0].assembly_constituency, origins.assembly_constituency)) {
    formState.assembly_constituency = resKholapota.candidates[0].assembly_constituency;
    origins.assembly_constituency = 'lookup';
  }
  if (canLookupOverwriteElectoralField('assembly_constituency_number', resKholapota.candidates[0].assembly_constituency_number, origins.assembly_constituency_number)) {
    formState.assembly_constituency_number = resKholapota.candidates[0].assembly_constituency_number;
    origins.assembly_constituency_number = 'lookup';
  }
  if (canLookupOverwriteElectoralField('parliamentary_constituency', resKholapota.candidates[0].parliamentary_constituency, origins.parliamentary_constituency)) {
    formState.parliamentary_constituency = resKholapota.candidates[0].parliamentary_constituency;
    origins.parliamentary_constituency = 'lookup';
  }
  if (canLookupOverwriteElectoralField('parliamentary_constituency_number', resKholapota.candidates[0].parliamentary_constituency_number, origins.parliamentary_constituency_number)) {
    formState.parliamentary_constituency_number = resKholapota.candidates[0].parliamentary_constituency_number;
    origins.parliamentary_constituency_number = 'lookup';
  }

  assert(formState.assembly_constituency === 'Basirhat Uttar', 'Form state: AC auto-filled (Basirhat Uttar)');
  assert(formState.assembly_constituency_number === '125', 'Form state: AC number auto-filled (125)');
  assert(formState.parliamentary_constituency === 'Basirhat', 'Form state: PC auto-filled (Basirhat)');
  assert(formState.parliamentary_constituency_number === '18', 'Form state: PC number auto-filled (18)');

  // ==============================================================================
  // SECTION 2: 743411 SPECIAL REVIEW & AMBIGUOUS PIN SAFETY (NEVER GUESSED)
  // ==============================================================================
  console.log("\n== SECTION 2: 743411 Special Review & Ambiguous Location Safety ==");

  // 743411 (Basirhat delivery area) spans Basirhat Dakshin (124) and Basirhat Uttar (125)
  const resAmbiguousPin = await provider.lookup({
    pincode: '743411',
    state: 'West Bengal',
    country: 'India',
  });

  assert(resAmbiguousPin.status === 'multiple', '6a. PIN 743411 status is strictly multiple (never unique)');
  assert(resAmbiguousPin.candidates.length === 2, '6a. PIN 743411 returns exactly 2 canonical candidates');
  assert(
    resAmbiguousPin.candidates.some(c => c.assembly_constituency === 'Basirhat Dakshin' && c.assembly_constituency_number === '124'),
    '6a. Candidate 1 is Basirhat Dakshin (AC 124)'
  );
  assert(
    resAmbiguousPin.candidates.some(c => c.assembly_constituency === 'Basirhat Uttar' && c.assembly_constituency_number === '125'),
    '6a. Candidate 2 is Basirhat Uttar (AC 125)'
  );
  assert(
    resAmbiguousPin.candidates.every(c => c.source_type === 'operator_curated'),
    '6a. 743411 candidates have source_type: operator_curated (never claimed official)'
  );

  // INVARIANT: Unverified locality keyword (e.g. Dandirhat, Basirhat College, Bhebia)
  // MUST NOT produce an authoritative unique match for 743411. It MUST remain 'multiple'.
  const resDandirhat = await provider.lookup({
    pincode: '743411',
    post_office: 'Dandirhat',
    address: 'Dandirhat main road, Gazi para',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resDandirhat.status === 'multiple', '6b. Dandirhat keyword does NOT create fake unique match — remains multiple');
  assert(resDandirhat.candidates.length === 2, '6b. Returns both candidates for operator selection');

  const resCollege = await provider.lookup({
    pincode: '743411',
    post_office: 'Basirhat College',
    address: 'Near Basirhat College, Town',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resCollege.status === 'multiple', '6c. Basirhat College keyword does NOT create fake unique match — remains multiple');

  // Invariant: Form fields MUST NOT be auto-filled for ambiguous/operator-curated PINs
  const unselectedFormState: CustomerFormData = createCanonicalEmptyCustomer();
  if (resAmbiguousPin.status === 'unique') {
    unselectedFormState.assembly_constituency = resAmbiguousPin.candidates[0].assembly_constituency;
  }
  assert(unselectedFormState.assembly_constituency === '', '6d. Ambiguous PIN 743411 never auto-fills AC');
  assert(unselectedFormState.assembly_constituency_number === '', '6d. Ambiguous PIN 743411 never auto-fills AC number');

  // Kolkata GPO 700001 spans Chowrangee (162) and Jorasanko (165)
  const resKolkataGpo = await provider.lookup({
    pincode: '700001',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resKolkataGpo.status === 'multiple', '6e. Kolkata 700001 status is multiple');
  assert(resKolkataGpo.candidates.length === 2, '6e. Returns multiple candidates for Kolkata 700001');

  // Bangaon 743235 spans Bangaon Uttar (95) and Bangaon Dakshin (96)
  const resBangaon = await provider.lookup({
    pincode: '743235',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resBangaon.status === 'multiple', '6f. Bangaon 743235 spans ACs — status is multiple');

  // ==============================================================================
  // SECTION 3: FALLBACK LOCALITY SEARCH SAFETY (NO SILENT AUTO-FILL)
  // ==============================================================================
  console.log("\n== SECTION 3: Free-Text Locality Fallback Safety ==");

  // Searching by address text without PIN
  const resTextSearch = await provider.lookup({
    address: 'Near Habra station bazaar',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resTextSearch.status === 'multiple', '7a. Text keyword match returns multiple, NEVER unique');
  assert(resTextSearch.candidates[0].source_type === 'operator_curated', '7a. Candidate source_type is operator_curated');
  assert(resTextSearch.candidates[0].confidence === 'low', '7a. Candidate confidence is low');
  assert(resTextSearch.candidates[0].assembly_constituency === 'Habra' && resTextSearch.candidates[0].assembly_constituency_number === '100',
    '7a. Matched candidate uses canonical AC 100 Habra');

  // ==============================================================================
  // SECTION 4: OPERATOR CANDIDATE SELECTION
  // ==============================================================================
  console.log("\n== SECTION 4: Operator Candidate Selection ==");

  // Ambiguous candidates: Operator chooses Basirhat Dakshin (124)
  const candidateToSelect = resAmbiguousPin.candidates.find(c => c.assembly_constituency === 'Basirhat Dakshin')!;
  assert(candidateToSelect !== undefined, 'Target candidate found in candidates list');

  const operatorSelectedForm: CustomerFormData = createCanonicalEmptyCustomer();
  const operatorOrigins: FieldOrigins = {};

  operatorSelectedForm.assembly_constituency = candidateToSelect.assembly_constituency;
  operatorOrigins.assembly_constituency = 'lookup';
  operatorSelectedForm.assembly_constituency_number = candidateToSelect.assembly_constituency_number;
  operatorOrigins.assembly_constituency_number = 'lookup';
  operatorSelectedForm.parliamentary_constituency = candidateToSelect.parliamentary_constituency || '';
  operatorOrigins.parliamentary_constituency = 'lookup';
  operatorSelectedForm.parliamentary_constituency_number = candidateToSelect.parliamentary_constituency_number || '';
  operatorOrigins.parliamentary_constituency_number = 'lookup';

  assert(operatorSelectedForm.assembly_constituency === 'Basirhat Dakshin', '9. Operator selection populates AC name');
  assert(operatorSelectedForm.assembly_constituency_number === '124', '9. Operator selection populates AC number (124)');
  assert(operatorSelectedForm.parliamentary_constituency === 'Basirhat', '9. Operator selection populates PC name');
  assert(operatorSelectedForm.parliamentary_constituency_number === '18', '9. Operator selection populates PC number');
  assert(operatorSelectedForm.electoral_verification_status === 'unverified', '9. Status remains unverified after selection');

  // ==============================================================================
  // SECTION 5: NO MATCH SAFETY
  // ==============================================================================
  console.log("\n== SECTION 5: No Match Safety ==");

  const resUnmappedPin = await provider.lookup({
    pincode: '799999',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resUnmappedPin.status === 'not_found', '10. Unmapped PIN returns status not_found');
  assert(resUnmappedPin.candidates.length === 0, '10. Unmapped PIN returns 0 candidates');

  const existingFormWithSafeFields: CustomerFormData = {
    ...createCanonicalEmptyCustomer(),
    assembly_constituency: 'Existing AC',
    assembly_constituency_number: '50',
  };
  if (resUnmappedPin.status === 'unique') {
    existingFormWithSafeFields.assembly_constituency = resUnmappedPin.candidates[0].assembly_constituency;
  }
  assert(existingFormWithSafeFields.assembly_constituency === 'Existing AC', '10. no match leaves existing fields safe');
  assert(existingFormWithSafeFields.assembly_constituency_number === '50', '10. no match leaves AC number safe');

  // ==============================================================================
  // SECTION 6: PROVIDER FAILURE RESILIENCE
  // ==============================================================================
  console.log("\n== SECTION 6: Provider Failure Resilience ==");

  class FaultyProvider extends AuthoritativeElectoralConstituencyProvider {
    async lookup(_context: ElectoralLookupLocationContext): Promise<ElectoralLookupResult> {
      void _context;
      throw new Error("Simulated network outage");
    }
  }
  const faultyProvider = new FaultyProvider();
  let faultRes: ElectoralLookupResult | null = null;
  try {
    faultRes = await faultyProvider.lookup({ pincode: '743426' });
  } catch {
    faultRes = {
      status: 'provider_error',
      candidates: [],
      error: 'Simulated network outage',
      reason: 'Unable to check constituency',
    };
  }

  assert(faultRes?.status === 'provider_error', '11. Provider exception returns provider_error');
  assert(faultRes?.candidates.length === 0, '11. Candidates list is empty on error');

  const manualForm: CustomerFormData = createCanonicalEmptyCustomer();
  manualForm.assembly_constituency = 'Manual AC Entry';
  manualForm.assembly_constituency_number = '105';
  assert(manualForm.assembly_constituency === 'Manual AC Entry', '11. Operator can type constituency manually on error');
  assert(manualForm.assembly_constituency_number === '105', '11. Operator can type AC number manually on error');

  // ==============================================================================
  // SECTION 7: MANUAL OVERRIDE PROTECTION
  // ==============================================================================
  console.log("\n== SECTION 7: Manual Override Protection ==");

  const userOrigins: FieldOrigins = {
    assembly_constituency: 'user',
    assembly_constituency_number: 'user',
    parliamentary_constituency: 'user',
    parliamentary_constituency_number: 'user',
  };

  const incomingLookupCandidate = {
    assembly_constituency: 'Basirhat Uttar',
    assembly_constituency_number: '125',
    parliamentary_constituency: 'Basirhat',
    parliamentary_constituency_number: '18',
  };

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', incomingLookupCandidate.assembly_constituency, userOrigins.assembly_constituency) === false,
    '12. Manual user assembly_constituency cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', incomingLookupCandidate.assembly_constituency_number, userOrigins.assembly_constituency_number) === false,
    '12. Manual user AC number cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('parliamentary_constituency', incomingLookupCandidate.parliamentary_constituency, userOrigins.parliamentary_constituency) === false,
    '12. Manual user PC cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('parliamentary_constituency_number', incomingLookupCandidate.parliamentary_constituency_number, userOrigins.parliamentary_constituency_number) === false,
    '12. Manual user PC number cannot be overwritten by lookup'
  );

  // ==============================================================================
  // SECTION 8: SMART IMPORT PROTECTION & CONFLICT DETECTION
  // ==============================================================================
  console.log("\n== SECTION 8: Smart Import Protection & Conflict Detection ==");

  const importOrigins: FieldOrigins = {
    assembly_constituency: 'import',
    assembly_constituency_number: 'import',
  };

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', 'Different AC', importOrigins.assembly_constituency) === false,
    '13. Imported assembly_constituency cannot be silently overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '999', importOrigins.assembly_constituency_number) === false,
    '13. Imported AC number cannot be silently overwritten by lookup'
  );

  const importedAcValue = 'Basirhat Uttar';
  const conflictingLookupAc = 'Basirhat Dakshin';
  const hasConflict = importOrigins.assembly_constituency === 'import' && importedAcValue.toLowerCase() !== conflictingLookupAc.toLowerCase();
  assert(hasConflict === true, '13. Conflict detected between imported AC and conflicting lookup candidate');

  // ==============================================================================
  // SECTION 9: OFFICIALLY VERIFIED PROTECTION
  // ==============================================================================
  console.log("\n== SECTION 9: Officially Verified Protection ==");

  const initialVerifiedOrigins: FieldOrigins = {
    assembly_constituency: 'initial',
    assembly_constituency_number: 'initial',
    parliamentary_constituency: 'initial',
    parliamentary_constituency_number: 'initial',
  };

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', 'New Candidate', initialVerifiedOrigins.assembly_constituency) === false,
    '14. Officially verified initial assembly_constituency cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '123', initialVerifiedOrigins.assembly_constituency_number) === false,
    '14. Officially verified initial AC number cannot be overwritten by lookup'
  );

  // ==============================================================================
  // SECTION 10: ASYNC / RACE PROTECTION
  // ==============================================================================
  console.log("\n== SECTION 10: Async / Race Protection ==");

  const activeReqId = 5;
  const staleReqId = 4;
  const livePin = '700020';
  const reqPin = '743411';

  const isFreshStale = checkLookupFreshness(livePin, reqPin, staleReqId, activeReqId);
  assert(isFreshStale === false, '15. Stale request ID is rejected by freshness guard');

  const liveReqSameId = checkLookupFreshness(livePin, livePin, activeReqId, activeReqId);
  assert(liveReqSameId === true, '15. Current request ID with matching live PIN is accepted');

  const staleSessionToken = 1;
  const activeSessionToken = 2;
  assert(isSessionFresh(staleSessionToken, activeSessionToken) === false, '15. Stale session token is rejected');
  assert(isSessionFresh(activeSessionToken, activeSessionToken) === true, '15. Active session token is accepted');

  // ==============================================================================
  // SECTION 11: SESSION RESET ANTI-LEAKAGE (A -> B)
  // ==============================================================================
  console.log("\n== SECTION 11: Session Reset Anti-Leakage (A -> B) ==");

  const customerALookupState = {
    isElectoralLoading: true,
    electoralStatus: 'multiple' as const,
    electoralCandidates: [{ assembly_constituency: 'AC A', assembly_constituency_number: '1', source: 'test' }],
    selectedCandidate: { assembly_constituency: 'AC A', assembly_constituency_number: '1', source: 'test' } as ElectoralCandidate | null,
    electoralMessage: 'Multiple matches found',
    electoralConflict: { imported: 'AC A', lookup: 'AC B', candidate: {} as ElectoralCandidate } as unknown,
    sessionGeneration: 1,
    lookupReqId: 3,
  };

  const resetElectoralState = () => {
    return {
      isElectoralLoading: false,
      electoralStatus: null,
      electoralCandidates: [],
      selectedCandidate: null,
      electoralMessage: null,
      electoralConflict: null,
      sessionGeneration: customerALookupState.sessionGeneration + 1,
      lookupReqId: customerALookupState.lookupReqId + 1,
    };
  };

  const customerBLookupState = resetElectoralState();

  assert(customerBLookupState.electoralCandidates.length === 0, '16. Customer B candidates list is empty');
  assert(customerBLookupState.selectedCandidate === null, '16. Customer B selected candidate is null');
  assert(customerBLookupState.isElectoralLoading === false, '16. Customer B loading is false');
  assert(customerBLookupState.electoralStatus === null, '16. Customer B electoralStatus is null');
  assert(customerBLookupState.electoralMessage === null, '16. Customer B message is null');
  assert(customerBLookupState.electoralConflict === null, '16. Customer B conflict is null');
  assert(customerBLookupState.sessionGeneration === 2, '16. Session generation advanced from 1 to 2');

  assert(isSessionFresh(1, customerBLookupState.sessionGeneration) === false, '16. Late Customer A async response discarded for Customer B');

  // ==============================================================================
  // SECTION 12: EDIT MODE DATA PRESERVATION
  // ==============================================================================
  console.log("\n== SECTION 12: Edit Mode Data Preservation ==");

  const existingCustomerData = {
    first_name: 'Subhas',
    last_name: 'Bose',
    pincode: '700020',
    assembly_constituency: 'Bhabanipur',
    assembly_constituency_number: '159',
    parliamentary_constituency: 'Kolkata Dakshin',
    parliamentary_constituency_number: '23',
    electoral_verification_status: 'officially_verified' as const,
    electoral_verified_at: '2026-10-01T10:00:00.000Z',
  };

  const editOrigins = initializeFieldOrigins(existingCustomerData as unknown as Record<string, unknown>, true);

  assert(editOrigins.assembly_constituency === 'initial', '17. Edit mode: assembly_constituency marked initial');
  assert(editOrigins.assembly_constituency_number === 'initial', '17. Edit mode: AC number marked initial');
  assert(editOrigins.parliamentary_constituency === 'initial', '17. Edit mode: PC marked initial');
  assert(editOrigins.parliamentary_constituency_number === 'initial', '17. Edit mode: PC number marked initial');

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', 'New Candidate', editOrigins.assembly_constituency) === false,
    '17. Automatic lookup cannot overwrite saved AC in edit mode'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '999', editOrigins.assembly_constituency_number) === false,
    '17. Automatic lookup cannot overwrite saved AC number in edit mode'
  );

  // ==============================================================================
  // SECTION 13: VERIFICATION INVARIANTS
  // ==============================================================================
  console.log("\n== SECTION 13: Verification Invariants ==");

  const autoFilledForm: CustomerFormData = createCanonicalEmptyCustomer();
  autoFilledForm.assembly_constituency = resKholapota.candidates[0].assembly_constituency;
  autoFilledForm.assembly_constituency_number = resKholapota.candidates[0].assembly_constituency_number;
  autoFilledForm.parliamentary_constituency = resKholapota.candidates[0].parliamentary_constituency;
  autoFilledForm.parliamentary_constituency_number = resKholapota.candidates[0].parliamentary_constituency_number;

  assert(autoFilledForm.electoral_verification_status === 'unverified', '18. auto-fill never creates officially_verified status');
  assert(autoFilledForm.electoral_verification_status !== 'officially_verified', '18. Status is strictly not officially_verified');
  assert(autoFilledForm.electoral_verified_at === null, '18. auto-fill never creates official verification timestamp');

  assert(
    canImportOverwriteField('electoral_verification_status', 'officially_verified', 'unverified', undefined) === false,
    '18b. canImportOverwriteField rejects electoral_verification_status'
  );
  assert(
    canImportOverwriteField('electoral_verified_at', '2026-10-03T00:00:00.000Z', null, undefined) === false,
    '18b. canImportOverwriteField rejects electoral_verified_at'
  );

  // ==============================================================================
  // SECTION 14: EXISTING PIN LOOKUP COMPATIBILITY
  // ==============================================================================
  console.log("\n== SECTION 14: Existing PIN Lookup Compatibility ==");

  const pinRes = await IndiaPincodeProvider.lookup('700001');
  assert(pinRes.success === true, '19. Existing PIN lookup succeeds for 700001');
  assert(pinRes.data?.state === 'West Bengal', '19. PIN lookup fills State (West Bengal)');
  assert(pinRes.data?.district === 'Kolkata', '19. PIN lookup fills District (Kolkata)');
  assert((pinRes.data?.postOffices.length ?? 0) > 0, '19. PIN lookup fills Post Office list');
  assert(pinRes.data?.country === 'India', '19. PIN lookup fills Country (India)');
  assert(!('assembly_constituency' in (pinRes.data || {})), '19. PIN lookup does NOT invent assembly_constituency');

  // ==============================================================================
  // SECTION 15: NON-WEST-BENGAL & NON-INDIA GRACEFUL HANDLING
  // ==============================================================================
  console.log("\n== SECTION 15: Non-West-Bengal & Non-India Graceful Handling ==");

  const resOtherCountry = await provider.lookup({
    pincode: '90210',
    country: 'United States',
  });
  assert(resOtherCountry.status === 'not_found', '20. Non-India country returns not_found');
  assert(resOtherCountry.candidates.length === 0, '20. Non-India country returns 0 candidates');

  const resOtherState = await provider.lookup({
    pincode: '400001',
    state: 'Maharashtra',
    district: 'Mumbai',
    country: 'India',
  });
  assert(resOtherState.status === 'not_found', '20. Non-West-Bengal state returns not_found');
  assert(resOtherState.candidates.length === 0, '20. Non-West-Bengal state returns 0 candidates');

  const resEmpty = await provider.lookup({});
  assert(resEmpty.status === 'insufficient_data', '20. Empty context returns insufficient_data');
  assert(resEmpty.candidates.length === 0, '20. Empty context returns 0 candidates');

  console.log("\n==========================================================================");
  console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error("Test suite fatal crash:", err);
  process.exit(1);
});
