/**
 * Test Suite: CustomerForm Field Completeness Regression
 *
 * PURPOSE:
 *   Guard against future UX simplification passes that inadvertently remove,
 *   hide, or omit historically-supported fields from the CustomerForm.
 *
 * FIELD INVENTORY (git-verified across df6c0f9 to d163952):
 *   - Structured name: first_name, middle_name, last_name
 *   - Native/Bengali name: original_language_name (the ONLY native-language
 *     field in the DB schema; father_name/mother_name/spouse_name are English)
 *   - Family: father_name, mother_name, marital_status, spouse_name
 *   - Contact: phone, whatsapp, email
 *   - Personal: date_of_birth, gender
 *   - Identity/Tax: aadhaar_number, pan_number, gst_number, voter_id_number
 *   - Address: address, pincode, state, district, city, post_office, country
 *   - System: customer_code, status, photo_source, photo_url
 *
 * RUN: npx tsx test-customer-form-completeness.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  VALID_FORM_FIELDS,
  canImportOverwriteField,
} from './src/components/forms/customerFormUpdatePolicy';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  if (condition) {
    console.log(`\u2705 [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`\u274c [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failCount++;
  }
}

console.log('==========================================================================');
console.log('\U0001f9ea CUSTOMER FORM FIELD COMPLETENESS REGRESSION TEST SUITE');
console.log('==========================================================================');

// ---------------------------------------------------------------------------
// 1. VALID_FORM_FIELDS completeness
// ---------------------------------------------------------------------------
console.log('\n--- 1. VALID_FORM_FIELDS completeness (customerFormUpdatePolicy) ---');

const REQUIRED_POLICY_FIELDS: string[] = [
  'first_name', 'middle_name', 'last_name',
  'original_language_name', // THE ONLY native-language field
  'father_name', 'mother_name', 'marital_status', 'spouse_name',
  'phone', 'whatsapp', 'email',
  'date_of_birth', 'gender',
  'aadhaar_number', 'pan_number', 'gst_number', 'voter_id_number',
  'address', 'pincode', 'state', 'district', 'city', 'post_office', 'country',
  'photo_source', 'photo_url',
  'customer_code', 'status',
];

for (const field of REQUIRED_POLICY_FIELDS) {
  assert(
    VALID_FORM_FIELDS.has(field),
    `VALID_FORM_FIELDS includes: ${field}`
  );
}

// ---------------------------------------------------------------------------
// 2. CustomerForm JSX register() binding completeness
// ---------------------------------------------------------------------------
console.log('\n--- 2. CustomerForm JSX register() bindings ---');

const formPath = path.resolve(__dirname, 'src/components/forms/CustomerForm.tsx');
assert(fs.existsSync(formPath), 'CustomerForm.tsx exists at expected path');
const formSource = fs.existsSync(formPath) ? fs.readFileSync(formPath, 'utf-8') : '';

const REQUIRED_JSX_FIELDS: string[] = [
  'first_name', 'middle_name', 'last_name',
  'original_language_name', // REGRESSION FIELD — added in d163952
  'father_name', 'mother_name', 'marital_status', 'spouse_name',
  'phone', 'whatsapp', 'email',
  'date_of_birth', 'gender',
  'aadhaar_number', 'pan_number', 'gst_number', 'voter_id_number',
  'address', 'pincode', 'state', 'district', 'city', 'post_office',
  'customer_code', 'status',
];

for (const field of REQUIRED_JSX_FIELDS) {
  assert(
    formSource.includes(`register("${field}")`),
    `CustomerForm JSX has register("${field}")`
  );
}

// ---------------------------------------------------------------------------
// 3. original_language_name primary regression guard
// ---------------------------------------------------------------------------
console.log('\n--- 3. original_language_name regression guard ---');

const nativeIdx = formSource.indexOf('register("original_language_name")');
assert(nativeIdx !== -1, 'original_language_name: register() binding exists in JSX');

if (nativeIdx !== -1) {
  const ctx = formSource.slice(Math.max(0, nativeIdx - 300), nativeIdx + 300);
  assert(!ctx.includes('type="hidden"'), 'original_language_name: input is NOT type="hidden"');
  assert(
    ctx.includes('<input') || ctx.includes('<textarea'),
    'original_language_name: surrounded by an <input> or <textarea> element'
  );
}

// ---------------------------------------------------------------------------
// 4. onSubmit cleanedData handler field references
// ---------------------------------------------------------------------------
console.log('\n--- 4. onSubmit cleanedData handler references ---');

const SUBMIT_FIELDS: string[] = [
  'original_language_name', 'first_name', 'last_name', 'phone', 'address',
  'status', 'aadhaar_number', 'pan_number', 'voter_id_number', 'gst_number',
  'father_name', 'mother_name', 'spouse_name', 'marital_status',
];
for (const field of SUBMIT_FIELDS) {
  assert(formSource.includes(field), `onSubmit handler references: ${field}`);
}

// ---------------------------------------------------------------------------
// 5. Native-language field inventory + domain-protection policy verification
// ---------------------------------------------------------------------------
console.log('\n--- 5. Native-language field inventory & domain protection ---');

// original_language_name must be protected (cannot overwrite when field has a value)
const canOverwriteEmpty = canImportOverwriteField(
  'original_language_name', 'রাহুল শর্মা', '', undefined
);
assert(canOverwriteEmpty === true, 'original_language_name: import CAN overwrite when empty/unowned');

const canOverwritePopulated = canImportOverwriteField(
  'original_language_name', 'রাহুল শর্মা', 'অন্য নাম', undefined
);
assert(canOverwritePopulated === false, 'original_language_name: import CANNOT overwrite when field has value (domain protection)');

// Confirm no spurious Bengali-variant fields exist in the policy
assert(!VALID_FORM_FIELDS.has('bengali_father_name'), 'No bengali_father_name in schema (confirmed)');
assert(!VALID_FORM_FIELDS.has('bengali_mother_name'), 'No bengali_mother_name in schema (confirmed)');
assert(!VALID_FORM_FIELDS.has('bengali_spouse_name'), 'No bengali_spouse_name in schema (confirmed)');
assert(!VALID_FORM_FIELDS.has('bengali_address'), 'No bengali_address in schema (confirmed)');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n==========================================================================');
const total = passCount + failCount;
console.log(`\U0001f9ea RESULT: ${passCount}/${total} tests passed, ${failCount} failed`);
console.log('==========================================================================');

if (failCount > 0) {
  console.error('\n\u26d4 REGRESSION DETECTED — CustomerForm field completeness check FAILED');
  process.exit(1);
} else {
  console.log('\n\u2705 All customer form completeness checks PASSED');
}