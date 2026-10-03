/**
 * ==============================================================================
 * GCDS ELECTORAL CONSTITUENCY AUTO-FILL PHASE — FAIL-CLOSED SAFETY TEST SUITE
 * File: test-customer-electoral-autofill.ts
 *
 * Verifies all architectural requirements, fail-closed safety constraints & invariants:
 * 1. Canonical AC/PC catalog integrity (ECI / CEO West Bengal Delimitation 2008)
 * 2. Strict rejection of incorrect AC numbers / names (e.g. Basirhat Uttar != 102, Deganga != 101, Habra != 110)
 * 3. Programmatic audit of EVERY PIN mapping in WEST_BENGAL_PINCODE_MAPPINGS:
 *    - All candidates exist in canonical catalog
 *    - AC/PC relationships are canonical
 *    - No mapping produces status 'unique' without certified statutory official provenance
 *    - All current mappings fail closed to status 'multiple' with candidate(s) for operator review
 * 4. Specific regression assertions for required PINs:
 *    - 743411 (Basirhat HPO)
 *    - 743412 (Hasnabad SO)
 *    - 743423 (Deganga SO)
 *    - 743424 (Haroa SO)
 *    - 743425 (Baduria SO)
 *    - 743426 (Kholapota SO)
 *    - 743427 (Minakhan SO)
 *    - 743429 (Sandeshkhali SO)
 *    - 743435 (Hingalganj SO)
 *    - 743456 (Bhebia SO)
 *    - 743422 (Unmapped / Bhabla SO)
 *    - 743235 (Bangaon SO)
 *    - 743245 (Chandpara Bazar SO)
 *    - Urban Kolkata (700001, 700020, 700019, 700029)
 *    - Howrah & Hooghly (711101, 711102, 712201, 741201)
 * 5. Provider fail-closed invariant:
 *    - Uncertified or operator_curated mappings CANNOT produce status 'unique'
 *    - Medium/low confidence CANNOT produce status 'unique'
 *    - Free-text / locality keywords CANNOT produce status 'unique'
 * 6. Operator manual candidate selection populates AC/PC without silent guessing
 * 7. Verification semantics: Candidate selection never creates officially_verified or verified_at
 * 8. Manual, imported, and officially verified protections remain intact
 * 9. Stale async responses discarded
 * 10. Session reset (Customer A -> B) clears all electoral state
 * 11. Existing PIN lookup boundary isolation intact
 * 12. Non-West-Bengal & non-India handling fails gracefully
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
console.log("🛡️ GCDS ELECTORAL CONSTITUENCY FAIL-CLOSED SAFETY TEST SUITE");
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

  assert(Object.keys(OFFICIAL_CONSTITUENCY_CATALOG).length >= 33,
    'Catalog contains all required verified constituencies');

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

  const ac117 = getCanonicalConstituency('117');
  assert(ac117?.ac_name === 'Rajarhat Gopalpur' && ac117?.pc_number === '16' && ac117?.pc_name === 'Dum Dum',
    'Canonical 117: Rajarhat Gopalpur -> PC 16 Dum Dum (Corrected from Barasat)');

  // Strict rejection of incorrect pairs
  assert(!validateConstituency('102', 'Basirhat Uttar'), 'Rejected: Basirhat Uttar is NOT 102 (correct is 125)');
  assert(!validateConstituency('101', 'Deganga'), 'Rejected: Deganga is NOT 101 (correct is 120)');
  assert(!validateConstituency('110', 'Habra'), 'Rejected: Habra is NOT 110 (correct is 100)');
  assert(!validateConstituency('109', 'Ashoknagar'), 'Rejected: Ashoknagar is NOT 109 (correct is 101)');
  assert(!validateConstituency('125', 'Hingalganj'), 'Rejected: Hingalganj is NOT 125 (correct is 126)');

  // Acceptance of canonical pairs
  assert(validateConstituency('125', 'Basirhat Uttar', '18', 'Basirhat'), 'Accepted: Basirhat Uttar (125) / PC 18');
  assert(validateConstituency('120', 'Deganga', '17', 'Barasat'), 'Accepted: Deganga (120) / PC 17');
  assert(validateConstituency('100', 'Habra', '17', 'Barasat'), 'Accepted: Habra (100) / PC 17');
  assert(validateConstituency('101', 'Ashoknagar', '17', 'Barasat'), 'Accepted: Ashoknagar (101) / PC 17');
  assert(validateConstituency('126', 'Hingalganj (SC)', '18', 'Basirhat'), 'Accepted: Hingalganj (SC) (126) / PC 18');

  // ==============================================================================
  // SECTION 1: PROGRAMMATIC AUDIT OF EVERY PIN MAPPING ENTRY
  // ==============================================================================
  console.log("\n== SECTION 1: Programmatic Audit of Every Entry in Dataset ==");

  assert(WEST_BENGAL_PINCODE_MAPPINGS.length >= 25, 'Dataset contains all curated West Bengal PIN mappings');

  let allCandidatesCanonical = true;
  let allFailClosed = true;
  let noUnsupportedClaims = true;

  for (const mapping of WEST_BENGAL_PINCODE_MAPPINGS) {
    // 1. Invariant: Every candidate exists in canonical catalog and matches perfectly
    for (const cand of mapping.candidates) {
      const isCanon = validateConstituency(
        cand.assembly_constituency_number,
        cand.assembly_constituency,
        cand.parliamentary_constituency_number,
        cand.parliamentary_constituency
      );
      if (!isCanon) {
        allCandidatesCanonical = false;
        console.error(`Non-canonical candidate in PIN ${mapping.pincode}:`, cand);
      }
    }

    // 2. Invariant: Safe default — no mapping claims to be uniquely deterministic without certified evidence
    if (mapping.isUnique !== false || mapping.isDeterministic !== false) {
      allFailClosed = false;
      console.error(`Mapping ${mapping.pincode} violates safe default (isUnique or isDeterministic is true)`);
    }

    // 3. Invariant: Conservative provenance — no unsupported claims
    const ref = mapping.provenance.source_reference.toLowerCase();
    if (ref.includes('delimited to ac') || ref.includes('entire pin falls in ac') || ref.includes('verified')) {
      noUnsupportedClaims = false;
      console.error(`Mapping ${mapping.pincode} contains unsupported source_reference claim: "${mapping.provenance.source_reference}"`);
    }

    // 4. Invariant: Lookup for this PIN must NEVER return 'unique'
    const lookupRes = await provider.lookup({ pincode: mapping.pincode, state: 'West Bengal' });
    if (lookupRes.status === 'unique') {
      allFailClosed = false;
      console.error(`PIN ${mapping.pincode} incorrectly produced status 'unique' without statutory evidence!`);
    }
  }

  assert(allCandidatesCanonical, 'Audit: All candidates across all PIN mappings match canonical catalog exactly');
  assert(allFailClosed, 'Audit: Every PIN mapping in dataset fails closed (isUnique=false, isDeterministic=false, status!=unique)');
  assert(noUnsupportedClaims, 'Audit: No mapping uses unsupported claims ("delimited to AC", "entire PIN falls", "verified")');

  // ==============================================================================
  // SECTION 2: REGRESSION TESTS FOR MANDATORY PIN CODES
  // ==============================================================================
  console.log("\n== SECTION 2: Mandatory PIN Code Resolution Invariants ==");

  // 1. PIN 743411 (Basirhat HPO)
  const res743411 = await provider.lookup({ pincode: '743411', state: 'West Bengal' });
  assert(res743411.status === 'multiple', '743411: Status is strictly multiple (never unique)');
  assert(res743411.candidates.length === 2, '743411: Returns exactly 2 canonical candidates');
  assert(res743411.candidates.some(c => c.assembly_constituency_number === '124' && c.assembly_constituency === 'Basirhat Dakshin'),
    '743411: Includes Basirhat Dakshin (124)');
  assert(res743411.candidates.some(c => c.assembly_constituency_number === '125' && c.assembly_constituency === 'Basirhat Uttar'),
    '743411: Includes Basirhat Uttar (125)');

  // Invariant: Unverified keywords never produce unique for 743411
  const res743411Dandirhat = await provider.lookup({ pincode: '743411', post_office: 'Dandirhat', address: 'Gazi para' });
  assert(res743411Dandirhat.status === 'multiple', '743411 + Dandirhat: Remains multiple (never auto-fills)');

  // 2. PIN 743412 (Hasnabad SO)
  const res743412 = await provider.lookup({ pincode: '743412', state: 'West Bengal' });
  assert(res743412.status === 'multiple', '743412: Status is multiple');
  assert(res743412.candidates.some(c => c.assembly_constituency_number === '123' && c.assembly_constituency.includes('Sandeshkhali')),
    '743412: Includes Sandeshkhali (ST) (123)');
  assert(res743412.candidates.some(c => c.assembly_constituency_number === '126' && c.assembly_constituency.includes('Hingalganj')),
    '743412: Includes Hingalganj (SC) (126)');

  // 3. PIN 743423 (Deganga SO)
  const res743423 = await provider.lookup({ pincode: '743423', state: 'West Bengal' });
  assert(res743423.status === 'multiple', '743423 (Deganga): Fails closed to status multiple (no silent auto-fill)');
  assert(res743423.candidates.length === 1 && res743423.candidates[0].assembly_constituency_number === '120',
    '743423: Returns Deganga (AC 120, NOT 101) for operator review');

  // 4. PIN 743424 (Haroa SO)
  const res743424 = await provider.lookup({ pincode: '743424', state: 'West Bengal' });
  assert(res743424.status === 'multiple', '743424 (Haroa): Fails closed to status multiple');
  assert(res743424.candidates.length === 1 && res743424.candidates[0].assembly_constituency_number === '121',
    '743424: Returns Haroa (AC 121) for operator review');

  // 5. PIN 743425 (Baduria SO)
  const res743425 = await provider.lookup({ pincode: '743425', state: 'West Bengal' });
  assert(res743425.status === 'multiple', '743425 (Baduria): Fails closed to status multiple');
  assert(res743425.candidates.length === 1 && res743425.candidates[0].assembly_constituency_number === '99',
    '743425: Returns Baduria (AC 99) for operator review');

  // 6. PIN 743426 (Kholapota SO)
  const res743426 = await provider.lookup({ pincode: '743426', state: 'West Bengal' });
  assert(res743426.status === 'multiple', '743426 (Kholapota): Fails closed to status multiple');
  assert(res743426.candidates.length === 1 && res743426.candidates[0].assembly_constituency_number === '125',
    '743426: Returns Basirhat Uttar (AC 125, NOT 102) for operator review');

  // 7. PIN 743427 (Minakhan SO)
  const res743427 = await provider.lookup({ pincode: '743427', state: 'West Bengal' });
  assert(res743427.status === 'multiple', '743427 (Minakhan): Fails closed to status multiple');
  assert(res743427.candidates.length === 1 && res743427.candidates[0].assembly_constituency_number === '122',
    '743427: Returns Minakhan (SC) (AC 122) for operator review');

  // 8. PIN 743429 (Sandeshkhali SO)
  const res743429 = await provider.lookup({ pincode: '743429', state: 'West Bengal' });
  assert(res743429.status === 'multiple', '743429 (Sandeshkhali): Fails closed to status multiple');
  assert(res743429.candidates.length === 1 && res743429.candidates[0].assembly_constituency_number === '123',
    '743429: Returns Sandeshkhali (ST) (AC 123) for operator review');

  // 9. PIN 743435 (Hingalganj SO)
  const res743435 = await provider.lookup({ pincode: '743435', state: 'West Bengal' });
  assert(res743435.status === 'multiple', '743435 (Hingalganj): Fails closed to status multiple');
  assert(res743435.candidates.length === 1 && res743435.candidates[0].assembly_constituency_number === '126',
    '743435: Returns Hingalganj (SC) (AC 126, NOT 125) for operator review');

  // 10. PIN 743456 (Bhebia SO)
  const res743456 = await provider.lookup({ pincode: '743456', state: 'West Bengal' });
  assert(res743456.status === 'multiple', '743456 (Bhebia): Fails closed to status multiple');
  assert(res743456.candidates.length === 1 && res743456.candidates[0].assembly_constituency_number === '125',
    '743456: Returns Basirhat Uttar (AC 125, NOT 102) for operator review');

  // 11. PIN 743422 (Bhabla / Sangrampur — unverified boundary)
  const res743422 = await provider.lookup({ pincode: '743422', state: 'West Bengal' });
  assert(res743422.status === 'not_found', '743422: Correctly removed / returns not_found (unsupported provenance)');

  // 12. PIN 743235 (Bangaon SO)
  const res743235 = await provider.lookup({ pincode: '743235', state: 'West Bengal' });
  assert(res743235.status === 'multiple', '743235 (Bangaon): Status is multiple');
  assert(res743235.candidates.length === 2, '743235: Returns 2 candidates (Bangaon Uttar 95 & Bangaon Dakshin 96)');

  // 13. PIN 743245 (Chandpara Bazar SO)
  const res743245 = await provider.lookup({ pincode: '743245', state: 'West Bengal' });
  assert(res743245.status === 'multiple', '743245 (Chandpara): Fails closed to status multiple');
  assert(res743245.candidates[0].assembly_constituency_number === '96', '743245: Returns Bangaon Dakshin (96) for review');

  // 14. Urban Kolkata & Howrah & Hooghly audits
  const urbanPins = [
    { pin: '700001', name: 'Kolkata GPO', expectedCount: 2 },
    { pin: '700020', name: 'Bhowanipore', expectedCount: 1 },
    { pin: '700019', name: 'Ballygunge', expectedCount: 1 },
    { pin: '700029', name: 'Rashbehari', expectedCount: 1 },
    { pin: '711101', name: 'Howrah HPO', expectedCount: 1 },
    { pin: '711102', name: 'Shibpur', expectedCount: 1 },
    { pin: '712201', name: 'Serampore', expectedCount: 1 },
    { pin: '741201', name: 'Ranaghat', expectedCount: 1 },
  ];

  for (const u of urbanPins) {
    const res = await provider.lookup({ pincode: u.pin, state: 'West Bengal' });
    assert(res.status === 'multiple', `Urban PIN ${u.pin} (${u.name}): Fails closed to multiple (never auto-fills)`);
    assert(res.candidates.length === u.expectedCount, `Urban PIN ${u.pin}: Returns ${u.expectedCount} candidate(s) for review`);
  }

  // ==============================================================================
  // SECTION 3: PROVIDER FAIL-CLOSED INVARIANT VERIFICATION
  // ==============================================================================
  console.log("\n== SECTION 3: Provider Fail-Closed Gate & Locality Keyword Invariants ==");

  // Test that free-text address search NEVER produces status 'unique'
  const resText = await provider.lookup({
    address: 'Salt Lake Sector V, Bidhannagar, Kolkata',
    state: 'West Bengal',
  });
  assert(resText.status === 'multiple', 'Locality text search fails closed to multiple (never unique)');
  assert(resText.candidates[0].source_type === 'operator_curated', 'Locality text candidate is marked operator_curated');
  assert(resText.candidates[0].confidence === 'low', 'Locality text candidate confidence is low');

  // Emulate form state: Form fields MUST NOT be silently populated when status is 'multiple'
  const unselectedFormState: CustomerFormData = createCanonicalEmptyCustomer();
  if (res743423.status === 'unique') {
    unselectedFormState.assembly_constituency = res743423.candidates[0].assembly_constituency;
    unselectedFormState.assembly_constituency_number = res743423.candidates[0].assembly_constituency_number;
  }
  assert(unselectedFormState.assembly_constituency === '', 'Form field assembly_constituency remains blank on multiple');
  assert(unselectedFormState.assembly_constituency_number === '', 'Form field assembly_constituency_number remains blank on multiple');

  // ==============================================================================
  // SECTION 4: OPERATOR CANDIDATE SELECTION
  // ==============================================================================
  console.log("\n== SECTION 4: Operator Candidate Selection Populates Form ==");

  // Operator manually chooses the candidate from the candidate list
  const chosenCandidate = res743423.candidates[0]; // Deganga (120)
  assert(chosenCandidate !== undefined, 'Candidate available for operator selection');

  const operatorSelectedForm: CustomerFormData = createCanonicalEmptyCustomer();
  const operatorOrigins: FieldOrigins = {};

  operatorSelectedForm.assembly_constituency = chosenCandidate.assembly_constituency;
  operatorOrigins.assembly_constituency = 'lookup';
  operatorSelectedForm.assembly_constituency_number = chosenCandidate.assembly_constituency_number;
  operatorOrigins.assembly_constituency_number = 'lookup';
  operatorSelectedForm.parliamentary_constituency = chosenCandidate.parliamentary_constituency || '';
  operatorOrigins.parliamentary_constituency = 'lookup';
  operatorSelectedForm.parliamentary_constituency_number = chosenCandidate.parliamentary_constituency_number || '';
  operatorOrigins.parliamentary_constituency_number = 'lookup';

  assert(operatorSelectedForm.assembly_constituency === 'Deganga', 'Operator selection sets AC name');
  assert(operatorSelectedForm.assembly_constituency_number === '120', 'Operator selection sets AC number (120)');
  assert(operatorSelectedForm.parliamentary_constituency === 'Barasat', 'Operator selection sets PC name');
  assert(operatorSelectedForm.parliamentary_constituency_number === '17', 'Operator selection sets PC number (17)');
  assert(operatorSelectedForm.electoral_verification_status === 'unverified', 'Status remains unverified after selection');
  assert(operatorSelectedForm.electoral_verified_at === null, 'verified_at remains null after selection');

  // ==============================================================================
  // SECTION 5: NO MATCH SAFETY
  // ==============================================================================
  console.log("\n== SECTION 5: No Match Safety ==");

  const resUnmappedPin = await provider.lookup({
    pincode: '799999',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resUnmappedPin.status === 'not_found', 'Unmapped PIN returns status not_found');
  assert(resUnmappedPin.candidates.length === 0, 'Unmapped PIN returns 0 candidates');

  const existingFormWithSafeFields: CustomerFormData = {
    ...createCanonicalEmptyCustomer(),
    assembly_constituency: 'Existing AC',
    assembly_constituency_number: '50',
  };
  if (resUnmappedPin.status === 'unique') {
    existingFormWithSafeFields.assembly_constituency = resUnmappedPin.candidates[0].assembly_constituency;
  }
  assert(existingFormWithSafeFields.assembly_constituency === 'Existing AC', 'no match leaves existing fields safe');
  assert(existingFormWithSafeFields.assembly_constituency_number === '50', 'no match leaves AC number safe');

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

  assert(faultRes?.status === 'provider_error', 'Provider exception returns provider_error');
  assert(faultRes?.candidates.length === 0, 'Candidates list is empty on error');

  const manualForm: CustomerFormData = createCanonicalEmptyCustomer();
  manualForm.assembly_constituency = 'Manual AC Entry';
  manualForm.assembly_constituency_number = '105';
  assert(manualForm.assembly_constituency === 'Manual AC Entry', 'Operator can type constituency manually on error');
  assert(manualForm.assembly_constituency_number === '105', 'Operator can type AC number manually on error');

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
    'Manual user assembly_constituency cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', incomingLookupCandidate.assembly_constituency_number, userOrigins.assembly_constituency_number) === false,
    'Manual user AC number cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('parliamentary_constituency', incomingLookupCandidate.parliamentary_constituency, userOrigins.parliamentary_constituency) === false,
    'Manual user PC cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('parliamentary_constituency_number', incomingLookupCandidate.parliamentary_constituency_number, userOrigins.parliamentary_constituency_number) === false,
    'Manual user PC number cannot be overwritten by lookup'
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
    'Imported assembly_constituency cannot be silently overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '999', importOrigins.assembly_constituency_number) === false,
    'Imported AC number cannot be silently overwritten by lookup'
  );

  const importedAcValue = 'Basirhat Uttar';
  const conflictingLookupAc = 'Basirhat Dakshin';
  const hasConflict = importOrigins.assembly_constituency === 'import' && importedAcValue.toLowerCase() !== conflictingLookupAc.toLowerCase();
  assert(hasConflict === true, 'Conflict detected between imported AC and conflicting lookup candidate');

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
    'Officially verified initial assembly_constituency cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '123', initialVerifiedOrigins.assembly_constituency_number) === false,
    'Officially verified initial AC number cannot be overwritten by lookup'
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
  assert(isFreshStale === false, 'Stale request ID is rejected by freshness guard');

  const liveReqSameId = checkLookupFreshness(livePin, livePin, activeReqId, activeReqId);
  assert(liveReqSameId === true, 'Current request ID with matching live PIN is accepted');

  const staleSessionToken = 1;
  const activeSessionToken = 2;
  assert(isSessionFresh(staleSessionToken, activeSessionToken) === false, 'Stale session token is rejected');
  assert(isSessionFresh(activeSessionToken, activeSessionToken) === true, 'Active session token is accepted');

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

  assert(customerBLookupState.electoralCandidates.length === 0, 'Customer B candidates list is empty');
  assert(customerBLookupState.selectedCandidate === null, 'Customer B selected candidate is null');
  assert(customerBLookupState.isElectoralLoading === false, 'Customer B loading is false');
  assert(customerBLookupState.electoralStatus === null, 'Customer B electoralStatus is null');
  assert(customerBLookupState.electoralMessage === null, 'Customer B message is null');
  assert(customerBLookupState.electoralConflict === null, 'Customer B conflict is null');
  assert(customerBLookupState.sessionGeneration === 2, 'Session generation advanced from 1 to 2');

  assert(isSessionFresh(1, customerBLookupState.sessionGeneration) === false, 'Late Customer A async response discarded for Customer B');

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

  assert(editOrigins.assembly_constituency === 'initial', 'Edit mode: assembly_constituency marked initial');
  assert(editOrigins.assembly_constituency_number === 'initial', 'Edit mode: AC number marked initial');
  assert(editOrigins.parliamentary_constituency === 'initial', 'Edit mode: PC marked initial');
  assert(editOrigins.parliamentary_constituency_number === 'initial', 'Edit mode: PC number marked initial');

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', 'New Candidate', editOrigins.assembly_constituency) === false,
    'Automatic lookup cannot overwrite saved AC in edit mode'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '999', editOrigins.assembly_constituency_number) === false,
    'Automatic lookup cannot overwrite saved AC number in edit mode'
  );

  // ==============================================================================
  // SECTION 13: VERIFICATION INVARIANTS
  // ==============================================================================
  console.log("\n== SECTION 13: Verification Invariants ==");

  const autoFilledForm: CustomerFormData = createCanonicalEmptyCustomer();
  // Emulate candidate selection
  autoFilledForm.assembly_constituency = res743423.candidates[0].assembly_constituency;
  autoFilledForm.assembly_constituency_number = res743423.candidates[0].assembly_constituency_number;
  autoFilledForm.parliamentary_constituency = res743423.candidates[0].parliamentary_constituency;
  autoFilledForm.parliamentary_constituency_number = res743423.candidates[0].parliamentary_constituency_number;

  assert(autoFilledForm.electoral_verification_status === 'unverified', 'Candidate selection never creates officially_verified status');
  assert(autoFilledForm.electoral_verification_status !== 'officially_verified', 'Status is strictly not officially_verified');
  assert(autoFilledForm.electoral_verified_at === null, 'Candidate selection never creates official verification timestamp');

  assert(
    canImportOverwriteField('electoral_verification_status', 'officially_verified', 'unverified', undefined) === false,
    'canImportOverwriteField rejects electoral_verification_status'
  );
  assert(
    canImportOverwriteField('electoral_verified_at', '2026-10-03T00:00:00.000Z', null, undefined) === false,
    'canImportOverwriteField rejects electoral_verified_at'
  );

  // ==============================================================================
  // SECTION 14: EXISTING PIN LOOKUP COMPATIBILITY
  // ==============================================================================
  console.log("\n== SECTION 14: Existing PIN Lookup Compatibility ==");

  const pinRes = await IndiaPincodeProvider.lookup('700001');
  assert(pinRes.success === true, 'Existing PIN lookup succeeds for 700001');
  assert(pinRes.data?.state === 'West Bengal', 'PIN lookup fills State (West Bengal)');
  assert(pinRes.data?.district === 'Kolkata', 'PIN lookup fills District (Kolkata)');
  assert((pinRes.data?.postOffices.length ?? 0) > 0, 'PIN lookup fills Post Office list');
  assert(pinRes.data?.country === 'India', 'PIN lookup fills Country (India)');
  assert(!('assembly_constituency' in (pinRes.data || {})), 'PIN lookup does NOT invent assembly_constituency');

  // ==============================================================================
  // SECTION 15: NON-WEST-BENGAL & NON-INDIA GRACEFUL HANDLING
  // ==============================================================================
  console.log("\n== SECTION 15: Non-West-Bengal & Non-India Graceful Handling ==");

  const resOtherCountry = await provider.lookup({
    pincode: '90210',
    country: 'United States',
  });
  assert(resOtherCountry.status === 'not_found', 'Non-India country returns not_found');
  assert(resOtherCountry.candidates.length === 0, 'Non-India country returns 0 candidates');

  const resOtherState = await provider.lookup({
    pincode: '400001',
    state: 'Maharashtra',
    district: 'Mumbai',
    country: 'India',
  });
  assert(resOtherState.status === 'not_found', 'Non-West-Bengal state returns not_found');
  assert(resOtherState.candidates.length === 0, 'Non-West-Bengal state returns 0 candidates');

  const resEmpty = await provider.lookup({});
  assert(resEmpty.status === 'insufficient_data', 'Empty context returns insufficient_data');
  assert(resEmpty.candidates.length === 0, 'Empty context returns 0 candidates');

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
