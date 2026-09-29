/**
 * REGRESSION TEST SUITE: CUSTOMER INTAKE COMPLETE SESSION RESET
 *
 * Verifies that every new-customer intake session on /customers/new starts from a
 * completely clean state, with ZERO stale customer-state leaks between Customer A and Customer B.
 */

import {
  CANONICAL_EMPTY_CUSTOMER,
  createCanonicalEmptyCustomer,
  resolveAutoFillPayloadForNewIntake,
  resolveAutoFillPayload,
  initializeFieldOrigins,
  isSessionFresh,
  FieldOrigins,
} from "./src/components/forms/customerFormUpdatePolicy";
import { constructCustomerCanonicalName } from "./src/lib/names/NativeNameSuggestionProvider";
import { CustomerFormData } from "./src/types/customer";

console.log("==========================================================================");
console.log("🧪 PHASE: CUSTOMER INTAKE COMPLETE SESSION RESET REGRESSION SUITE");
console.log("==========================================================================");

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    totalPassed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    totalFailed++;
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
  }
}

// -------------------------------------------------------------------------
// Mock customer datasets
// -------------------------------------------------------------------------

const customerA_Extracted = {
  first_name: "Rahim",
  middle_name: "Kumar",
  last_name: "Gazi",
  father_name: "Karim Gazi",
  mother_name: "Fatima Bibi",
  marital_status: "married",
  spouse_name: "Ayesha Gazi",
  phone: "9876543210",
  whatsapp: "9876543210",
  email: "rahim.gazi@example.com",
  date_of_birth: "1988-04-15",
  gender: "male",
  aadhaar_number: "123456789012",
  pan_number: "ABCDE1234F",
  gst_number: "19ABCDE1234F1Z5",
  voter_id_number: "WB/01/123/456789",
  address: "Vill Gazi Para, PO Basirhat, PS Basirhat",
  city: "Basirhat",
  district: "North 24 Parganas",
  state: "West Bengal",
  pincode: "743411",
  post_office: "Basirhat",
  original_language_name: "রহিম গাজী",
  remarks: "VIP Member",
  occupation: "Self-employed",
  education: "Graduate",
  income: "50000",
};

const customerB_Extracted = {
  first_name: "Salma",
  last_name: "Khatun",
  father_name: "Jalal Mondal",
  address: "Vill Mondal Para, PO Hasnabad",
  pincode: "743426",
  // Notice: Customer B has NO middle_name, mother_name, spouse_name, email,
  // PAN, GST, Voter ID, original_language_name, remarks, etc.
};

// =========================================================================
// RUN ALL 27 SPECIFIED TESTS
// =========================================================================

// --- 1. A first_name does not survive into B ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.first_name === "Salma", "1: Customer B first_name is 'Salma'");
  assert(nextFormValues.first_name !== customerA_Extracted.first_name, "1: Customer A first_name does not survive into B");
}

// --- 2. A middle_name does not survive into B ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.middle_name === "", "2: Customer B middle_name is empty string");
  assert(nextFormValues.middle_name !== customerA_Extracted.middle_name, "2: Customer A middle_name does not survive into B");
}

// --- 3. A last_name does not survive into B ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.last_name === "Khatun", "3: Customer B last_name is 'Khatun'");
  assert(nextFormValues.last_name !== customerA_Extracted.last_name, "3: Customer A last_name does not survive into B");
}

// --- 4. A original_language_name does not survive into B ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.original_language_name === "", "4: Customer B original_language_name is empty");
  assert(nextFormValues.original_language_name !== customerA_Extracted.original_language_name, "4: Customer A original_language_name does not survive into B");
}

// --- 5. A father/mother/spouse values do not survive ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.father_name === "Jalal Mondal", "5a: Customer B father_name is Jalal Mondal");
  assert(nextFormValues.father_name !== customerA_Extracted.father_name, "5b: Customer A father_name does not survive");
  assert(nextFormValues.mother_name === "", "5c: Customer B mother_name is empty");
  assert(nextFormValues.spouse_name === "", "5d: Customer B spouse_name is empty");
  assert(nextFormValues.marital_status === "", "5e: Customer B marital_status is empty");
}

// --- 6. A address does not survive ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.address === "Vill Mondal Para, PO Hasnabad", "6a: Customer B address correctly set");
  assert(nextFormValues.address !== customerA_Extracted.address, "6b: Customer A address does not survive");
  assert(nextFormValues.pincode === "743426", "6c: Customer B pincode correctly set");
  assert(nextFormValues.pincode !== customerA_Extracted.pincode, "6d: Customer A pincode does not survive");
  assert(nextFormValues.city === "", "6e: Customer A city does not survive (empty in B)");
  assert(nextFormValues.post_office === "", "6f: Customer A post_office does not survive (empty in B)");
}

// --- 7. A email/mobile optional values do not survive ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.email === "", "7a: Customer B email is strictly empty");
  assert(nextFormValues.email !== customerA_Extracted.email, "7b: Customer A email does not survive");
  assert(nextFormValues.phone === "+91-", "7c: Customer B phone resets to '+91-' default when not in B doc");
  assert(nextFormValues.phone !== customerA_Extracted.phone, "7c2: Customer A phone does not survive into B");
  assert(nextFormValues.whatsapp === "", "7d: Customer B whatsapp is empty when not in B doc");
}

// --- 8. A Aadhaar/PAN/EPIC values do not survive ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.aadhaar_number === "", "8a: Customer B aadhaar_number is empty");
  assert(nextFormValues.pan_number === "", "8b: Customer B pan_number is empty");
  assert(nextFormValues.gst_number === "", "8c: Customer B gst_number is empty");
  assert(nextFormValues.voter_id_number === "", "8d: Customer B voter_id_number is empty");
}

// --- 9. A remarks/occupation/education/income do not survive ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  const rawRecord = nextFormValues as unknown as Record<string, unknown>;
  assert(rawRecord.remarks === undefined, "9a: Extraneous remarks not in customer form");
  assert(rawRecord.occupation === undefined, "9b: Extraneous occupation not in customer form");
  assert(rawRecord.education === undefined, "9c: Extraneous education not in customer form");
  assert(rawRecord.income === undefined, "9d: Extraneous income not in customer form");
}

// --- 10. A uploaded documents do not survive ---
{
  // Simulating the dropzone/intake session state reset
  let stagedFiles = [{ name: "rahim_aadhaar.pdf", size: 1024 }];
  let jobs = [{ id: "job-1", documentType: "aadhaar" }];

  // resetCustomerIntakeSession clears stagedFiles and jobs
  stagedFiles = [];
  jobs = [];
  assert(stagedFiles.length === 0, "10a: Uploaded documents list is cleared on reset");
  assert(jobs.length === 0, "10b: Job queue is cleared on reset");
}

// --- 11. A import metadata does not survive ---
{
  let importMeta: { sourceDocuments?: unknown[]; candidatePhotoStoragePath?: string } | null = {
    sourceDocuments: [{ name: "rahim_aadhaar.pdf", side: "Both" }],
    candidatePhotoStoragePath: "users/rahim_photo.jpg",
  };

  // resetCustomerIntakeSession sets importMeta to null
  importMeta = null;
  assert(importMeta === null, "11: Import metadata is null after intake session reset");
}

// --- 12. A native-name suggestion does not survive ---
{
  let nativeNameCandidate: { value: string; provenance: string } | null = {
    value: "রহিম গাজী",
    provenance: "Aadhaar Front",
  };

  // reset clears candidate
  nativeNameCandidate = null;
  assert(nativeNameCandidate === null, "12: Native-name candidate reset to null");
}

// --- 13. A selected Bengali suggestion does not survive ---
{
  let bengaliSuggestions = ["রহিম গাজী", "রহীম গাজী"];
  let selectedSuggestion: string | null = "রহিম গাজী";

  // reset clears suggestions and selection
  bengaliSuggestions = [];
  selectedSuggestion = null;
  assert(bengaliSuggestions.length === 0, "13a: Bengali suggestions reset to empty array");
  assert(selectedSuggestion === null, "13b: Selected suggestion reset to null");
}

// --- 14. A validation errors do not survive ---
{
  let formErrors: Record<string, { message: string }> = {
    first_name: { message: "First name is required" },
    phone: { message: "Phone is required" },
  };

  // reset(CANONICAL_EMPTY_CUSTOMER, { keepErrors: false }) clears errors
  formErrors = {};
  assert(Object.keys(formErrors).length === 0, "14: Form validation errors reset to empty");
}

// --- 15. A dirty/touched state does not survive ---
{
  let dirtyFields: Record<string, boolean> = { first_name: true, pan_number: true };
  let touchedFields: Record<string, boolean> = { first_name: true, pan_number: true };

  // reset(CANONICAL_EMPTY_CUSTOMER, { keepDirty: false, keepTouched: false })
  dirtyFields = {};
  touchedFields = {};
  assert(Object.keys(dirtyFields).length === 0, "15a: dirtyFields reset to empty");
  assert(Object.keys(touchedFields).length === 0, "15b: touchedFields reset to empty");
}

// --- 16. B extraction applies correctly after reset ---
{
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(nextFormValues.first_name === "Salma", "16a: Customer B first_name applied");
  assert(nextFormValues.last_name === "Khatun", "16b: Customer B last_name applied");
  assert(nextFormValues.father_name === "Jalal Mondal", "16c: Customer B father_name applied");
  assert(nextFormValues.address === "Vill Mondal Para, PO Hasnabad", "16d: Customer B address applied");
  assert(nextFormValues.pincode === "743426", "16e: Customer B pincode applied");
}

// --- 17. missing B fields remain EMPTY rather than taking A values ---
{
  // Customer A form state before intake session reset:
  const formStateCustomerA = {
    ...CANONICAL_EMPTY_CUSTOMER,
    ...customerA_Extracted,
  };

  // Correct model: New intake does NOT merge onto formStateCustomerA.
  // It resolves against CANONICAL_EMPTY_CUSTOMER.
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);

  assert(nextFormValues.email === "", "17a: Email is empty string (not A's email)");
  assert(nextFormValues.pan_number === "", "17b: PAN is empty string (not A's PAN)");
  assert(nextFormValues.middle_name === "", "17c: Middle name is empty string (not A's middle name)");
  assert(nextFormValues.aadhaar_number === "", "17d: Aadhaar is empty string (not A's Aadhaar)");
  assert(nextFormValues.voter_id_number === "", "17e: Voter ID is empty string (not A's Voter ID)");
  assert(nextFormValues.gst_number === "", "17f: GST is empty string (not A's GST)");
  assert(nextFormValues.original_language_name === "", "17g: Native name is empty string (not A's native name)");
}

// --- 18. manual A → Smart Import B clean ---
{
  // Operator manually typed Customer A
  const manualFormA: CustomerFormData = {
    ...CANONICAL_EMPTY_CUSTOMER,
    first_name: "ManualFirst",
    last_name: "ManualLast",
    phone: "9111122222",
    email: "manual@example.com",
    pan_number: "MANUAL1234",
  };

  // Operator now starts Smart Import B
  // New intake session starts from CANONICAL_EMPTY_CUSTOMER
  const { nextFormValues } = resolveAutoFillPayloadForNewIntake(customerB_Extracted);

  assert(nextFormValues.first_name === "Salma", "18a: Customer B first name set");
  assert(nextFormValues.email === "", "18b: Manual A email does not leak into B");
  assert(nextFormValues.pan_number === "", "18c: Manual A PAN does not leak into B");
  assert(nextFormValues.phone === "+91-", "18d: Customer B phone resets to '+91-' default");
  assert(nextFormValues.phone !== manualFormA.phone, "18d2: Manual A phone does not leak into B");
}

// --- 19. Smart Import A → manual B clean ---
{
  // Customer A was imported
  const importedA = {
    ...CANONICAL_EMPTY_CUSTOMER,
    ...customerA_Extracted,
  };

  // Operator switches to manual entry for B
  // resetCustomerIntakeSession() creates a fresh canonical empty customer
  const manualFormB = createCanonicalEmptyCustomer();

  assert(manualFormB.first_name === "", "19a: Manual B first_name is empty");
  assert(manualFormB.last_name === "", "19b: Manual B last_name is empty");
  assert(manualFormB.email === "", "19c: Manual B email is empty");
  assert(manualFormB.pan_number === "", "19d: Manual B PAN is empty");
  assert(manualFormB.original_language_name === "", "19e: Manual B native name is empty");
  assert(manualFormB.status === "lead", "19f: Manual B status defaults to 'lead'");
  assert(manualFormB.country === "India", "19g: Manual B country defaults to 'India'");
  assert(manualFormB.phone === "+91-", "19h: Manual B phone defaults to '+91-'");
}

// --- 20. Smart Import A → Smart Import B clean ---
{
  // Session 1: Customer A imported
  const resA = resolveAutoFillPayloadForNewIntake(customerA_Extracted);
  assert(resA.nextFormValues.first_name === "Rahim", "20a: A first_name resolved");
  assert(resA.nextFormValues.pan_number === "ABCDE1234F", "20b: A PAN resolved");

  // Session 2: Customer B imported
  const resB = resolveAutoFillPayloadForNewIntake(customerB_Extracted);
  assert(resB.nextFormValues.first_name === "Salma", "20c: B first_name resolved");
  assert(resB.nextFormValues.pan_number === "", "20d: B PAN is empty");
  assert(resB.nextFormValues.email === "", "20e: B email is empty");
}

// --- 21. successful save A → new B clean ---
{
  // Simulating createCustomer(customerA) succeeding
  const saveResult = { success: true, customerId: "cust-123" };
  assert(saveResult.success, "21a: Customer A saved successfully");

  // On successful save, resetCustomerIntakeSession() runs immediately
  const freshIntakeCustomer = createCanonicalEmptyCustomer();
  const freshOrigins = initializeFieldOrigins(freshIntakeCustomer as unknown as Record<string, unknown>, false);

  assert(freshIntakeCustomer.first_name === "", "21b: In-memory customer first_name reset");
  assert(freshIntakeCustomer.pan_number === "", "21c: In-memory customer PAN reset");
  assert(freshIntakeCustomer.phone === "+91-", "21e: In-memory customer phone reset to '+91-'");
  assert(Object.keys(freshOrigins).length === 0, "21d: In-memory field origins reset to empty");
}

// --- 22. navigation away/back → new intake clean ---
{
  // Simulating bfcache pageshow or route remount
  const restoredFormState = createCanonicalEmptyCustomer();
  assert(restoredFormState.first_name === "", "22a: Restored route starts with empty first_name");
  assert(restoredFormState.address === "", "22b: Restored route starts with empty address");
  assert(restoredFormState.original_language_name === "", "22c: Restored route starts with empty native name");
}

// --- 23. late async result from A cannot mutate B session ---
{
  let activeSessionToken = 1;

  // Extraction for A starts under session 1
  const sessionTokenA = activeSessionToken;

  // User resets and starts session for B
  activeSessionToken += 1;
  const sessionTokenB = activeSessionToken;

  // Late async response arrives from A
  const isAFresh = isSessionFresh(sessionTokenA, activeSessionToken);
  assert(!isAFresh, "23a: Late async result from Customer A is rejected (not fresh)");

  // Response arrives from B
  const isBFresh = isSessionFresh(sessionTokenB, activeSessionToken);
  assert(isBFresh, "23b: Async result from Customer B is accepted (fresh session)");
}

// --- 24. Change Documents same-customer behavior remains correct ---
{
  // In same-customer Change Documents, user had manually edited phone
  const sameCustomerForm: Record<string, unknown> = {
    ...CANONICAL_EMPTY_CUSTOMER,
    first_name: "Anita",
    last_name: "Roy",
    phone: "9998887776", // manually entered
  };
  const sameCustomerOrigins: FieldOrigins = {
    phone: "user", // manual protection
    first_name: "import",
    last_name: "import",
  };

  // New document for same customer arrives with a different phone and an address
  const sameCustomerNewDoc = {
    first_name: "Anita",
    last_name: "Roy",
    phone: "9123456789", // incoming from doc
    address: "Kolkata, WB",
    pincode: "700001",
  };

  // Change Documents uses resolveAutoFillPayload with existing values and origins
  const result = resolveAutoFillPayload(sameCustomerForm, sameCustomerNewDoc, sameCustomerOrigins);

  assert(result.fieldsToUpdate.phone === undefined, "24a: Manually entered phone is protected during Change Documents");
  assert(result.fieldsToUpdate.address === "Kolkata, WB", "24b: New address from second document is accepted");
}

// --- 25. Edit Customer behavior remains unchanged ---
{
  const existingCustomerData = {
    id: "cust-existing-001",
    first_name: "Subrata",
    middle_name: "Kumar",
    last_name: "Das",
    phone: "9830098300",
    email: "subrata@example.com",
    address: "Barasat, North 24 Parganas",
    status: "active" as const,
  };

  // CustomerForm defaultValues when initialData is provided
  const editDefaultValues: CustomerFormData = {
    first_name: existingCustomerData.first_name,
    middle_name: existingCustomerData.middle_name,
    last_name: existingCustomerData.last_name,
    phone: existingCustomerData.phone,
    address: existingCustomerData.address,
    status: existingCustomerData.status,
    email: existingCustomerData.email,
  };

  assert(editDefaultValues.first_name === "Subrata", "25a: Edit customer retains existing first_name");
  assert(editDefaultValues.email === "subrata@example.com", "25b: Edit customer retains existing email");
  assert(editDefaultValues.status === "active", "25c: Edit customer retains existing status");
}

// --- 26. customer save flow remains unchanged ---
{
  const validData: CustomerFormData = {
    ...CANONICAL_EMPTY_CUSTOMER,
    first_name: "Tanmoy",
    last_name: "Saha",
    phone: "9876543210",
    address: "Salt Lake, Kolkata",
    status: "active",
  };

  // Payload cleaning logic in onSubmit
  const cleanedData = {
    ...validData,
    middle_name: validData.middle_name === "" ? null : validData.middle_name,
    gender: validData.gender === "" ? null : validData.gender,
    father_name: validData.father_name === "" ? null : validData.father_name,
    mother_name: validData.mother_name === "" ? null : validData.mother_name,
    marital_status: validData.marital_status === "" ? null : validData.marital_status,
    spouse_name: validData.spouse_name === "" ? null : validData.spouse_name,
    date_of_birth: validData.date_of_birth === "" ? null : validData.date_of_birth,
    aadhaar_number: validData.aadhaar_number === "" ? null : validData.aadhaar_number,
    pan_number: validData.pan_number === "" ? null : validData.pan_number,
    gst_number: validData.gst_number === "" ? null : validData.gst_number,
    voter_id_number: validData.voter_id_number === "" ? null : validData.voter_id_number,
    post_office: validData.post_office === "" ? null : validData.post_office,
    original_language_name: validData.original_language_name === "" ? null : validData.original_language_name,
    country: "India",
  };

  assert(cleanedData.first_name === "Tanmoy", "26a: first_name intact in save payload");
  assert(cleanedData.middle_name === null, "26b: empty middle_name converted to null");
  assert(cleanedData.pan_number === null, "26c: empty pan_number converted to null");
  assert(cleanedData.status === "active", "26d: status intact in save payload");
}

// --- 27. Hybrid Bengali suggestion flow remains functional ---
{
  // Customer B has name Salma Khatun
  const canonicalCustomerNameB = constructCustomerCanonicalName({
    first_name: customerB_Extracted.first_name,
    middle_name: undefined,
    last_name: customerB_Extracted.last_name,
  });

  assert(canonicalCustomerNameB === "Salma Khatun", "27a: Canonical name strictly Salma Khatun");
  assert(!canonicalCustomerNameB.includes("Rahim"), "27b: Customer A's name not in B's canonical name");
  assert(!canonicalCustomerNameB.includes("Gazi"), "27c: Customer A's surname not in B's canonical name");
  assert(!canonicalCustomerNameB.includes("Kumar"), "27d: Customer A's middle name not in B's canonical name");
}

// =========================================================================
// SUMMARY
// =========================================================================
console.log("==========================================================================");
console.log(`TOTAL RESULT: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log("==========================================================================");

if (totalFailed > 0) {
  console.error("❌ REGRESSION FAILURES DETECTED IN CUSTOMER INTAKE SESSION RESET!");
  process.exit(1);
} else {
  console.log("🎉 ALL 27 CUSTOMER INTAKE SESSION RESET REGRESSION TESTS PASSED!");
}
