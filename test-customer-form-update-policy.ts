/**
 * Test Suite: CustomerForm Update Policy & Asynchronous Lookup Protection
 * (Findings 2 and 3 Final Regression & Lifecycle Coverage)
 */

import {
  initializeFieldOrigins,
  canImportOverwriteField,
  canLookupOverwriteField,
  resolveAddressBatchImport,
  resolveAutoFillPayload,
  checkLookupFreshness,
  FieldOrigins,
  VALID_FORM_FIELDS,
} from './src/components/forms/customerFormUpdatePolicy';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failCount++;
  }
}

console.log('==========================================================================');
console.log('🧪 CUSTOMER FORM UPDATE POLICY & ASYNC LOOKUP TEST SUITE');
console.log('==========================================================================');

// --------------------------------------------------------------------------
// 1. Field Ownership Initialization & VALID_FORM_FIELDS
// --------------------------------------------------------------------------
console.log('\n--- 1. Field Ownership Initialization & VALID_FORM_FIELDS ---');

{
  assert(VALID_FORM_FIELDS.has('original_language_name'), 'VALID_FORM_FIELDS includes original_language_name');

  const defaults = {
    first_name: 'Rahul',
    last_name: 'Sharma',
    original_language_name: 'রাহুল শর্মা',
    phone: '9876543210',
    email: '',
    address: '123 MG Road',
    pincode: '700001',
    unrelated_junk: 'should_ignore',
  };

  const originsEdit = initializeFieldOrigins(defaults, true);
  assert(originsEdit.first_name === 'initial', 'Edit mode: populated first_name is initial');
  assert(originsEdit.last_name === 'initial', 'Edit mode: populated last_name is initial');
  assert(originsEdit.original_language_name === 'initial', 'Edit mode: original_language_name initialized to initial');
  assert(originsEdit.phone === 'initial', 'Edit mode: populated phone is initial');
  assert(originsEdit.email === undefined, 'Edit mode: empty string is not marked initial');
  assert(originsEdit.unrelated_junk === undefined, 'Non-form field is not in origins');

  const originsCreate = initializeFieldOrigins(defaults, false);
  assert(Object.keys(originsCreate).length === 0, 'Create mode: no fields originate from initial');
}

// --------------------------------------------------------------------------
// 2. Manual Values & Deliberate Clears Protection
// --------------------------------------------------------------------------
console.log('\n--- 2. Manual Values & Deliberate Clears Protection ---');

{
  const origins: FieldOrigins = {
    first_name: 'user',
    phone: 'user', // user deliberately cleared phone to ""
    whatsapp: 'user', // user deliberately cleared whatsapp to ""
    original_language_name: 'user',
  };
  const currentValues = {
    first_name: 'Custom Rahul',
    phone: '',
    whatsapp: '',
    original_language_name: 'রাহুল',
  };

  assert(
    canImportOverwriteField('first_name', 'Imported Rahul', currentValues.first_name, origins.first_name) === false,
    'Manual user entry in first_name is protected from import'
  );

  assert(
    canImportOverwriteField('phone', '9999999999', currentValues.phone, origins.phone) === false,
    'Deliberately cleared phone ("") with user origin is protected from import'
  );

  assert(
    canImportOverwriteField('whatsapp', '9999999999', currentValues.whatsapp, origins.whatsapp) === false,
    'Deliberately cleared whatsapp ("") with user origin is protected from import'
  );

  assert(
    canImportOverwriteField('original_language_name', 'নতুন নাম', currentValues.original_language_name, origins.original_language_name) === false,
    'Manual native name is protected from import overwrite'
  );
}

// --------------------------------------------------------------------------
// 3. Existing Non-Empty Phone Guard (Regardless of Origin)
// --------------------------------------------------------------------------
console.log('\n--- 3. Phone Protection Regardless of Origin ---');

{
  const currentValues = {
    phone: '9876543210',
  };

  assert(
    canImportOverwriteField('phone', '9111111111', currentValues.phone, 'import') === false,
    'Existing non-empty phone with import origin is protected from new import'
  );
  assert(
    canImportOverwriteField('phone', '9111111111', currentValues.phone, 'lookup') === false,
    'Existing non-empty phone with lookup origin is protected from new import'
  );
  assert(
    canImportOverwriteField('phone', '9111111111', currentValues.phone, undefined) === false,
    'Existing non-empty phone with undefined origin is protected from new import'
  );
  assert(
    canImportOverwriteField('phone', '9111111111', currentValues.phone, 'initial') === false,
    'Existing non-empty phone with initial origin is protected from new import'
  );
}

// --------------------------------------------------------------------------
// 4. Corrected Ownership Promotion
// --------------------------------------------------------------------------
console.log('\n--- 4. Corrected Ownership Promotion ---');

{
  // Scenario 4A: Matching PIN import with equal address values promotes lookup to import
  const origins: FieldOrigins = {
    state: 'lookup',
    district: 'lookup',
    country: 'lookup',
  };
  const currentValues: Record<string, unknown> = {
    pincode: '700001',
    state: 'West Bengal',
    district: 'Kolkata',
    country: 'India',
  };

  const incomingData = {
    pincode: '700001',
    state: 'West Bengal', // equal value
    district: 'Kolkata',   // equal value
  };

  const res = resolveAutoFillPayload(currentValues, incomingData, origins);
  assert(res.fieldOriginsToUpdate.state === 'import', 'Equal state value is promoted to import ownership');
  assert(res.fieldOriginsToUpdate.district === 'import', 'Equal district value is promoted to import ownership');

  origins.state = res.fieldOriginsToUpdate.state;
  origins.district = res.fieldOriginsToUpdate.district;

  const canLookupOverwriteState = canLookupOverwriteField('state', 'West Bengal (New)', origins.state, false);
  const canLookupOverwriteDistrict = canLookupOverwriteField('district', 'Kolkata North', origins.district, false);

  assert(canLookupOverwriteState === false, 'Subsequent lookup is rejected on state now owned by import');
  assert(canLookupOverwriteDistrict === false, 'Subsequent lookup is rejected on district now owned by import');

  // Scenario 4B (Missing-PIN Equal-Value Promotion):
  // Current PIN exists, state is lookup-owned, reviewed import has equal state but NO PIN
  const currentWithPin = {
    pincode: '700001',
    state: 'West Bengal',
    district: 'Kolkata',
    country: 'India',
  };
  const originsLookupOnly: FieldOrigins = {
    pincode: 'user',
    state: 'lookup',
  };
  const importMissingPinEqualState = {
    state: 'West Bengal', // equal value, no pincode provided
  };

  const resMissingPin = resolveAutoFillPayload(currentWithPin, importMissingPinEqualState, originsLookupOnly);
  assert(resMissingPin.fieldsToUpdate.pincode === undefined, 'Missing-PIN import preserves existing PIN');
  assert(resMissingPin.fieldsToUpdate.state === 'West Bengal', 'Missing-PIN equal state is accepted');
  assert(resMissingPin.fieldOriginsToUpdate.state === 'import', 'Missing-PIN equal state promoted to import ownership');

  originsLookupOnly.state = resMissingPin.fieldOriginsToUpdate.state;
  assert(
    canLookupOverwriteField('state', 'West Bengal (Altered)', originsLookupOnly.state, false) === false,
    'Subsequent lookup cannot overwrite state promoted via missing-PIN equal value'
  );
}

// --------------------------------------------------------------------------
// 5. Explicit WhatsApp Resolution & Derivation
// --------------------------------------------------------------------------
console.log('\n--- 5. Explicit WhatsApp Resolution & Derivation ---');

{
  // Scenario 5A: Distinct incoming phone and explicit WhatsApp numbers
  const currentValuesA = { phone: '', whatsapp: '' };
  const originsA: FieldOrigins = {};
  const importDataA = {
    phone: '9876543210',
    whatsapp: '9123456789', // Distinct explicit WhatsApp
  };

  const resA = resolveAutoFillPayload(currentValuesA, importDataA, originsA);
  assert(resA.fieldsToUpdate.phone === '9876543210', 'Phone is accepted');
  assert(resA.fieldsToUpdate.whatsapp === '9123456789', 'Explicit WhatsApp is accepted and NOT overwritten by phone derivation');
  assert(resA.fieldOriginsToUpdate.whatsapp === 'import', 'Explicit WhatsApp origin is import');
  assert(resA.shouldLinkWhatsapp === false, 'shouldLinkWhatsapp is false when explicit WhatsApp is accepted');

  // Scenario 5B: User deliberately cleared WhatsApp ("" with user origin)
  const currentValuesB = { phone: '', whatsapp: '' };
  const originsB: FieldOrigins = { whatsapp: 'user' }; // deliberately cleared
  const importDataB = { phone: '9876543210' }; // no whatsapp in doc

  const resB = resolveAutoFillPayload(currentValuesB, importDataB, originsB);
  assert(resB.fieldsToUpdate.phone === '9876543210', 'Phone is accepted');
  assert(resB.fieldsToUpdate.whatsapp === undefined, 'Deliberately cleared WhatsApp is NOT overwritten by phone derivation');
  assert(resB.shouldLinkWhatsapp === false, 'shouldLinkWhatsapp is false when user cleared WhatsApp');

  // Scenario 5C: Form has existing phone (protected), incoming phone rejected, form WhatsApp empty
  // WhatsApp should derive from retained existing phone, NOT from rejected incoming phone!
  const currentValuesC = { phone: '9000000001', whatsapp: '' };
  const originsC: FieldOrigins = { phone: 'import' }; // existing non-empty phone is protected
  const importDataC = { phone: '9999999999' }; // rejected incoming phone

  const resC = resolveAutoFillPayload(currentValuesC, importDataC, originsC);
  assert(resC.fieldsToUpdate.phone === undefined, 'Incoming phone is rejected');
  assert(resC.resolvedPrimaryPhone === '9000000001', 'Primary phone is retained existing phone');
  assert(resC.fieldsToUpdate.whatsapp === '9000000001', 'WhatsApp derives from retained existing phone, NOT rejected phone');
  assert(resC.shouldLinkWhatsapp === true, 'shouldLinkWhatsapp is true for retained phone');

  // Scenario 5D: User cleared phone (""), incoming phone rejected. WhatsApp must NOT derive from rejected phone!
  const currentValuesD = { phone: '', whatsapp: '' };
  const originsD: FieldOrigins = { phone: 'user' };
  const importDataD = { phone: '9888888888' };

  const resD = resolveAutoFillPayload(currentValuesD, importDataD, originsD);
  assert(resD.fieldsToUpdate.phone === undefined, 'Incoming phone rejected against user clear');
  assert(resD.resolvedPrimaryPhone === '', 'Primary phone remains empty');
  assert(resD.fieldsToUpdate.whatsapp === undefined, 'WhatsApp is not derived when phone is empty');
}

// --------------------------------------------------------------------------
// 6. Address Preflight & Cluster Protection
// --------------------------------------------------------------------------
console.log('\n--- 6. Address Preflight & Cluster Protection ---');

{
  // Scenario 6A: Missing incoming PIN with NO conflict -> fills unprotected blank fields, preserves current PIN
  const currentA = {
    pincode: '700001',
    address: '',
    state: 'West Bengal',
    district: '',
    country: 'India',
  };
  const originsA: FieldOrigins = {
    pincode: 'user',
    state: 'user',
  };
  const importA = {
    address: 'Flat 4B, Salt Lake',
    district: 'North 24 Parganas',
    first_name: 'Suman',
  };

  const resA = resolveAddressBatchImport(currentA, importA, originsA);
  assert(resA.acceptedAddressFields.pincode === undefined, 'Current PIN preserved when incoming PIN is missing');
  assert(resA.acceptedAddressFields.address === 'Flat 4B, Salt Lake', 'Unprotected blank address is filled');
  assert(resA.acceptedAddressFields.district === 'North 24 Parganas', 'Unprotected blank district is filled');
  assert(resA.skippedReason === null, 'No skip reason when missing PIN is compatible');

  // Scenario 6B: Missing incoming PIN with CONFLICTING protected state -> rejects address batch
  const currentB = {
    pincode: '700001',
    state: 'West Bengal',
  };
  const originsB: FieldOrigins = {
    state: 'user',
  };
  const importB = {
    state: 'Karnataka', // conflicts with protected West Bengal!
    city: 'Bengaluru',
    first_name: 'Pooja',
  };

  const resB = resolveAddressBatchImport(currentB, importB, originsB);
  assert(Object.keys(resB.acceptedAddressFields).length === 0, 'Address batch rejected on conflicting state even without incoming PIN');
  assert(resB.skippedReason !== null && resB.skippedReason.includes('conflicts with protected state'), 'Skip reason reports state conflict');

  const payloadB = resolveAutoFillPayload(currentB, importB, originsB);
  assert(payloadB.fieldsToUpdate.first_name === 'Pooja', 'Non-address first_name still applies');
  assert(payloadB.fieldsToUpdate.state === undefined, 'Conflicting state is not in payload');

  // Scenario 6C: Matching incoming PIN with CONFLICTING protected district -> rejects address batch
  const currentC = {
    pincode: '700001',
    state: 'West Bengal',
    district: 'Kolkata',
  };
  const originsC: FieldOrigins = {
    pincode: 'user',
    district: 'user', // user manually entered Kolkata
  };
  const importC = {
    pincode: '700001', // PIN matches!
    state: 'West Bengal',
    district: 'Howrah', // But district conflicts!
  };

  const resC = resolveAddressBatchImport(currentC, importC, originsC);
  assert(Object.keys(resC.acceptedAddressFields).length === 0, 'Matching PIN but conflicting district rejects entire address batch');
  assert(resC.skippedReason !== null && resC.skippedReason.includes('conflicts with protected district'), 'Skip reason reports district conflict');

  // Scenario 6D: Empty current PIN with protected address details -> new conflicting PIN offered
  const currentD = {
    pincode: '',
    state: 'Maharashtra',
    city: 'Mumbai',
    country: 'India',
  };
  const originsD: FieldOrigins = {
    state: 'user',
    city: 'user',
  };
  const importD = {
    pincode: '700001',
    state: 'West Bengal',
    city: 'Kolkata',
  };

  const resD = resolveAddressBatchImport(currentD, importD, originsD);
  assert(Object.keys(resD.acceptedAddressFields).length === 0, 'New PIN with conflicting address details rejected when current address is protected');
  assert(resD.skippedReason !== null, 'Skip reason present for protected address conflict');

  // Scenario 6E: Default country alone is NOT evidence of a populated address
  const currentE = {
    pincode: '',
    country: 'India',
  };
  const originsE: FieldOrigins = {};
  const importE = {
    pincode: '560001',
    state: 'Karnataka',
    city: 'Bengaluru',
  };
  const resE = resolveAddressBatchImport(currentE, importE, originsE);
  assert(resE.acceptedAddressFields.pincode === '560001', 'Default country alone does not block incoming address');
  assert(resE.acceptedAddressFields.state === 'Karnataka', 'State accepted when only default country existed');
}

// --------------------------------------------------------------------------
// 7. Lookup Lifecycle & Freshness Predicate Guarantees (PIN A → B → Return to A)
// --------------------------------------------------------------------------
console.log('\n--- 7. Lookup Lifecycle & Freshness Predicate Guarantees ---');

{
  let reqIdCounter = 0;

  // Step 1: User types PIN A ("700001")
  let currentPin = '700001';
  const reqIdA1 = ++reqIdCounter; // 1
  let activeReqId = reqIdA1;

  // Lookup A succeeds:
  assert(
    checkLookupFreshness(currentPin, '700001', reqIdA1, activeReqId) === true,
    'Req 1 for PIN A is fresh'
  );

  // Step 2: User changes to PIN B ("560001")
  currentPin = '560001';
  const reqIdB = ++reqIdCounter; // 2
  activeReqId = reqIdB;

  // Step 3a: While B is pending, user returns to PIN A ("700001")
  currentPin = '700001';
  const reqIdA2 = ++reqIdCounter; // 3
  activeReqId = reqIdA2;

  // Meaningful production guard 1: Stale B response while A is active is dropped
  assert(
    checkLookupFreshness(currentPin, '560001', reqIdB, activeReqId) === false,
    'Stale B response while A is active is dropped by freshness guard'
  );

  // Meaningful production guard 2: Old request ID from first A request (reqId 1) arriving after returning to A (activeReqId 3) is dropped
  assert(
    checkLookupFreshness(currentPin, '700001', reqIdA1, activeReqId) === false,
    'Old request ID after returning to the same PIN is dropped by freshness guard'
  );

  // Meaningful production guard 3: Current request ID (reqId 3) for returned A is accepted
  assert(
    checkLookupFreshness(currentPin, '700001', reqIdA2, activeReqId) === true,
    'Returned A request (reqId 3) is fresh and accepted'
  );

  // Step 3b: Suppose B had failed, user returns to A:
  currentPin = '560001';
  const reqIdBFail = ++reqIdCounter; // 4
  activeReqId = reqIdBFail;

  // User returns to PIN A:
  currentPin = '700001';
  const reqIdARestore = ++reqIdCounter; // 5
  activeReqId = reqIdARestore;

  assert(
    checkLookupFreshness(currentPin, '700001', reqIdARestore, activeReqId) === true,
    'PIN A restored after B failure is fresh and accepted'
  );

  // Meaningful production guard 4: Cleared live PIN with unchanged request ID is rejected
  assert(
    checkLookupFreshness('', '700001', 5, 5) === false,
    'Cleared live PIN with unchanged request ID is dropped'
  );

  // Meaningful production guard 5: Shortened live PIN (5 digits) with unchanged request ID is rejected
  assert(
    checkLookupFreshness('70000', '700001', 5, 5) === false,
    'Shortened live PIN with unchanged request ID is dropped'
  );

  // Meaningful production guard 6: Different live PIN with unchanged request ID is rejected
  assert(
    checkLookupFreshness('700002', '700001', 5, 5) === false,
    'Different live PIN with unchanged request ID is dropped'
  );
}

// --------------------------------------------------------------------------
// 8. Lookup Overwrite Permissions & Manual Mode Protection
// --------------------------------------------------------------------------
console.log('\n--- 8. Lookup Overwrite Permissions & Manual Mode Protection ---');

{
  // 'user' origin: cannot overwrite
  assert(canLookupOverwriteField('state', 'West Bengal', 'user', false) === false, 'Lookup cannot overwrite user-edited state');
  // 'initial' origin: cannot overwrite
  assert(canLookupOverwriteField('state', 'West Bengal', 'initial', false) === false, 'Lookup cannot overwrite initial customer state');
  // 'import' origin: cannot overwrite
  assert(canLookupOverwriteField('state', 'West Bengal', 'import', false) === false, 'Lookup cannot overwrite reviewed import state');
  // 'lookup' origin: CAN overwrite
  assert(canLookupOverwriteField('state', 'West Bengal', 'lookup', false) === true, 'Lookup can overwrite previous lookup state');
  // undefined origin: CAN overwrite
  assert(canLookupOverwriteField('state', 'West Bengal', undefined, false) === true, 'Lookup can overwrite untouched default state');
  // Manual address edit mode active: CANNOT overwrite even if lookup origin
  assert(canLookupOverwriteField('state', 'West Bengal', 'lookup', true) === false, 'Lookup cannot overwrite when manual address edit is active');
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
console.log('\n==========================================================================');
console.log(`📊 TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('==========================================================================');

if (failCount > 0) {
  process.exit(1);
}
