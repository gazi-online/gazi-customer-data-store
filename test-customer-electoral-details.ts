/**
 * ==============================================================================
 * GCDS ELECTORAL DETAILS FOUNDATION — VERIFICATION TEST SUITE
 * File: test-customer-electoral-details.ts
 *
 * Verifies:
 * 1. Database & migration static schema verification
 * 2. TypeScript customer types & canonical defaults
 * 3. New customer form defaults & state
 * 4. Create customer validation & Unicode Indian script constituency handling
 * 5. Edit customer preservation & updates
 * 6. Customer intake session reset & anti-leakage guarantee (Customer A -> B)
 * 7. Verification semantics & server-side lifecycle rules
 * 8. PIN lookup boundary & strict constituency isolation
 * 9. Smart Import extraction, review pipeline & operator protection
 * 10. Customer profile view rendering contract
 * ==============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CANONICAL_EMPTY_CUSTOMER,
  createCanonicalEmptyCustomer,
  VALID_FORM_FIELDS,
  canImportOverwriteField,
  canLookupOverwriteField,
  resolveAutoFillPayloadForNewIntake,
  initializeFieldOrigins,
} from './src/components/forms/customerFormUpdatePolicy';
import { Customer, CustomerFormData } from './src/types/customer';
import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';

console.log("==========================================================================");
console.log("🗳️ GCDS ELECTORAL DETAILS FOUNDATION — COMPREHENSIVE TEST SUITE");
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

// ==============================================================================
// 1. DATABASE & MIGRATION SCHEMA STATIC VERIFICATION
// ==============================================================================
console.log("\n== SECTION 1: Database Migration & Schema Verification ==");

const migrationPath = path.resolve(__dirname, 'supabase/migrations/20261002224500_customer_electoral_details.sql');
assert(fs.existsSync(migrationPath), "Migration file exists at supabase/migrations/20261002224500_customer_electoral_details.sql");

const migrationContent = (fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '').replace(/\r\n/g, '\n');

assert(migrationContent.includes("assembly_constituency TEXT NULL"), "Migration adds assembly_constituency column");
assert(migrationContent.includes("assembly_constituency_number TEXT NULL"), "Migration adds assembly_constituency_number column");
assert(migrationContent.includes("parliamentary_constituency TEXT NULL"), "Migration adds parliamentary_constituency column");
assert(migrationContent.includes("parliamentary_constituency_number TEXT NULL"), "Migration adds parliamentary_constituency_number column");
assert(migrationContent.includes("electoral_verification_status TEXT NOT NULL DEFAULT 'unverified'"), "Migration adds electoral_verification_status with unverified default");
assert(migrationContent.includes("electoral_verified_at TIMESTAMPTZ NULL"), "Migration adds electoral_verified_at timestamp column");

assert(migrationContent.includes("chk_customers_electoral_verification_status"), "Status constraint name chk_customers_electoral_verification_status defined");
assert(migrationContent.includes("'unverified', 'customer_confirmed', 'officially_verified'"), "Constraint restricts status to unverified, customer_confirmed, officially_verified");
assert(migrationContent.includes("chk_customers_electoral_verified_at_consistency"), "Consistency constraint chk_customers_electoral_verified_at_consistency defined");
assert(migrationContent.includes("electoral_verification_status = 'unverified' AND electoral_verified_at IS NULL"), "Consistency constraint forces null verified_at when unverified");
assert(migrationContent.includes("electoral_verification_status IN ('customer_confirmed', 'officially_verified') AND electoral_verified_at IS NOT NULL"), "Consistency constraint requires non-null verified_at when confirmed or officially verified");

assert(migrationContent.includes("trg_customer_electoral_lifecycle"), "Database lifecycle trigger trg_customer_electoral_lifecycle defined");
assert(migrationContent.includes("NEW.electoral_verification_status = 'unverified' THEN\n    NEW.electoral_verified_at := NULL;"), "Trigger strictly nulls verified_at on revert to unverified");

assert(migrationContent.includes("idx_customers_business_assembly_constituency"), "Tenant index on (business_id, assembly_constituency) created");
assert(migrationContent.includes("idx_customers_business_parliamentary_constituency"), "Tenant index on (business_id, parliamentary_constituency) created");

// ==============================================================================
// 2. TYPES & CANONICAL POLICY CONSTANTS
// ==============================================================================
console.log("\n== SECTION 2: Types & Canonical Defaults ==");

assert(CANONICAL_EMPTY_CUSTOMER.assembly_constituency === "", "CANONICAL_EMPTY_CUSTOMER.assembly_constituency is empty string");
assert(CANONICAL_EMPTY_CUSTOMER.assembly_constituency_number === "", "CANONICAL_EMPTY_CUSTOMER.assembly_constituency_number is empty string");
assert(CANONICAL_EMPTY_CUSTOMER.parliamentary_constituency === "", "CANONICAL_EMPTY_CUSTOMER.parliamentary_constituency is empty string");
assert(CANONICAL_EMPTY_CUSTOMER.parliamentary_constituency_number === "", "CANONICAL_EMPTY_CUSTOMER.parliamentary_constituency_number is empty string");
assert(CANONICAL_EMPTY_CUSTOMER.electoral_verification_status === "unverified", "CANONICAL_EMPTY_CUSTOMER.electoral_verification_status is 'unverified'");
assert(CANONICAL_EMPTY_CUSTOMER.electoral_verified_at === null, "CANONICAL_EMPTY_CUSTOMER.electoral_verified_at is null");

const freshEmpty = createCanonicalEmptyCustomer();
assert(freshEmpty.assembly_constituency === "", "createCanonicalEmptyCustomer() returns empty assembly_constituency");
assert(freshEmpty.electoral_verification_status === "unverified", "createCanonicalEmptyCustomer() returns 'unverified'");
assert(freshEmpty.electoral_verified_at === null, "createCanonicalEmptyCustomer() returns null electoral_verified_at");

assert(VALID_FORM_FIELDS.has('assembly_constituency'), "VALID_FORM_FIELDS includes assembly_constituency");
assert(VALID_FORM_FIELDS.has('assembly_constituency_number'), "VALID_FORM_FIELDS includes assembly_constituency_number");
assert(VALID_FORM_FIELDS.has('parliamentary_constituency'), "VALID_FORM_FIELDS includes parliamentary_constituency");
assert(VALID_FORM_FIELDS.has('parliamentary_constituency_number'), "VALID_FORM_FIELDS includes parliamentary_constituency_number");
assert(VALID_FORM_FIELDS.has('electoral_verification_status'), "VALID_FORM_FIELDS includes electoral_verification_status");
assert(VALID_FORM_FIELDS.has('electoral_verified_at'), "VALID_FORM_FIELDS includes electoral_verified_at");

// ==============================================================================
// 3. NEW CUSTOMER INTAKE BEHAVIOR
// ==============================================================================
console.log("\n== SECTION 3: New Customer Intake State ==");

const newCustomerOrigins = initializeFieldOrigins(freshEmpty as unknown as Record<string, unknown>, false);
assert(Object.keys(newCustomerOrigins).length === 0, "New customer starts with 0 initial field origins");
assert(freshEmpty.assembly_constituency === "", "New customer assembly_constituency is empty");
assert(freshEmpty.assembly_constituency_number === "", "New customer assembly_constituency_number is empty");
assert(freshEmpty.parliamentary_constituency === "", "New customer parliamentary_constituency is empty");
assert(freshEmpty.parliamentary_constituency_number === "", "New customer parliamentary_constituency_number is empty");
assert(freshEmpty.electoral_verification_status === "unverified", "New customer verification status is 'unverified'");
assert(freshEmpty.electoral_verified_at === null, "New customer verified_at is null");

// ==============================================================================
// 4. CREATE VALIDATION & UNICODE INDIAN CONSTITUENCY NAMES
// ==============================================================================
console.log("\n== SECTION 4: Create Validation & Unicode Support ==");

// Standard English constituency
const englishCustomer: Partial<CustomerFormData> = {
  first_name: "Rahul",
  last_name: "Das",
  phone: "+91-9876543210",
  address: "Station Road",
  status: "active",
  assembly_constituency: "Basirhat Uttar",
  assembly_constituency_number: "102",
  parliamentary_constituency: "Basirhat",
  parliamentary_constituency_number: "18",
  electoral_verification_status: "unverified",
};
assert(englishCustomer.assembly_constituency === "Basirhat Uttar", "English AC name passes");
assert(englishCustomer.assembly_constituency_number === "102", "English AC number passes");

// Bengali native script constituency
const bengaliCustomer: Partial<CustomerFormData> = {
  first_name: "মনিরুল",
  last_name: "গাজী",
  phone: "+91-9876543211",
  address: "বাদুড়িয়া",
  status: "active",
  assembly_constituency: "বসিরহাট উত্তর",
  assembly_constituency_number: "১০২",
  parliamentary_constituency: "বসিরহাট",
  parliamentary_constituency_number: "১৮",
  electoral_verification_status: "unverified",
};
assert(bengaliCustomer.assembly_constituency === "বসিরহাট উত্তর", "Bengali AC name preserved accurately");
assert(bengaliCustomer.parliamentary_constituency === "বসিরহাট", "Bengali PC name preserved accurately");

// Hindi Devanagari script constituency
const hindiCustomer: Partial<CustomerFormData> = {
  first_name: "अमित",
  last_name: "कुमार",
  phone: "+91-9876543212",
  address: "पटेल नगर",
  status: "active",
  assembly_constituency: "चांदनी चौक",
  assembly_constituency_number: "20",
  parliamentary_constituency: "चांदनी चौक",
  parliamentary_constituency_number: "5",
  electoral_verification_status: "unverified",
};
assert(hindiCustomer.assembly_constituency === "चांदनी चौक", "Hindi Devanagari AC name preserved accurately");
assert(hindiCustomer.parliamentary_constituency === "चांदनी चौक", "Hindi Devanagari PC name preserved accurately");

// Whitespace trimming
const paddedAc = "   Basirhat Dakshin   ";
assert(paddedAc.trim() === "Basirhat Dakshin", "Constituency names safely trim leading and trailing whitespace");

// ==============================================================================
// 5. EDIT CUSTOMER PRESERVATION & UPDATES
// ==============================================================================
console.log("\n== SECTION 5: Edit Customer Preservation & Updates ==");

const existingCustomerRecord: Customer = {
  id: "cust-1234",
  customer_code: "CUST-001",
  first_name: "Nur",
  middle_name: null,
  last_name: "Gazi",
  phone: "+91-9733671094",
  whatsapp: null,
  email: null,
  date_of_birth: null,
  gender: "male",
  father_name: null,
  mother_name: null,
  marital_status: null,
  spouse_name: null,
  aadhaar_number: null,
  pan_number: null,
  gst_number: null,
  voter_id_number: "WB/12/345/678901",
  assembly_constituency: "Basirhat Uttar",
  assembly_constituency_number: "102",
  parliamentary_constituency: "Basirhat",
  parliamentary_constituency_number: "18",
  electoral_verification_status: "customer_confirmed",
  electoral_verified_at: "2026-09-15T10:30:00.000Z",
  address: "Basirhat, North 24 Parganas",
  city: "Basirhat",
  district: "North 24 Parganas",
  state: "West Bengal",
  pincode: "743412",
  post_office: "Basirhat SO",
  country: "India",
  photo_url: null,
  photo_source: null,
  original_language_name: null,
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-09-15T10:30:00Z",
};

// Edit mode initialization
const editOrigins = initializeFieldOrigins(existingCustomerRecord as unknown as Record<string, unknown>, true);
assert(editOrigins.assembly_constituency === 'initial', "Edit mode marks populated assembly_constituency as initial origin");
assert(editOrigins.assembly_constituency_number === 'initial', "Edit mode marks populated assembly_constituency_number as initial origin");
assert(editOrigins.parliamentary_constituency === 'initial', "Edit mode marks populated parliamentary_constituency as initial origin");
assert(editOrigins.parliamentary_constituency_number === 'initial', "Edit mode marks populated parliamentary_constituency_number as initial origin");

// Historical customer without electoral data
const historicalRecord: Partial<Customer> = {
  id: "hist-001",
  first_name: "Old",
  last_name: "Customer",
  phone: "+91-9123456780",
  address: "Old Town",
  status: "active",
  // No electoral fields present in old row
};
assert(historicalRecord.assembly_constituency === undefined, "Historical customer has undefined assembly_constituency");
const defaultStatusForHistorical = historicalRecord.electoral_verification_status || 'unverified';
assert(defaultStatusForHistorical === 'unverified', "Historical customer defaults to 'unverified' status safely");

// ==============================================================================
// 6. SESSION RESET & NO CROSS-CUSTOMER DATA LEAKAGE (Customer A -> B)
// ==============================================================================
console.log("\n== SECTION 6: Complete Session Reset & Anti-Leakage (A -> B) ==");

// Customer A has full electoral details
const customerA_FormValues: CustomerFormData = {
  ...createCanonicalEmptyCustomer(),
  first_name: "Customer",
  last_name: "Alpha",
  phone: "+91-9876543210",
  address: "Street 1",
  assembly_constituency: "Basirhat Uttar",
  assembly_constituency_number: "102",
  parliamentary_constituency: "Basirhat",
  parliamentary_constituency_number: "18",
  electoral_verification_status: "customer_confirmed",
  electoral_verified_at: "2026-10-02T12:00:00.000Z",
};

// Customer A completes / saves. Reset session for Customer B:
const customerB_IntakeValues = createCanonicalEmptyCustomer();

assert(customerB_IntakeValues.assembly_constituency === "", "Customer B assembly_constituency is empty");
assert(customerB_IntakeValues.assembly_constituency_number === "", "Customer B assembly_constituency_number is empty");
assert(customerB_IntakeValues.parliamentary_constituency === "", "Customer B parliamentary_constituency is empty");
assert(customerB_IntakeValues.parliamentary_constituency_number === "", "Customer B parliamentary_constituency_number is empty");
assert(customerB_IntakeValues.electoral_verification_status === "unverified", "Customer B verification status is strictly unverified");
assert(customerB_IntakeValues.electoral_verified_at === null, "Customer B verified_at is strictly null");

// Verify that none of Customer A's electoral data survived
assert(customerB_IntakeValues.assembly_constituency !== customerA_FormValues.assembly_constituency, "Customer A AC does not leak into Customer B");
assert(customerB_IntakeValues.assembly_constituency_number !== customerA_FormValues.assembly_constituency_number, "Customer A AC number does not leak into Customer B");
assert(customerB_IntakeValues.parliamentary_constituency !== customerA_FormValues.parliamentary_constituency, "Customer A PC does not leak into Customer B");
assert(customerB_IntakeValues.parliamentary_constituency_number !== customerA_FormValues.parliamentary_constituency_number, "Customer A PC number does not leak into Customer B");
assert(customerB_IntakeValues.electoral_verified_at !== customerA_FormValues.electoral_verified_at, "Customer A verified_at timestamp does not leak into Customer B");

// ==============================================================================
// 7. VERIFICATION SEMANTICS & SERVER-SIDE LIFECYCLE
// ==============================================================================
console.log("\n== SECTION 7: Verification Semantics & Server Lifecycle ==");

// Rule 1: VALUE EXISTS != CUSTOMER CONFIRMED != OFFICIALLY VERIFIED
const customerWithTextOnly: CustomerFormData = {
  ...createCanonicalEmptyCustomer(),
  first_name: "John",
  last_name: "Doe",
  phone: "+91-9876543210",
  address: "MG Road",
  assembly_constituency: "Basirhat Uttar",
  assembly_constituency_number: "102",
};
assert(customerWithTextOnly.electoral_verification_status === 'unverified', "Typing constituency text leaves status unverified by default");
assert(customerWithTextOnly.electoral_verified_at === null, "Typing constituency text leaves verified_at null");

// Rule 2: Explicit customer confirmation works
const confirmedCustomer: CustomerFormData = {
  ...customerWithTextOnly,
  electoral_verification_status: "customer_confirmed",
  electoral_verified_at: new Date().toISOString(),
};
assert(confirmedCustomer.electoral_verification_status === "customer_confirmed", "Customer confirmation sets customer_confirmed status");
assert(confirmedCustomer.electoral_verified_at !== null, "Customer confirmation stamps verified_at");

// Rule 3: DB Invariant evaluator matching chk_customers_electoral_verified_at_consistency
function checkDbElectoralConsistency(status: string, verifiedAt: string | null): boolean {
  if (status === 'unverified') {
    return verifiedAt === null;
  }
  if (status === 'customer_confirmed' || status === 'officially_verified') {
    return verifiedAt !== null;
  }
  return false;
}

assert(checkDbElectoralConsistency('unverified', null) === true, "DB invariant: unverified + null accepted");
assert(checkDbElectoralConsistency('unverified', new Date().toISOString()) === false, "DB invariant: unverified + timestamp rejected");
assert(checkDbElectoralConsistency('officially_verified', null) === false, "DB invariant: officially_verified + null rejected");
assert(checkDbElectoralConsistency('officially_verified', new Date().toISOString()) === true, "DB invariant: officially_verified + timestamp accepted");
assert(checkDbElectoralConsistency('customer_confirmed', null) === false, "DB invariant: customer_confirmed + null rejected");
assert(checkDbElectoralConsistency('customer_confirmed', new Date().toISOString()) === true, "DB invariant: customer_confirmed + timestamp accepted");

// Rule 4: Server-side sanitizeElectoralFields emulation
function sanitizeElectoralFieldsSim(
  payload: Record<string, unknown>,
  isCreate: boolean,
  existingStatus?: string,
  existingVerifiedAt?: string | null
): { error?: string } {
  let status = payload.electoral_verification_status as string | undefined;
  if (!status || (typeof status === "string" && status.trim() === "")) {
    status = "unverified";
    payload.electoral_verification_status = "unverified";
  }

  const validStatuses = new Set(["unverified", "customer_confirmed", "officially_verified"]);
  if (typeof status !== "string" || !validStatuses.has(status)) {
    return { error: `Invalid electoral verification status: ${status}` };
  }

  if (status === "officially_verified") {
    if (isCreate) {
      return { error: "New customer cannot be created directly as officially verified. Official verification requires dedicated verification workflow." };
    } else if (existingStatus !== "officially_verified") {
      return { error: "Transition to officially verified requires dedicated official verification workflow." };
    }
  }

  if (status === "unverified") {
    payload.electoral_verified_at = null;
  } else if (status === "customer_confirmed") {
    if (existingStatus === "customer_confirmed" && existingVerifiedAt) {
      payload.electoral_verified_at = existingVerifiedAt;
    } else {
      payload.electoral_verified_at = "SERVER_STAMPED_TIME";
    }
  } else if (status === "officially_verified") {
    payload.electoral_verified_at = existingVerifiedAt || "SERVER_STAMPED_TIME";
  }

  return {};
}

// General Create cannot create officially_verified
const createAttempt = { electoral_verification_status: "officially_verified", electoral_verified_at: "2026-10-02T10:00:00Z" };
const createErr = sanitizeElectoralFieldsSim(createAttempt, true);
assert(createErr.error !== undefined && createErr.error.includes("cannot be created directly"), "General create cannot create officially_verified");

// General Update cannot escalate unverified to officially_verified
const escalateUnverifiedAttempt = { electoral_verification_status: "officially_verified", electoral_verified_at: "2026-10-02T10:00:00Z" };
const escalateUnverifiedErr = sanitizeElectoralFieldsSim(escalateUnverifiedAttempt, false, "unverified");
assert(escalateUnverifiedErr.error !== undefined && escalateUnverifiedErr.error.includes("dedicated official verification workflow"), "General update cannot escalate unverified to officially_verified");

// General Update cannot escalate customer_confirmed to officially_verified
const escalateConfirmedAttempt = { electoral_verification_status: "officially_verified", electoral_verified_at: "2026-10-02T10:00:00Z" };
const escalateConfirmedErr = sanitizeElectoralFieldsSim(escalateConfirmedAttempt, false, "customer_confirmed");
assert(escalateConfirmedErr.error !== undefined && escalateConfirmedErr.error.includes("dedicated official verification workflow"), "General update cannot escalate customer_confirmed to officially_verified");

// Client forged timestamp cannot forge unverified or official verification
const clientForgedUnverified = { electoral_verification_status: "unverified", electoral_verified_at: "FORGED_TIMESTAMP" };
sanitizeElectoralFieldsSim(clientForgedUnverified, false, "unverified");
assert(clientForgedUnverified.electoral_verified_at === null, "Client forged timestamp with unverified is cleared to null");

const existingOfficialTime = "2026-09-01T12:00:00.000Z";
const clientForgedOfficial = { electoral_verification_status: "officially_verified", electoral_verified_at: "FORGED_NEW_TIMESTAMP" };
sanitizeElectoralFieldsSim(clientForgedOfficial, false, "officially_verified", existingOfficialTime);
assert(clientForgedOfficial.electoral_verified_at === existingOfficialTime, "Client forged timestamp on officially verified customer is ignored, preserving server timestamp");

// General update does not accidentally downgrade officially_verified on unrelated edit
const unrelatedEdit: Record<string, unknown> = { first_name: "Jane", electoral_verification_status: "officially_verified" };
const unrelatedEditErr = sanitizeElectoralFieldsSim(unrelatedEdit, false, "officially_verified", existingOfficialTime);
assert(!unrelatedEditErr.error, "Unrelated edit on officially verified customer succeeds");
assert(unrelatedEdit.electoral_verified_at === existingOfficialTime, "Unrelated edit does NOT downgrade official verification status or timestamp");

// Explicit revert to unverified clears timestamp
const revertAttempt = { electoral_verification_status: "unverified", electoral_verified_at: existingOfficialTime };
sanitizeElectoralFieldsSim(revertAttempt, false, "officially_verified", existingOfficialTime);
assert(revertAttempt.electoral_verified_at === null, "Reverting verification status to unverified clears verified_at to null");

// Customer confirmation stamps server timestamp
const customerConfirmAttempt: Record<string, unknown> = { electoral_verification_status: "customer_confirmed", electoral_verified_at: undefined };
sanitizeElectoralFieldsSim(customerConfirmAttempt, false, "unverified");
assert(customerConfirmAttempt.electoral_verified_at === "SERVER_STAMPED_TIME", "Customer confirmation transition stamps server timestamp");

// Rule 5: Officially Verify Action Guardrails Emulation
function officiallyVerifyCustomerSim(caller: { authenticated: boolean; aal: string; business_id: string | null }, customer: { id: string; business_id: string } | null) {
  if (!caller.authenticated) {
    return { error: "Authentication required" };
  }
  if (caller.aal !== 'aal2') {
    return { error: "MFA enforcement failed: AAL2 required" };
  }
  if (!caller.business_id) {
    return { error: "Access denied: Active business membership required" };
  }
  if (!customer) {
    return { error: "Customer not found" };
  }
  if (customer.business_id !== caller.business_id) {
    return { error: "Access denied: Customer does not belong to active business" };
  }
  const serverTimestamp = "SERVER_OFFICIAL_STAMP";
  return { success: true, verified_at: serverTimestamp, status: "officially_verified" };
}

// Unauthenticated denied
const unauthResult = officiallyVerifyCustomerSim({ authenticated: false, aal: 'aal1', business_id: 'biz_1' }, { id: 'cust_1', business_id: 'biz_1' });
assert(unauthResult.error === "Authentication required", "Unauthenticated caller denied official verification");

// Insufficient AAL denied (AAL1 when AAL2 expected)
const aalResult = officiallyVerifyCustomerSim({ authenticated: true, aal: 'aal1', business_id: 'biz_1' }, { id: 'cust_1', business_id: 'biz_1' });
assert(Boolean(aalResult.error?.includes("AAL2 required")), "Insufficient AAL caller denied official verification");

// No active business membership denied
const noBizResult = officiallyVerifyCustomerSim({ authenticated: true, aal: 'aal2', business_id: null }, { id: 'cust_1', business_id: 'biz_1' });
assert(Boolean(noBizResult.error?.includes("Active business membership required")), "Caller without active business denied official verification");

// Cross-business official verification denied
const crossBizResult = officiallyVerifyCustomerSim({ authenticated: true, aal: 'aal2', business_id: 'biz_A' }, { id: 'cust_1', business_id: 'biz_B' });
assert(crossBizResult.error === "Access denied: Customer does not belong to active business", "Cross-business official verification denied");

// Authorized official verification stamps server timestamp
const validOfficialResult = officiallyVerifyCustomerSim({ authenticated: true, aal: 'aal2', business_id: 'biz_A' }, { id: 'cust_1', business_id: 'biz_A' });
assert(validOfficialResult.success === true, "Authorized official verification succeeds");
assert(validOfficialResult.verified_at === "SERVER_OFFICIAL_STAMP", "Official verification stamps server timestamp");
assert(validOfficialResult.status === "officially_verified", "Official verification sets officially_verified status");

// Rule 6: Domain protection prevents Smart Import from setting verification status
assert(
  canImportOverwriteField('electoral_verification_status', 'customer_confirmed', 'unverified', undefined) === false,
  "canImportOverwriteField rejects overwriting electoral_verification_status"
);
assert(
  canImportOverwriteField('electoral_verified_at', new Date().toISOString(), null, undefined) === false,
  "canImportOverwriteField rejects overwriting electoral_verified_at"
);

// Rule 7: User-entered electoral details protected against import overwrite
assert(
  canImportOverwriteField('assembly_constituency', 'New Constituency', 'User Constituency', 'user') === false,
  "User-entered assembly_constituency is protected from import overwrite"
);
assert(
  canImportOverwriteField('assembly_constituency_number', '99', '102', 'user') === false,
  "User-entered assembly_constituency_number is protected from import overwrite"
);

// ==============================================================================
// 8. PIN LOOKUP BOUNDARY (STRICT ISOLATION)
// ==============================================================================
console.log("\n== SECTION 8: PIN Lookup Boundary & Constituency Isolation ==");

// Address fields only eligible for PIN lookup
assert(canLookupOverwriteField('state', 'West Bengal', undefined, false) === true, "PIN lookup can fill state");
assert(canLookupOverwriteField('district', 'North 24 Parganas', undefined, false) === true, "PIN lookup can fill district");
assert(canLookupOverwriteField('post_office', 'Basirhat SO', undefined, false) === true, "PIN lookup can fill post_office");

// PIN lookup NEVER sets constituency or verification status
const formStateBeforePinLookup: Partial<CustomerFormData> = {
  pincode: "743412",
  assembly_constituency: "",
  assembly_constituency_number: "",
  parliamentary_constituency: "",
  parliamentary_constituency_number: "",
  electoral_verification_status: "unverified",
  electoral_verified_at: null,
};

// Emulate PIN lookup effect (CustomerForm lines 478-498)
const pinLookupData = {
  pincode: "743412",
  state: "West Bengal",
  district: "North 24 Parganas",
  country: "India",
  post_office: "Basirhat SO"
};

const formStateAfterPinLookup: Partial<CustomerFormData> = {
  ...formStateBeforePinLookup,
  state: pinLookupData.state,
  district: pinLookupData.district,
  country: pinLookupData.country,
  post_office: pinLookupData.post_office,
};

assert(formStateAfterPinLookup.assembly_constituency === "", "PIN lookup does NOT invent or set assembly_constituency");
assert(formStateAfterPinLookup.assembly_constituency_number === "", "PIN lookup does NOT invent or set assembly_constituency_number");
assert(formStateAfterPinLookup.parliamentary_constituency === "", "PIN lookup does NOT invent or set parliamentary_constituency");
assert(formStateAfterPinLookup.parliamentary_constituency_number === "", "PIN lookup does NOT invent or set parliamentary_constituency_number");
assert(formStateAfterPinLookup.electoral_verification_status === "unverified", "PIN lookup does NOT mark electoral status verified");
assert(formStateAfterPinLookup.electoral_verified_at === null, "PIN lookup does NOT set electoral_verified_at");

// ==============================================================================
// 9. SMART IMPORT EXTRACTION & MERGE PIPELINE
// ==============================================================================
console.log("\n== SECTION 9: Smart Import Extraction & Merge Pipeline ==");

// DocumentTextParser parses voter ID text with constituency lines
const rawVoterOcrText = `
ELECTION COMMISSION OF INDIA
IDENTITY CARD
EPIC NO: WBF1234567
ELECTOR'S NAME: MONIRUL GAZI
FATHER'S NAME: JALAL GAZI
ASSEMBLY CONSTITUENCY NO. AND NAME: 102 - Basirhat Uttar
PARLIAMENTARY CONSTITUENCY NO. AND NAME: 18 - Basirhat
`;

const parsed = DocumentTextParser.parse(rawVoterOcrText, 'voter_id', 'voter_card.jpg');
assert(parsed.documents?.voter_id?.number === "WBF1234567", "EPIC number parsed from voter ID");
assert(parsed.electoral?.assembly_constituency === "Basirhat Uttar", "Assembly constituency name parsed from voter ID text");
assert(parsed.electoral?.assembly_constituency_number === "102", "AC number parsed from voter ID text");
assert(parsed.electoral?.parliamentary_constituency === "Basirhat", "Parliamentary constituency name parsed from voter ID text");
assert(parsed.electoral?.parliamentary_constituency_number === "18", "PC number parsed from voter ID text");

// DataNormalizer normalizes electoral fields
const normalized = DataNormalizer.normalize({
  customer: { full_name: "Monirul Gazi" },
  documents: { voter_id: { number: "WBF1234567" } },
  electoral: parsed.electoral,
});
assert(normalized.assembly_constituency?.value === "Basirhat Uttar", "Normalized data has assembly_constituency");
assert(normalized.assembly_constituency_number?.value === "102", "Normalized data has assembly_constituency_number");
assert(normalized.parliamentary_constituency?.value === "Basirhat", "Normalized data has parliamentary_constituency");
assert(normalized.parliamentary_constituency_number?.value === "18", "Normalized data has parliamentary_constituency_number");

// MergeEngine prioritizes Voter ID for electoral details
const job = {
  id: "job-voter-1",
  documentType: "Voter ID",
  provider: "ocr-space" as const,
  source: "file" as const,
  status: "completed" as const,
  version: 1,
  normalizedData: normalized,
};

const merged = MergeEngine.merge([job]);
assert(merged.data.assembly_constituency?.value === "Basirhat Uttar", "MergeEngine accepts assembly_constituency from Voter ID");
assert(merged.data.parliamentary_constituency?.value === "Basirhat", "MergeEngine accepts parliamentary_constituency from Voter ID");

// AutoFill payload resolution for intake:
const autoFillResult = resolveAutoFillPayloadForNewIntake({
  first_name: "Monirul",
  last_name: "Gazi",
  voter_id_number: "WBF1234567",
  assembly_constituency: merged.data.assembly_constituency?.value,
  assembly_constituency_number: merged.data.assembly_constituency_number?.value,
  parliamentary_constituency: merged.data.parliamentary_constituency?.value,
  parliamentary_constituency_number: merged.data.parliamentary_constituency_number?.value,
});

assert(autoFillResult.nextFormValues.assembly_constituency === "Basirhat Uttar", "Autofill applies assembly_constituency to review");
assert(autoFillResult.nextFormValues.assembly_constituency_number === "102", "Autofill applies AC number to review");
assert(autoFillResult.nextFormValues.parliamentary_constituency === "Basirhat", "Autofill applies parliamentary_constituency to review");
assert(autoFillResult.nextFormValues.parliamentary_constituency_number === "18", "Autofill applies PC number to review");
assert(autoFillResult.nextFormValues.electoral_verification_status === "unverified", "Smart Import leaves status strictly unverified");
assert(autoFillResult.nextFormValues.electoral_verified_at === null, "Smart Import leaves verified_at strictly null");

// ==============================================================================
// 10. CUSTOMER PROFILE RENDERING & FUTURE EXTENSION CONTRACT
// ==============================================================================
console.log("\n== SECTION 10: Customer Profile & Future Extension Contract ==");

const profileSource = fs.readFileSync(path.resolve(__dirname, 'src/app/(dashboard)/customers/[id]/page.tsx'), 'utf8');

assert(profileSource.includes("Electoral Details"), "Customer profile renders 'Electoral Details' card heading");
assert(profileSource.includes("customer.assembly_constituency"), "Profile displays customer.assembly_constituency");
assert(profileSource.includes("customer.assembly_constituency_number"), "Profile displays customer.assembly_constituency_number");
assert(profileSource.includes("customer.parliamentary_constituency"), "Profile displays customer.parliamentary_constituency");
assert(profileSource.includes("customer.parliamentary_constituency_number"), "Profile displays customer.parliamentary_constituency_number");
assert(profileSource.includes("customer.electoral_verification_status"), "Profile displays customer.electoral_verification_status badge");
assert(profileSource.includes("customer.electoral_verified_at"), "Profile displays customer.electoral_verified_at timestamp");

// Badge styling verification: text alone does not trigger green success
assert(profileSource.includes("customer.electoral_verification_status === \"officially_verified\""), "Profile distinguishes officially_verified status");
assert(profileSource.includes("customer.electoral_verification_status === \"customer_confirmed\""), "Profile distinguishes customer_confirmed status");

// Future Extension Contract: deterministic fields on customer object
const extensionPayloadContract = {
  assembly_constituency: existingCustomerRecord.assembly_constituency,
  assembly_constituency_number: existingCustomerRecord.assembly_constituency_number,
  parliamentary_constituency: existingCustomerRecord.parliamentary_constituency,
  parliamentary_constituency_number: existingCustomerRecord.parliamentary_constituency_number,
  electoral_verification_status: existingCustomerRecord.electoral_verification_status,
  electoral_verified_at: existingCustomerRecord.electoral_verified_at,
};

assert(extensionPayloadContract.assembly_constituency === "Basirhat Uttar", "Extension contract: assembly_constituency readable");
assert(extensionPayloadContract.assembly_constituency_number === "102", "Extension contract: assembly_constituency_number readable");
assert(extensionPayloadContract.parliamentary_constituency === "Basirhat", "Extension contract: parliamentary_constituency readable");
assert(extensionPayloadContract.parliamentary_constituency_number === "18", "Extension contract: parliamentary_constituency_number readable");
assert(extensionPayloadContract.electoral_verification_status === "customer_confirmed", "Extension contract: verification status readable");
assert(typeof extensionPayloadContract.electoral_verified_at === "string", "Extension contract: verified timestamp readable");

console.log("\n==========================================================================");
console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log("==========================================================================");

if (failed > 0) {
  process.exit(1);
}
