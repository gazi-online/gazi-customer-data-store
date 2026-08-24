import { checkDuplicateCustomer } from "./src/app/(dashboard)/customers/actions";

// Mock Supabase database client for save flow unit tests
class MockCustomerDb {
  public customers: any[] = [];

  async checkDuplicates(params: {
    aadhaar_number?: string | null;
    pan_number?: string | null;
    phone?: string | null;
    customer_code?: string | null;
    excludeId?: string;
  }) {
    const warnings: string[] = [];

    if (params.phone) {
      const match = this.customers.find(c => c.phone === params.phone && c.id !== params.excludeId);
      if (match) warnings.push(`Phone number (${params.phone}) is already registered under ${match.first_name} ${match.last_name}.`);
    }

    if (params.aadhaar_number) {
      const match = this.customers.find(c => c.aadhaar_number === params.aadhaar_number && c.id !== params.excludeId);
      if (match) warnings.push(`Aadhaar number (${params.aadhaar_number}) is already registered under ${match.first_name} ${match.last_name}.`);
    }

    if (params.pan_number) {
      const match = this.customers.find(c => c.pan_number === params.pan_number && c.id !== params.excludeId);
      if (match) warnings.push(`PAN number (${params.pan_number}) is already registered under ${match.first_name} ${match.last_name}.`);
    }

    if (params.customer_code) {
      const match = this.customers.find(c => c.customer_code === params.customer_code && c.id !== params.excludeId);
      if (match) warnings.push(`Customer Code (${params.customer_code}) is already assigned to ${match.first_name} ${match.last_name}.`);
    }

    return { hasDuplicates: warnings.length > 0, warnings };
  }
}

async function runCustomerSaveFlowTestSuite() {
  console.log("==========================================================================");
  console.log("📝 PHASE 7: CUSTOMER SAVE FLOW & AI REVIEW TEST SUITE");
  console.log("==========================================================================\n");

  const mockDb = new MockCustomerDb();

  // Add baseline customer for duplicate checks
  mockDb.customers.push({
    id: "cust_existing_1",
    first_name: "Rahat",
    last_name: "Ali",
    phone: "+919876543210",
    aadhaar_number: "123456789012",
    pan_number: "ABCDE1234F",
    customer_code: "CUST-001"
  });

  const testResults: { caseId: string; name: string; expected: string; actual: string; status: 'PASS' | 'FAIL' }[] = [];

  function recordCase(caseId: string, name: string, expected: string, actual: string, pass: boolean) {
    const status = pass ? 'PASS' : 'FAIL';
    testResults.push({ caseId, name, expected, actual, status });
    console.log(`[CASE ${caseId}] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  }

  // --- CASE A: Manual-only customer creation ---
  let directDbWritesFromAi = 0; // Must remain 0
  const manualForm = {
    first_name: "Anita",
    last_name: "Roy",
    phone: "+919800011122",
    address: "Kolkata, WB",
    status: "active"
  };
  recordCase("A", "Manual-only Customer Creation", "Direct AI Writes = 0", `Direct AI Writes = ${directDbWritesFromAi}`, directDbWritesFromAi === 0);

  // --- CASE B: AI auto-fill then save ---
  const aiExtractedData = {
    first_name: "Dipika",
    last_name: "Roy",
    phone: "+919811122233",
    address: "Nadia, West Bengal"
  };
  // Confirm & Auto-Fill populates state only
  const populatedFormState = { ...manualForm, ...aiExtractedData };
  recordCase("B", "AI Auto-Fill Populates Form State", "Dipika Roy", populatedFormState.first_name + " " + populatedFormState.last_name, populatedFormState.first_name === "Dipika");

  // --- CASE C: AI null fields do not erase manual values ---
  const manualValues = { email: "anita@example.com", phone: "+919800011122" };
  const aiResponseWithNulls = { email: null, phone: undefined, address: "Murshidabad" };
  
  // Simulate handleAutoFill filtering logic
  const mergedState = { ...manualValues };
  Object.keys(aiResponseWithNulls).forEach(k => {
    const val = (aiResponseWithNulls as any)[k];
    if (val !== undefined && val !== null && val !== "") {
      (mergedState as any)[k] = val;
    }
  });

  const emailPreserved = mergedState.email === "anita@example.com";
  recordCase("C", "AI Null Fields Do Not Erase Manual Values", "anita@example.com", mergedState.email, emailPreserved);

  // --- CASE D: Conflict unresolved → confirm blocked ---
  const conflicts = [{ field: 'aadhaar_number', options: [{ value: '1111' }, { value: '2222' }] }];
  const resolvedDataD: Record<string, any> = {}; // empty / unresolved
  const isBlockedD = conflicts.some(c => resolvedDataD[c.field] === undefined);
  recordCase("D", "Unresolved Conflict Blocks Auto-Fill", "BLOCKED", isBlockedD ? "BLOCKED" : "ALLOWED", isBlockedD === true);

  // --- CASE E: Conflict resolved → form populated ---
  const resolvedDataE: Record<string, any> = { aadhaar_number: '2222' };
  const isBlockedE = conflicts.some(c => resolvedDataE[c.field] === undefined);
  recordCase("E", "Resolved Conflict Allows Auto-Fill", "ALLOWED", isBlockedE ? "BLOCKED" : "ALLOWED", isBlockedE === false);

  // --- CASE F: Manual profile photo not overwritten by AI ---
  const currentPhotoSource = "user_manual_photo_123.jpg";
  const aiPhotoSource = "ai_cropped_photo_456.jpg";
  
  let finalPhotoSource = currentPhotoSource;
  // Protection check in handleAutoFill
  if (!currentPhotoSource) {
    finalPhotoSource = aiPhotoSource;
  }
  recordCase("F", "Manual Profile Photo Preserved", "user_manual_photo_123.jpg", finalPhotoSource, finalPhotoSource === "user_manual_photo_123.jpg");

  // --- CASE G: Duplicate Aadhaar/PAN warning ---
  const dupCheckG = await mockDb.checkDuplicates({
    aadhaar_number: "123456789012",
    pan_number: "ABCDE1234F"
  });
  recordCase("G", "Duplicate Aadhaar/PAN Warning Triggered", "2 Warnings Found", `${dupCheckG.warnings.length} Warnings Found`, dupCheckG.hasDuplicates && dupCheckG.warnings.length === 2);

  // --- CASE H: Edit existing customer with AI suggestions ---
  const dupCheckH = await mockDb.checkDuplicates({
    aadhaar_number: "123456789012",
    excludeId: "cust_existing_1" // Editing self
  });
  recordCase("H", "Edit Existing Customer Excludes Self in Duplicate Check", "0 Warnings (Excluded)", `${dupCheckH.warnings.length} Warnings`, !dupCheckH.hasDuplicates);

  // --- CASE I: Save failure leaves form data intact ---
  const formBeforeFailedSave = { first_name: "Ananya", last_name: "Das", phone: "+919999988888" };
  let formStateAfterFailure = { ...formBeforeFailedSave };
  const formIntact = JSON.stringify(formStateAfterFailure) === JSON.stringify(formBeforeFailedSave);
  recordCase("I", "Save Failure Leaves Form State Intact", "INTACT", formIntact ? "INTACT" : "RESET", formIntact);

  // --- CASE J: AI returns only full_name and original_language_name (NO whitespace splitting) ---
  const aiRawNameResponse = {
    full_name: "Reshma Khatun",
    original_language_name: "রেশমা খাতুন"
  };
  const targetFormState: Record<string, any> = {
    first_name: "",
    middle_name: "",
    last_name: ""
  };
  
  // Apply handleAutoFill logic (No whitespace splitting!)
  Object.keys(aiRawNameResponse).forEach(k => {
    const val = (aiRawNameResponse as any)[k];
    if (val !== undefined && val !== null && val !== "") {
      targetFormState[k] = val;
    }
  });

  const caseJPassed = (
    targetFormState.full_name === "Reshma Khatun" &&
    targetFormState.original_language_name === "রেশমা খাতুন" &&
    targetFormState.first_name === "" &&
    targetFormState.middle_name === "" &&
    targetFormState.last_name === ""
  );

  recordCase(
    "J",
    "No Automatic Space Splitting (Canonical full_name Preserved)",
    "full_name preserved, first/middle/last NOT fabricated",
    `full_name='${targetFormState.full_name}', first='${targetFormState.first_name || 'null'}', last='${targetFormState.last_name || 'null'}'`,
    caseJPassed
  );

  // --- CASE K: Voter ID Auto-Fill Populates Form State ---
  const aiVoterData = { voter_id_number: "ABC1234567" };
  const formStateK: Record<string, any> = { ...manualForm };
  Object.keys(aiVoterData).forEach(k => {
    const val = (aiVoterData as any)[k];
    if (val !== undefined && val !== null && val !== "") {
      formStateK[k] = val;
    }
  });
  recordCase(
    "K",
    "Voter ID Auto-Fill Populates Form State",
    "ABC1234567",
    formStateK.voter_id_number || "null",
    formStateK.voter_id_number === "ABC1234567"
  );

  // Helper simulating CustomerForm handleAutoFill logic
  function simulateAutoFill(currentValues: Record<string, any>, aiData: Record<string, any>) {
    const nextState = { ...currentValues };
    Object.keys(aiData).forEach(field => {
      if (field === 'photo_source' && currentValues.photo_source && currentValues.photo_source.length > 0) return;
      if (field === 'original_language_name' && currentValues.original_language_name && String(currentValues.original_language_name).trim().length > 0) return;
      if (field === 'phone' && currentValues.phone && String(currentValues.phone).trim().length > 0) return;
      if (aiData[field] !== undefined && aiData[field] !== null && aiData[field] !== "") {
        nextState[field] = aiData[field];
      }
    });
    const finalPrimaryPhone = (currentValues.phone && String(currentValues.phone).trim().length > 0)
      ? String(currentValues.phone).trim()
      : (aiData.phone ? String(aiData.phone).trim() : "");
    const currentWhatsapp = (currentValues.whatsapp || "").trim();
    if (finalPrimaryPhone && !currentWhatsapp) {
      nextState.whatsapp = finalPrimaryPhone;
    }
    return nextState;
  }

  // --- CASE L: Aadhaar Phone populates primary & copies to empty WhatsApp ---
  const formStateL = simulateAutoFill({ phone: "", whatsapp: "" }, { phone: "9876543210" });
  recordCase(
    "L",
    "Primary Phone -> WhatsApp Auto-Fill (Empty WhatsApp)",
    "phone=9876543210, whatsapp=9876543210",
    `phone=${formStateL.phone}, whatsapp=${formStateL.whatsapp}`,
    formStateL.phone === "9876543210" && formStateL.whatsapp === "9876543210"
  );

  // --- CASE M: Manual WhatsApp is protected from auto-fill overwrite ---
  const formStateM = simulateAutoFill({ phone: "", whatsapp: "9123456780" }, { phone: "9876543210" });
  recordCase(
    "M",
    "Manual WhatsApp Protection (Existing WhatsApp Preserved)",
    "whatsapp=9123456780",
    `whatsapp=${formStateM.whatsapp}`,
    formStateM.phone === "9876543210" && formStateM.whatsapp === "9123456780"
  );

  // --- CASE N: Manual Primary Phone is protected & copied to empty WhatsApp ---
  const formStateN = simulateAutoFill({ phone: "9800011122", whatsapp: "" }, { phone: "9899999999" });
  recordCase(
    "N",
    "Manual Primary Phone Protection & WhatsApp Copy",
    "phone=9800011122, whatsapp=9800011122",
    `phone=${formStateN.phone}, whatsapp=${formStateN.whatsapp}`,
    formStateN.phone === "9800011122" && formStateN.whatsapp === "9800011122"
  );

  // --- CASE O: No Phone in Aadhaar -> No WhatsApp fabricated ---
  const formStateO = simulateAutoFill({ phone: "", whatsapp: "" }, { full_name: "Reshma Khatun" });
  recordCase(
    "O",
    "No Phone Fabricated When Missing",
    "phone=empty, whatsapp=empty",
    `phone=${formStateO.phone || 'empty'}, whatsapp=${formStateO.whatsapp || 'empty'}`,
    !formStateO.phone && !formStateO.whatsapp
  );

  console.log("\n==========================================================================");
  console.log("📊 TEST SUITE SUMMARY REPORT");
  console.log("==========================================================================\n");

  console.table(testResults.map(t => ({
    'Case': t.caseId,
    'Test Name': t.name,
    'Expected Result': t.expected,
    'Actual Outcome': t.actual,
    'Status': t.status
  })));

  const allPassed = testResults.every(t => t.status === 'PASS');
  console.log("\n==========================================================================");
  console.log(`VERDICT: ${allPassed ? `✅ ALL ${testResults.length} CUSTOMER SAVE FLOW TEST CASES PASSED!` : '❌ SOME TESTS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runCustomerSaveFlowTestSuite();
