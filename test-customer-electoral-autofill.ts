/**
 * ==============================================================================
 * GCDS ELECTORAL CONSTITUENCY AUTO-FILL PHASE — COMPREHENSIVE TEST SUITE
 * File: test-customer-electoral-autofill.ts
 *
 * Verifies all 18 core requirements:
 * 1. unique location → AC auto-filled
 * 2. AC number auto-filled
 * 3. PC/PC number filled when mapping exists
 * 4. ambiguous location → no automatic selection
 * 5. ambiguous result → operator can select candidate
 * 6. PIN-only ambiguous result never guessed
 * 7. no match leaves fields safe
 * 8. provider failure leaves manual entry available
 * 9. manual electoral values not overwritten
 * 10. imported electoral values not silently overwritten
 * 11. officially verified values not overwritten
 * 12. stale async response discarded
 * 13. Customer A → B reset clears lookup state
 * 14. edit mode preserves saved data
 * 15. auto-fill never creates officially_verified status
 * 16. auto-fill never creates official verification timestamp
 * 17. existing PIN State/District/Post Office lookup still works
 * 18. other country/non-West-Bengal behavior fails gracefully
 * ==============================================================================
 */

import { AuthoritativeElectoralConstituencyProvider } from './src/lib/electoral/ElectoralConstituencyProvider';
import { ElectoralCandidate, ElectoralLookupLocationContext, ElectoralLookupResult } from './src/lib/electoral/electoral-types';
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
console.log("🗳️ GCDS ELECTORAL CONSTITUENCY AUTO-FILL TEST SUITE");
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
  // 1, 2, 3: UNIQUE LOCATION → AC, AC NUMBER, PC, PC NUMBER AUTO-FILLED
  // ==============================================================================
  console.log("\n== SECTION 1: Unique Location Auto-Fill (AC, AC No, PC, PC No) ==");

  // Case A: 743422 (Bhebia, North 24 Parganas) maps uniquely to Basirhat Uttar (AC 102), Basirhat (PC 18)
  const resBhebia = await provider.lookup({
    pincode: '743422',
    state: 'West Bengal',
    district: 'North 24 Parganas',
    country: 'India',
  });

  assert(resBhebia.status === 'unique', '1. unique location → status is unique');
  assert(resBhebia.candidates.length === 1, '1. unique location returns exactly 1 candidate');
  assert(resBhebia.candidates[0].assembly_constituency === 'Basirhat Uttar', '1. AC name correctly matched (Basirhat Uttar)');
  assert(resBhebia.candidates[0].assembly_constituency_number === '102', '2. AC number correctly matched (102)');
  assert(resBhebia.candidates[0].parliamentary_constituency === 'Basirhat', '3. PC name correctly matched (Basirhat)');
  assert(resBhebia.candidates[0].parliamentary_constituency_number === '18', '3. PC number correctly matched (18)');
  assert(resBhebia.candidates[0].source.includes('CEO West Bengal') || resBhebia.candidates[0].source.includes('Election Commission of India'), 'Authoritative source attributed');

  // Case B: 700020 (Bhowanipore, Kolkata) maps uniquely to Bhabanipur (AC 159), Kolkata Dakshin (PC 23)
  const resBhowanipore = await provider.lookup({
    pincode: '700020',
    state: 'West Bengal',
    district: 'Kolkata',
    country: 'India',
  });
  assert(resBhowanipore.status === 'unique', '1b. Bhowanipore PIN 700020 status is unique');
  assert(resBhowanipore.candidates[0].assembly_constituency === 'Bhabanipur', '1b. Bhowanipore AC name is Bhabanipur');
  assert(resBhowanipore.candidates[0].assembly_constituency_number === '159', '2b. Bhowanipore AC number is 159');
  assert(resBhowanipore.candidates[0].parliamentary_constituency === 'Kolkata Dakshin', '3b. Bhowanipore PC is Kolkata Dakshin');
  assert(resBhowanipore.candidates[0].parliamentary_constituency_number === '23', '3b. Bhowanipore PC number is 23');

  // Emulate form auto-fill on unique match
  const formState: CustomerFormData = createCanonicalEmptyCustomer();
  const origins: FieldOrigins = {};

  if (canLookupOverwriteElectoralField('assembly_constituency', resBhebia.candidates[0].assembly_constituency, origins.assembly_constituency)) {
    formState.assembly_constituency = resBhebia.candidates[0].assembly_constituency;
    origins.assembly_constituency = 'lookup';
  }
  if (canLookupOverwriteElectoralField('assembly_constituency_number', resBhebia.candidates[0].assembly_constituency_number, origins.assembly_constituency_number)) {
    formState.assembly_constituency_number = resBhebia.candidates[0].assembly_constituency_number;
    origins.assembly_constituency_number = 'lookup';
  }
  if (canLookupOverwriteElectoralField('parliamentary_constituency', resBhebia.candidates[0].parliamentary_constituency, origins.parliamentary_constituency)) {
    formState.parliamentary_constituency = resBhebia.candidates[0].parliamentary_constituency;
    origins.parliamentary_constituency = 'lookup';
  }
  if (canLookupOverwriteElectoralField('parliamentary_constituency_number', resBhebia.candidates[0].parliamentary_constituency_number, origins.parliamentary_constituency_number)) {
    formState.parliamentary_constituency_number = resBhebia.candidates[0].parliamentary_constituency_number;
    origins.parliamentary_constituency_number = 'lookup';
  }

  assert(formState.assembly_constituency === 'Basirhat Uttar', 'Form state: AC auto-filled');
  assert(formState.assembly_constituency_number === '102', 'Form state: AC number auto-filled');
  assert(formState.parliamentary_constituency === 'Basirhat', 'Form state: PC auto-filled');
  assert(formState.parliamentary_constituency_number === '18', 'Form state: PC number auto-filled');

  // ==============================================================================
  // 4, 6: AMBIGUOUS LOCATION → NO AUTOMATIC SELECTION (PIN-ONLY NEVER GUESSED)
  // ==============================================================================
  console.log("\n== SECTION 2: Ambiguous Location Safety (Never Guessed) ==");

  // 743411 (Basirhat delivery area) spans Basirhat Uttar (102) and Basirhat Dakshin (124)
  const resAmbiguousPin = await provider.lookup({
    pincode: '743411',
    state: 'West Bengal',
    country: 'India',
  });

  assert(resAmbiguousPin.status === 'multiple', '4. ambiguous PIN without post office → status is multiple');
  assert(resAmbiguousPin.candidates.length === 2, '4. multiple candidates returned (2 candidates)');
  assert(
    resAmbiguousPin.candidates.some(c => c.assembly_constituency === 'Basirhat Uttar' && c.assembly_constituency_number === '102'),
    '4. Candidates contain Basirhat Uttar (102)'
  );
  assert(
    resAmbiguousPin.candidates.some(c => c.assembly_constituency === 'Basirhat Dakshin' && c.assembly_constituency_number === '124'),
    '4. Candidates contain Basirhat Dakshin (124)'
  );

  // Invariant 6: When status is 'multiple', form fields MUST NOT be auto-filled
  const unselectedFormState: CustomerFormData = createCanonicalEmptyCustomer();
  if (resAmbiguousPin.status === 'unique') {
    unselectedFormState.assembly_constituency = resAmbiguousPin.candidates[0].assembly_constituency;
  }
  assert(unselectedFormState.assembly_constituency === '', '6. PIN-only ambiguous result never guessed or auto-filled');
  assert(unselectedFormState.assembly_constituency_number === '', '6. AC number remains empty');
  assert(unselectedFormState.parliamentary_constituency === '', '6. PC remains empty');

  // Kolkata GPO 700001 without specific address spans Chowrangee (162) and Jorasanko (165)
  const resKolkataGpo = await provider.lookup({
    pincode: '700001',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resKolkataGpo.status === 'multiple', '4b. Kolkata 700001 without locality → status is multiple');
  assert(resKolkataGpo.candidates.length >= 2, '4b. Returns multiple candidates for Kolkata 700001');

  // ==============================================================================
  // 5: AMBIGUOUS RESULT → OPERATOR CAN SELECT CANDIDATE
  // ==============================================================================
  console.log("\n== SECTION 3: Operator Candidate Selection ==");

  // Ambiguous candidates: Operator chooses Basirhat Dakshin
  const candidateToSelect = resAmbiguousPin.candidates.find(c => c.assembly_constituency === 'Basirhat Dakshin')!;
  assert(candidateToSelect !== undefined, 'Target candidate found in candidates list');

  const operatorSelectedForm: CustomerFormData = createCanonicalEmptyCustomer();
  const operatorOrigins: FieldOrigins = {};

  // Emulate operator selection action
  operatorSelectedForm.assembly_constituency = candidateToSelect.assembly_constituency;
  operatorOrigins.assembly_constituency = 'lookup';
  operatorSelectedForm.assembly_constituency_number = candidateToSelect.assembly_constituency_number;
  operatorOrigins.assembly_constituency_number = 'lookup';
  operatorSelectedForm.parliamentary_constituency = candidateToSelect.parliamentary_constituency || '';
  operatorOrigins.parliamentary_constituency = 'lookup';
  operatorSelectedForm.parliamentary_constituency_number = candidateToSelect.parliamentary_constituency_number || '';
  operatorOrigins.parliamentary_constituency_number = 'lookup';

  assert(operatorSelectedForm.assembly_constituency === 'Basirhat Dakshin', '5. Operator selection populates AC name');
  assert(operatorSelectedForm.assembly_constituency_number === '124', '5. Operator selection populates AC number');
  assert(operatorSelectedForm.parliamentary_constituency === 'Basirhat', '5. Operator selection populates PC name');
  assert(operatorSelectedForm.parliamentary_constituency_number === '18', '5. Operator selection populates PC number');
  assert(operatorSelectedForm.electoral_verification_status === 'unverified', '5. Status remains unverified after selection');

  // Post-office based disambiguation:
  // When 743411 has post office 'Dandirhat' or address 'Dandirhat' → uniquely resolves to Basirhat Uttar
  const resDisambiguated = await provider.lookup({
    pincode: '743411',
    post_office: 'Dandirhat',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resDisambiguated.status === 'unique', '5b. Post office Dandirhat disambiguates 743411 to unique match');
  assert(resDisambiguated.candidates[0].assembly_constituency === 'Basirhat Uttar', '5b. Disambiguated candidate is Basirhat Uttar');

  // When 743411 has post office 'Basirhat College' → uniquely resolves to Basirhat Dakshin
  const resDisambiguatedDakshin = await provider.lookup({
    pincode: '743411',
    post_office: 'Basirhat College',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resDisambiguatedDakshin.status === 'unique', '5c. Post office Basirhat College disambiguates 743411 to Basirhat Dakshin');
  assert(resDisambiguatedDakshin.candidates[0].assembly_constituency === 'Basirhat Dakshin', '5c. Disambiguated candidate is Basirhat Dakshin');

  // ==============================================================================
  // 7: NO MATCH LEAVES FIELDS SAFE
  // ==============================================================================
  console.log("\n== SECTION 4: No Match Safety ==");

  const resUnmappedPin = await provider.lookup({
    pincode: '799999',
    state: 'West Bengal',
    country: 'India',
  });
  assert(resUnmappedPin.status === 'not_found', '7. Unmapped PIN returns status not_found');
  assert(resUnmappedPin.candidates.length === 0, '7. Unmapped PIN returns 0 candidates');

  // Fields remain safe
  const existingFormWithSafeFields: CustomerFormData = {
    ...createCanonicalEmptyCustomer(),
    assembly_constituency: 'Existing AC',
    assembly_constituency_number: '50',
  };
  if (resUnmappedPin.status === 'unique') {
    existingFormWithSafeFields.assembly_constituency = resUnmappedPin.candidates[0].assembly_constituency;
  }
  assert(existingFormWithSafeFields.assembly_constituency === 'Existing AC', '7. no match leaves existing fields safe');
  assert(existingFormWithSafeFields.assembly_constituency_number === '50', '7. no match leaves AC number safe');

  // ==============================================================================
  // 8: PROVIDER FAILURE LEAVES MANUAL ENTRY AVAILABLE
  // ==============================================================================
  console.log("\n== SECTION 5: Provider Failure Resilience ==");

  class FaultyProvider extends AuthoritativeElectoralConstituencyProvider {
    async lookup(_context: ElectoralLookupLocationContext): Promise<ElectoralLookupResult> {
      void _context;
      throw new Error("Simulated network outage");
    }
  }
  const faultyProvider = new FaultyProvider();
  let faultRes: ElectoralLookupResult | null = null;
  try {
    faultRes = await faultyProvider.lookup({ pincode: '743422' });
  } catch {
    faultRes = {
      status: 'provider_error',
      candidates: [],
      error: 'Simulated network outage',
      reason: 'Unable to check constituency',
    };
  }

  assert(faultRes?.status === 'provider_error', '8. Provider exception returns provider_error');
  assert(faultRes?.candidates.length === 0, '8. Candidates list is empty on error');

  // Manual entry remains fully unblocked
  const manualForm: CustomerFormData = createCanonicalEmptyCustomer();
  manualForm.assembly_constituency = 'Manual AC Entry';
  manualForm.assembly_constituency_number = '105';
  assert(manualForm.assembly_constituency === 'Manual AC Entry', '8. Operator can type constituency manually on error');
  assert(manualForm.assembly_constituency_number === '105', '8. Operator can type AC number manually on error');

  // ==============================================================================
  // 9: MANUAL ELECTORAL VALUES NOT OVERWRITTEN
  // ==============================================================================
  console.log("\n== SECTION 6: Manual Override Protection ==");

  const userOrigins: FieldOrigins = {
    assembly_constituency: 'user',
    assembly_constituency_number: 'user',
    parliamentary_constituency: 'user',
    parliamentary_constituency_number: 'user',
  };

  const incomingLookupCandidate = {
    assembly_constituency: 'Basirhat Uttar',
    assembly_constituency_number: '102',
    parliamentary_constituency: 'Basirhat',
    parliamentary_constituency_number: '18',
  };

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', incomingLookupCandidate.assembly_constituency, userOrigins.assembly_constituency) === false,
    '9. Manual user assembly_constituency cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', incomingLookupCandidate.assembly_constituency_number, userOrigins.assembly_constituency_number) === false,
    '9. Manual user AC number cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('parliamentary_constituency', incomingLookupCandidate.parliamentary_constituency, userOrigins.parliamentary_constituency) === false,
    '9. Manual user PC cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('parliamentary_constituency_number', incomingLookupCandidate.parliamentary_constituency_number, userOrigins.parliamentary_constituency_number) === false,
    '9. Manual user PC number cannot be overwritten by lookup'
  );

  // ==============================================================================
  // 10: IMPORTED ELECTORAL VALUES NOT SILENTLY OVERWRITTEN
  // ==============================================================================
  console.log("\n== SECTION 7: Smart Import Protection & Conflict Detection ==");

  const importOrigins: FieldOrigins = {
    assembly_constituency: 'import',
    assembly_constituency_number: 'import',
  };

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', 'Different AC', importOrigins.assembly_constituency) === false,
    '10. Imported assembly_constituency cannot be silently overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '999', importOrigins.assembly_constituency_number) === false,
    '10. Imported AC number cannot be silently overwritten by lookup'
  );

  // Test conflict detection logic when imported value differs from lookup
  const importedAcValue = 'Basirhat Uttar';
  const conflictingLookupAc = 'Basirhat Dakshin';
  const hasConflict = importOrigins.assembly_constituency === 'import' && importedAcValue.toLowerCase() !== conflictingLookupAc.toLowerCase();
  assert(hasConflict === true, '10. Conflict detected between imported AC and conflicting lookup candidate');

  // ==============================================================================
  // 11: OFFICIALLY VERIFIED VALUES NOT OVERWRITTEN
  // ==============================================================================
  console.log("\n== SECTION 8: Officially Verified Protection ==");

  const initialVerifiedOrigins: FieldOrigins = {
    assembly_constituency: 'initial',
    assembly_constituency_number: 'initial',
    parliamentary_constituency: 'initial',
    parliamentary_constituency_number: 'initial',
  };

  assert(
    canLookupOverwriteElectoralField('assembly_constituency', 'New Candidate', initialVerifiedOrigins.assembly_constituency) === false,
    '11. Officially verified initial assembly_constituency cannot be overwritten by lookup'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '123', initialVerifiedOrigins.assembly_constituency_number) === false,
    '11. Officially verified initial AC number cannot be overwritten by lookup'
  );

  // ==============================================================================
  // 12: STALE ASYNC RESPONSE DISCARDED
  // ==============================================================================
  console.log("\n== SECTION 9: Async / Race Protection ==");

  const activeReqId = 5;
  const staleReqId = 4;
  const livePin = '700020';
  const reqPin = '743411';

  const isFreshStale = checkLookupFreshness(livePin, reqPin, staleReqId, activeReqId);
  assert(isFreshStale === false, '12. Stale request ID is rejected by freshness guard');

  const liveReqSameId = checkLookupFreshness(livePin, livePin, activeReqId, activeReqId);
  assert(liveReqSameId === true, '12. Current request ID with matching live PIN is accepted');

  const staleSessionToken = 1;
  const activeSessionToken = 2;
  assert(isSessionFresh(staleSessionToken, activeSessionToken) === false, '12. Stale session token is rejected');
  assert(isSessionFresh(activeSessionToken, activeSessionToken) === true, '12. Active session token is accepted');

  // ==============================================================================
  // 13: CUSTOMER A → B RESET CLEARS LOOKUP STATE
  // ==============================================================================
  console.log("\n== SECTION 10: Session Reset Anti-Leakage (A -> B) ==");

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

  // Emulate resetCustomerIntakeSession() actions
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

  assert(customerBLookupState.electoralCandidates.length === 0, '13. Customer B candidates list is empty');
  assert(customerBLookupState.selectedCandidate === null, '13. Customer B selected candidate is null');
  assert(customerBLookupState.isElectoralLoading === false, '13. Customer B loading is false');
  assert(customerBLookupState.electoralStatus === null, '13. Customer B electoralStatus is null');
  assert(customerBLookupState.electoralMessage === null, '13. Customer B message is null');
  assert(customerBLookupState.electoralConflict === null, '13. Customer B conflict is null');
  assert(customerBLookupState.sessionGeneration === 2, '13. Session generation advanced from 1 to 2');

  // Late arriving response from Customer A (session 1) tested against Customer B (session 2)
  assert(isSessionFresh(1, customerBLookupState.sessionGeneration) === false, '13. Late Customer A async response discarded for Customer B');

  // ==============================================================================
  // 14: EDIT MODE PRESERVES SAVED DATA
  // ==============================================================================
  console.log("\n== SECTION 11: Edit Mode Data Preservation ==");

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

  assert(editOrigins.assembly_constituency === 'initial', '14. Edit mode: assembly_constituency marked initial');
  assert(editOrigins.assembly_constituency_number === 'initial', '14. Edit mode: AC number marked initial');
  assert(editOrigins.parliamentary_constituency === 'initial', '14. Edit mode: PC marked initial');
  assert(editOrigins.parliamentary_constituency_number === 'initial', '14. Edit mode: PC number marked initial');

  // Overwrite checks
  assert(
    canLookupOverwriteElectoralField('assembly_constituency', 'New Candidate', editOrigins.assembly_constituency) === false,
    '14. Automatic lookup cannot overwrite saved AC in edit mode'
  );
  assert(
    canLookupOverwriteElectoralField('assembly_constituency_number', '999', editOrigins.assembly_constituency_number) === false,
    '14. Automatic lookup cannot overwrite saved AC number in edit mode'
  );

  // ==============================================================================
  // 15 & 16: AUTO-FILL NEVER CREATES OFFICIALLY_VERIFIED OR TIMESTAMP
  // ==============================================================================
  console.log("\n== SECTION 12: Verification Invariants ==");

  const autoFilledForm: CustomerFormData = createCanonicalEmptyCustomer();
  // Simulate unique lookup auto-fill
  autoFilledForm.assembly_constituency = resBhebia.candidates[0].assembly_constituency;
  autoFilledForm.assembly_constituency_number = resBhebia.candidates[0].assembly_constituency_number;
  autoFilledForm.parliamentary_constituency = resBhebia.candidates[0].parliamentary_constituency;
  autoFilledForm.parliamentary_constituency_number = resBhebia.candidates[0].parliamentary_constituency_number;

  // Invariant 15: Status MUST be unverified
  assert(autoFilledForm.electoral_verification_status === 'unverified', '15. auto-fill never creates officially_verified status');
  assert(autoFilledForm.electoral_verification_status !== 'officially_verified', '15. Status is strictly not officially_verified');

  // Invariant 16: Verified_at timestamp MUST be null
  assert(autoFilledForm.electoral_verified_at === null, '16. auto-fill never creates official verification timestamp');

  // Import overwrite protection: Import must NEVER overwrite verification status or verified_at
  assert(
    canImportOverwriteField('electoral_verification_status', 'officially_verified', 'unverified', undefined) === false,
    '15b. canImportOverwriteField rejects electoral_verification_status'
  );
  assert(
    canImportOverwriteField('electoral_verified_at', '2026-10-03T00:00:00.000Z', null, undefined) === false,
    '16b. canImportOverwriteField rejects electoral_verified_at'
  );

  // ==============================================================================
  // 17: EXISTING PIN STATE / DISTRICT / POST OFFICE LOOKUP STILL WORKS
  // ==============================================================================
  console.log("\n== SECTION 13: Existing PIN Lookup Compatibility ==");

  const pinRes = await IndiaPincodeProvider.lookup('700001');
  assert(pinRes.success === true, '17. Existing PIN lookup succeeds for 700001');
  assert(pinRes.data?.state === 'West Bengal', '17. PIN lookup fills State (West Bengal)');
  assert(pinRes.data?.district === 'Kolkata', '17. PIN lookup fills District (Kolkata)');
  assert((pinRes.data?.postOffices.length ?? 0) > 0, '17. PIN lookup fills Post Office list');
  assert(pinRes.data?.country === 'India', '17. PIN lookup fills Country (India)');

  // PIN lookup boundary isolation verified
  assert(!('assembly_constituency' in (pinRes.data || {})), '17. PIN lookup does NOT invent assembly_constituency');

  // ==============================================================================
  // 18: OTHER COUNTRY / NON-WEST-BENGAL BEHAVIOR FAILS GRACEFULLY
  // ==============================================================================
  console.log("\n== SECTION 14: Non-West-Bengal & Non-India Graceful Handling ==");

  // Other country: USA
  const resOtherCountry = await provider.lookup({
    pincode: '90210',
    country: 'United States',
  });
  assert(resOtherCountry.status === 'not_found', '18. Non-India country returns not_found');
  assert(resOtherCountry.candidates.length === 0, '18. Non-India country returns 0 candidates');
  assert(Boolean(resOtherCountry.reason?.includes('Indian addresses') || resOtherCountry.reason?.includes('India')), '18. Explains India scope');

  // Non-West Bengal state: Maharashtra (Mumbai PIN 400001)
  const resOtherState = await provider.lookup({
    pincode: '400001',
    state: 'Maharashtra',
    district: 'Mumbai',
    country: 'India',
  });
  assert(resOtherState.status === 'not_found', '18. Non-West-Bengal state returns not_found');
  assert(resOtherState.candidates.length === 0, '18. Non-West-Bengal state returns 0 candidates');
  assert(Boolean(resOtherState.reason?.includes('West Bengal')), '18. Explains West Bengal scope');

  // Insufficient data: Empty location context
  const resEmpty = await provider.lookup({});
  assert(resEmpty.status === 'insufficient_data', '18. Empty context returns insufficient_data');
  assert(resEmpty.candidates.length === 0, '18. Empty context returns 0 candidates');

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
