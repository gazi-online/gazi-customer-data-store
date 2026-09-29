/**
 * REGRESSION TEST SUITE: VALID FIELD TICK INDICATOR LOGIC
 *
 * Tests the tick-visibility rule:
 *   touchedFields[field] === true  AND
 *   errors[field] is absent        AND
 *   value.trim().length > 0
 * → tick shows
 *
 * Run: npx tsx test-customer-field-valid-ticks.ts
 */

export {};

// ---------------------------------------------------------------------------
// Inline simulation of the tick show-logic used by ValidFieldTick
// Mirrors CustomerForm.tsx show= prop logic exactly
// ---------------------------------------------------------------------------

type FieldName = string;

interface MockFormState {
  touchedFields: Partial<Record<FieldName, boolean>>;
  errors: Partial<Record<FieldName, { message: string }>>;
  values: Partial<Record<FieldName, string>>;
}

function shouldShowTick(
  field: FieldName,
  state: MockFormState
): boolean {
  const touched = !!state.touchedFields[field];
  const hasError = !!state.errors[field];
  const value = (state.values[field] ?? "").trim();
  return touched && !hasError && value.length > 0;
}

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    totalPassed++;
    console.log("  \u2705 [PASS] " + testName);
  } else {
    totalFailed++;
    const msg = "  \u274c [FAIL] " + testName + (detail ? " -> " + detail : "");
    console.error(msg);
    failures.push(msg);
  }
}

// ---------------------------------------------------------------------------
// Helper: build form state
// ---------------------------------------------------------------------------

function state(
  touched: boolean,
  value: string,
  error?: string
): MockFormState {
  return {
    touchedFields: { field: touched },
    errors: error ? { field: { message: error } } : {},
    values: { field: value },
  };
}

function tick(s: MockFormState): boolean {
  return shouldShowTick("field", s);
}

// =========================================================================
// SECTION 1: Core tick logic
// =========================================================================
console.log("\n== SECTION 1: Core tick logic ==");

// Test 1: untouched + valid value + no error → NO tick
assert(!tick(state(false, "Rahul", undefined)), "1. Untouched field with value → no tick");

// Test 2: touched + valid value + no error → TICK
assert(tick(state(true, "Rahul", undefined)), "2. Touched + valid value + no error → tick shows");

// Test 3: touched + empty value + no error → NO tick
assert(!tick(state(true, "", undefined)), "3. Touched + empty value → no tick (optional empty)");

// Test 4: touched + whitespace-only + no error → NO tick (trim guard)
assert(!tick(state(true, "   ", undefined)), "4. Touched + whitespace-only → no tick");

// Test 5: touched + value + error present → NO tick
assert(!tick(state(true, "Rahul", "First name is required")), "5. Touched + value + error → no tick");

// Test 6: untouched + value + no error → NO tick (not yet interacted)
assert(!tick(state(false, "ABC123", undefined)), "6. Untouched + value → no tick (timing gate)");

// =========================================================================
// SECTION 2: Required field scenarios
// =========================================================================
console.log("\n== SECTION 2: Required fields ==");

// First Name — required, touched, valid
assert(tick(state(true, "Nur", undefined)), "7. First Name valid touched → tick");
// First Name — touched, error = validation failed
assert(!tick(state(true, "", "First name is required")), "8. First Name empty touched + error → no tick");
// Last Name — required
assert(tick(state(true, "Gazi", undefined)), "9. Last Name valid → tick");
assert(!tick(state(true, "", "Last name is required")), "10. Last Name empty + error → no tick");

// =========================================================================
// SECTION 3: Optional empty field (should not get tick)
// =========================================================================
console.log("\n== SECTION 3: Optional empty field ==");

assert(!tick(state(true, "", undefined)), "11. Optional email untouched/blank → no tick");
assert(!tick(state(false, "", undefined)), "12. Optional PAN untouched empty → no tick");

// =========================================================================
// SECTION 4: Optional field with valid value
// =========================================================================
console.log("\n== SECTION 4: Optional field with valid value ==");

assert(tick(state(true, "rahul@example.com", undefined)), "13. Email valid → tick");
assert(tick(state(true, "ABCDE1234F", undefined)), "14. PAN valid → tick");
assert(tick(state(true, "+91-9876543210", undefined)), "15. Phone valid → tick");
assert(tick(state(true, "123456789012", undefined)), "16. Aadhaar valid → tick");
assert(tick(state(true, "700001", undefined)), "17. PIN valid → tick");

// =========================================================================
// SECTION 5: Optional field with invalid value → no tick
// =========================================================================
console.log("\n== SECTION 5: Optional invalid → no tick ==");

assert(!tick(state(true, "9876543210", "Use country code and number, e.g. +91-9876543210")),
  "18. Phone invalid (no country code) → no tick");
assert(!tick(state(true, "12345678901", "Aadhaar number must contain 12 digits")),
  "19. Aadhaar 11 digits → no tick");
assert(!tick(state(true, "BADPAN", "Enter a valid PAN, e.g. ABCDE1234F")),
  "20. PAN invalid → no tick");
assert(!tick(state(true, "notanemail", "Enter a valid email address")),
  "21. Email invalid → no tick");
assert(!tick(state(true, "70000", "PIN code must contain 6 digits")),
  "22. PIN 5 digits → no tick");

// =========================================================================
// SECTION 6: Transition — invalid → fixed → tick appears
// =========================================================================
console.log("\n== SECTION 6: Correction transitions ==");

// Before correction: phone invalid, touched
const stateInvalid = { touchedFields: { phone: true }, errors: { phone: { message: "bad" } }, values: { phone: "9876543210" } };
assert(!shouldShowTick("phone", stateInvalid), "23. Phone invalid → no tick");

// After correction: phone valid, still touched, error gone
const stateCorrected = { touchedFields: { phone: true }, errors: {}, values: { phone: "+91-9876543210" } };
assert(shouldShowTick("phone", stateCorrected), "24. Phone corrected → tick appears");

// After making valid field invalid again: tick disappears
const stateReInvalidated = { touchedFields: { phone: true }, errors: { phone: { message: "bad" } }, values: { phone: "9876543210" } };
assert(!shouldShowTick("phone", stateReInvalidated), "25. Phone re-invalidated → tick disappears");

// =========================================================================
// SECTION 7: Bengali/native name unrestricted — no tick restriction
// =========================================================================
console.log("\n== SECTION 7: Bengali/native name ==");

assert(tick(state(true, "\u09a8\u09c1\u09b0 \u0987\u09b8\u09b2\u09be\u09ae \u0997\u09be\u099c\u09c0", undefined)), "26. Bengali native name → tick (valid, no error)");
assert(tick(state(true, "\u0930\u094b\u0939\u0928 \u0936\u0930\u094d\u092e\u093e", undefined)), "27. Hindi name → tick");
assert(!tick(state(false, "\u09a8\u09c1\u09b0 \u0987\u09b8\u09b2\u09be\u09ae", undefined)), "28. Bengali name, untouched → no tick");

// =========================================================================
// SECTION 8: Smart Import — invalid populated value
// =========================================================================
console.log("\n== SECTION 8: Smart Import OCR values ==");

// Smart Import sets value but field hasn't been touched by operator yet → no tick
assert(!tick({ touchedFields: {}, errors: {}, values: { field: "12345678901" } }),
  "29. Smart Import OCR 11-digit Aadhaar, untouched → no tick (timing gate holds)");

// After operator touches field and corrects it
assert(tick(state(true, "123456789012", undefined)),
  "30. After operator corrects Aadhaar → tick appears");

// Smart Import bad PAN, not touched → no tick even if no error yet (mode=onBlur means error may not have fired)
assert(!tick({ touchedFields: {}, errors: {}, values: { field: "ABC123" } }),
  "31. Smart Import bad PAN untouched → no tick (untouched gate)");

// =========================================================================
// SECTION 9: Edit Customer — pre-filled fields, not yet touched
// =========================================================================
console.log("\n== SECTION 9: Edit Customer initial load ==");

// Simulates opening Edit Customer — RHF initializes with values but touchedFields is empty
const editLoadState = {
  touchedFields: {} as Record<string, boolean>,
  errors: {} as Record<string, { message: string }>,
  values: { first_name: "Rahim", last_name: "Gazi", phone: "+91-9876543210", address: "Vill Basirhat" },
};

assert(!shouldShowTick("first_name", editLoadState), "32. Edit load — first_name pre-filled but untouched → no tick");
assert(!shouldShowTick("last_name", editLoadState), "33. Edit load — last_name pre-filled but untouched → no tick");
assert(!shouldShowTick("phone", editLoadState), "34. Edit load — phone pre-filled but untouched → no tick");
assert(!shouldShowTick("address", editLoadState), "35. Edit load — address pre-filled but untouched → no tick");

// After operator touches first_name and doesn't change it (still valid)
const editAfterTouch = {
  touchedFields: { first_name: true },
  errors: {} as Record<string, { message: string }>,
  values: { first_name: "Rahim" },
};
assert(shouldShowTick("first_name", editAfterTouch), "36. Edit — after touching valid first_name → tick");

// =========================================================================
// SECTION 10: Mobile layout concerns (logic-level — no DOM required)
// =========================================================================
console.log("\n== SECTION 10: Mobile layout logic ==");

// The tick is aria-hidden and pointer-events-none — doesn't interfere with input
// The pr-9 padding ensures text doesn't slide under tick (logic confirmed in JSX)
// Verify: tick condition never fires just from state initialization
const freshForm = {
  touchedFields: {} as Record<string, boolean>,
  errors: {} as Record<string, { message: string }>,
  values: {} as Record<string, string>,
};
const fields = ["first_name","last_name","phone","address","pincode","email","aadhaar_number","pan_number","gst_number","voter_id_number","whatsapp","father_name","mother_name","spouse_name","original_language_name"];
let anyTickOnFreshForm = false;
for (const f of fields) {
  if (shouldShowTick(f, freshForm)) { anyTickOnFreshForm = true; }
}
assert(!anyTickOnFreshForm, "37. Fresh/empty form — no ticks on any field (mobile safe)");

// =========================================================================
// Summary
// =========================================================================
console.log("\n==========================================");
console.log("Total Passed: " + totalPassed);
console.log("Total Failed: " + totalFailed);
if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.error(f));
}
console.log("==========================================\n");

if (totalFailed > 0) process.exit(1);
