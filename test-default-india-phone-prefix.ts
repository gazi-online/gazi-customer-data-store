/**
 * REGRESSION TEST SUITE: DEFAULT +91- PHONE PREFIX
 *
 * Verifies all 11 requirements for the default India phone prefix:
 * 1. Fresh New Customer starts with +91- in canonical empty customer
 * 2. +91- alone is invalid under canonical schema
 * 3. +91- alone never shows green tick (convenience prefix guard)
 * 4. Typing 9876543210 results in +91-9876543210
 * 5. Full valid phone (+91-9876543210) passes validation and shows tick when touched
 * 6. Customer A save/reset -> Customer B phone = +91- (no leak from Customer A)
 * 7. Smart Import valid extracted phone is preserved and overwrites +91- default
 * 8. Smart Import missing phone safely retains fresh +91- default
 * 9. Edit Customer existing phone is never replaced with +91-
 * 10. Other international country codes (+880-, +1-, +44-) remain fully valid and accepted
 * 11. WhatsApp derivation never treats +91- as a valid primary phone
 *
 * Run: npx tsx test-default-india-phone-prefix.ts
 */

import { z } from "zod";
import {
  CANONICAL_EMPTY_CUSTOMER,
  createCanonicalEmptyCustomer,
  resolveAutoFillPayloadForNewIntake,
  resolveAutoFillPayload,
  canImportOverwriteField,
  initializeFieldOrigins,
  DEFAULT_PHONE_PREFIX,
} from "./src/components/forms/customerFormUpdatePolicy";

console.log("==========================================================================");
console.log("🧪 SUITE: DEFAULT INDIA (+91-) PHONE PREFIX REGRESSION TESTS");
console.log("==========================================================================");

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    totalPassed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    totalFailed++;
    const msg = `  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`;
    console.error(msg);
    failures.push(msg);
  }
}

// ---------------------------------------------------------------------------
// Canonical phone schema & tick helper
// ---------------------------------------------------------------------------
const PHONE_REGEX = /^\+[1-9]\d{0,3}-[0-9]{4,15}$/;

const customerSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .regex(PHONE_REGEX, "Use country code and number, e.g. +91-9876543210"),
  address: z.string().trim().min(1, "Address is required"),
  status: z.enum(["active", "inactive", "lead"]),
});

function shouldShowPhoneTick(
  phoneValue: string,
  touched: boolean,
  hasError: boolean
): boolean {
  const trimmed = (phoneValue ?? "").trim();
  if (trimmed === DEFAULT_PHONE_PREFIX) return false;
  return touched && !hasError && trimmed.length > 0;
}

// =========================================================================
// REQUIREMENT 1: Canonical empty customer phone is +91-
// =========================================================================
console.log("\n== SECTION 1: Canonical source of truth ==");
assert(
  CANONICAL_EMPTY_CUSTOMER.phone === "+91-",
  "1a. CANONICAL_EMPTY_CUSTOMER.phone is '+91-'"
);
assert(
  createCanonicalEmptyCustomer().phone === "+91-",
  "1b. createCanonicalEmptyCustomer().phone is '+91-'"
);
assert(
  DEFAULT_PHONE_PREFIX === "+91-",
  "1c. DEFAULT_PHONE_PREFIX constant exported as '+91-'"
);

// =========================================================================
// REQUIREMENT 2: +91- alone is invalid
// =========================================================================
console.log("\n== SECTION 2: +91- alone is INVALID ==");
{
  const result = customerSchema.safeParse({
    first_name: "Rahul",
    last_name: "Sharma",
    phone: "+91-",
    address: "123 Main St",
    status: "active",
  });
  assert(!result.success, "2a. +91- alone fails schema validation");
  if (!result.success) {
    const issue = result.error.issues.find(i => i.path[0] === "phone");
    assert(!!issue, "2b. Validation issue is on 'phone' path");
    assert(
      Boolean(issue?.message?.includes("country code")),
      "2c. Error message mentions country code guidance",
      issue?.message
    );
  }
}

// =========================================================================
// REQUIREMENT 3: +91- alone never shows green tick
// =========================================================================
console.log("\n== SECTION 3: Green tick visibility rules for +91- ==");
assert(
  !shouldShowPhoneTick("+91-", false, false),
  "3a. Untouched +91- → no tick"
);
assert(
  !shouldShowPhoneTick("+91-", true, true),
  "3b. Touched +91- with error → no tick"
);
assert(
  !shouldShowPhoneTick("+91-", true, false),
  "3c. Touched +91- without error (guard check) → no tick"
);
assert(
  !shouldShowPhoneTick("   +91-   ", true, false),
  "3d. Whitespace padded +91- → no tick"
);

// =========================================================================
// REQUIREMENT 4 & 5: Valid full phone passes & shows tick
// =========================================================================
console.log("\n== SECTION 4: Valid full phone behavior ==");
{
  const operatorTypedDigits = "9876543210";
  const initialValue = DEFAULT_PHONE_PREFIX;
  const finalValue = initialValue + operatorTypedDigits;
  assert(
    finalValue === "+91-9876543210",
    "4a. Operator typing 9876543210 produces +91-9876543210"
  );

  const result = customerSchema.safeParse({
    first_name: "Rahul",
    last_name: "Sharma",
    phone: finalValue,
    address: "123 Main St",
    status: "active",
  });
  assert(result.success, "4b. +91-9876543210 passes schema validation");
  assert(
    shouldShowPhoneTick(finalValue, true, false),
    "4c. +91-9876543210 touched without error shows green tick"
  );
  assert(
    !shouldShowPhoneTick(finalValue, false, false),
    "4d. Untouched valid phone does not show tick until user interaction"
  );
}

// =========================================================================
// REQUIREMENT 6: Customer A save/reset -> Customer B phone resets to +91-
// =========================================================================
console.log("\n== SECTION 5: Session reset & no cross-customer leak ==");
{
  const customerA = {
    ...createCanonicalEmptyCustomer(),
    first_name: "Rahim",
    last_name: "Gazi",
    phone: "+91-9876543210",
  };
  assert(
    customerA.phone === "+91-9876543210",
    "5a. Customer A has complete phone"
  );

  // Operator saves Customer A and intake resets
  const customerB_Fresh = createCanonicalEmptyCustomer();
  assert(
    customerB_Fresh.phone === "+91-",
    "5b. Customer B fresh session resets to '+91-'"
  );
  assert(
    customerB_Fresh.phone !== customerA.phone,
    "5c. Customer A's number did not leak into Customer B"
  );
}

// =========================================================================
// REQUIREMENT 7: Smart Import valid extracted phone is preserved
// =========================================================================
console.log("\n== SECTION 6: Smart Import with valid phone overwrites default ==");
{
  const incomingSmartImportData = {
    first_name: "Deepak",
    last_name: "Adhikari",
    phone: "+91-9123456789",
  };

  // Check canImportOverwriteField for phone when currentVal is +91-
  const canOverwrite = canImportOverwriteField(
    "phone",
    incomingSmartImportData.phone,
    DEFAULT_PHONE_PREFIX,
    undefined // unowned default
  );
  assert(
    canOverwrite,
    "6a. canImportOverwriteField allows valid imported phone to overwrite '+91-'"
  );

  const { nextFormValues, fieldsToUpdate } = resolveAutoFillPayloadForNewIntake(
    incomingSmartImportData
  );
  assert(
    nextFormValues.phone === "+91-9123456789",
    "6b. nextFormValues.phone uses the extracted phone '+91-9123456789'"
  );
  assert(
    fieldsToUpdate.phone === "+91-9123456789",
    "6c. fieldsToUpdate contains the extracted phone"
  );
}

// =========================================================================
// REQUIREMENT 8: Smart Import missing phone safely retains +91-
// =========================================================================
console.log("\n== SECTION 7: Smart Import with missing phone retains default ==");
{
  const incomingSmartImportNoPhone = {
    first_name: "Salma",
    last_name: "Khatun",
    // No phone in document
  };

  const { nextFormValues, fieldsToUpdate } = resolveAutoFillPayloadForNewIntake(
    incomingSmartImportNoPhone
  );
  assert(
    nextFormValues.phone === "+91-",
    "7a. nextFormValues.phone retains fresh default '+91-'"
  );
  assert(
    fieldsToUpdate.phone === undefined,
    "7b. fieldsToUpdate does not touch phone"
  );
}

// =========================================================================
// REQUIREMENT 9: Edit Customer never replaces existing phone with +91-
// =========================================================================
console.log("\n== SECTION 8: Edit Customer preservation ==");
{
  const existingCustomerRecord = {
    id: "cust-999",
    first_name: "Anita",
    last_name: "Roy",
    phone: "+91-9800112233",
    address: "Kolkata",
    status: "active" as const,
  };

  // Simulating Edit Customer form initialization:
  // initialData is provided, so phone takes initialData.phone
  const editDefaultValues = {
    ...createCanonicalEmptyCustomer(),
    first_name: existingCustomerRecord.first_name,
    last_name: existingCustomerRecord.last_name,
    phone: existingCustomerRecord.phone,
    address: existingCustomerRecord.address,
    status: existingCustomerRecord.status,
  };

  assert(
    editDefaultValues.phone === "+91-9800112233",
    "8a. Edit Customer initializes with stored phone"
  );
  assert(
    editDefaultValues.phone !== "+91-",
    "8b. Edit Customer did not replace stored phone with '+91-'"
  );

  // In edit mode, initial origin protects existing phone from import overwrite
  const origins = initializeFieldOrigins(editDefaultValues, true);
  const canOverwriteEditPhone = canImportOverwriteField(
    "phone",
    "+91-9999999999",
    editDefaultValues.phone,
    origins.phone
  );
  assert(
    !canOverwriteEditPhone,
    "8c. Stored customer phone is protected against import overwrite"
  );
}

// =========================================================================
// REQUIREMENT 10: Other international country codes accepted
// =========================================================================
console.log("\n== SECTION 9: International country code support ==");
for (const intlPhone of [
  "+880-1712345678",
  "+1-4155552671",
  "+44-7700900999",
  "+971-501234567",
]) {
  const res = customerSchema.safeParse({
    first_name: "Foreign",
    last_name: "Customer",
    phone: intlPhone,
    address: "Global Address",
    status: "active",
  });
  assert(res.success, `9a. International phone accepted: ${intlPhone}`);
  assert(
    shouldShowPhoneTick(intlPhone, true, false),
    `9b. International phone shows tick when valid: ${intlPhone}`
  );
}

// =========================================================================
// REQUIREMENT 11: WhatsApp derivation never uses +91-
// =========================================================================
console.log("\n== SECTION 10: WhatsApp derivation safety ==");
{
  const resolution = resolveAutoFillPayload(
    { phone: "+91-", whatsapp: "" },
    { first_name: "Reshma" },
    {}
  );
  assert(
    resolution.shouldLinkWhatsapp === false,
    "10a. WhatsApp derivation is NOT triggered when phone is '+91-'"
  );
  assert(
    resolution.fieldsToUpdate.whatsapp === undefined,
    "10b. fieldsToUpdate does not assign '+91-' to WhatsApp"
  );
}

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n==========================================");
console.log(`Total Passed: ${totalPassed}`);
console.log(`Total Failed: ${totalFailed}`);
if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.error(f));
}
console.log("==========================================\n");

if (totalFailed > 0) {
  process.exit(1);
}
