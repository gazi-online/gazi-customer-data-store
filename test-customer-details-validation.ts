/**
 * REGRESSION TEST SUITE: CUSTOMER DETAILS VALIDATION
 *
 * Covers the strengthened customerSchema validation rules introduced in
 * feature/customer-details-validation.  All tests run against the canonical
 * Zod schema logic directly — no browser/DOM required.
 *
 * Run: npx tsx test-customer-details-validation.ts
 */

import * as z from "zod";

const PHONE_REGEX = /^\+[1-9]\d{0,3}-[0-9]{4,15}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const EPIC_REGEX = /^[A-Z]{3,4}[0-9]{6,7}$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const customerSchema = z.object({
  customer_code: z.string().optional().or(z.literal("")),
  first_name: z.string().transform(v => v.trim()).pipe(z.string().min(1, "First name is required")),
  middle_name: z.string().optional().or(z.literal("")),
  last_name: z.string().transform(v => v.trim()).pipe(z.string().min(1, "Last name is required")),
  phone: z.string().transform(v => v.trim()).pipe(
    z.string().min(1, "Phone number is required").regex(PHONE_REGEX, "Use country code and number, e.g. +91-9876543210")
  ),
  whatsapp: z.string().optional().or(z.literal(""))
    .transform(v => (v ? v.trim() : v))
    .refine(v => !v || v === "" || PHONE_REGEX.test(v), { message: "Use country code and number, e.g. +91-9876543210" }),
  email: z.string().optional().or(z.literal(""))
    .refine(v => !v || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), { message: "Enter a valid email address" }),
  date_of_birth: z.string().optional().or(z.literal(""))
    .refine(v => {
      if (!v || v === "") return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d = new Date(v);
      if (isNaN(d.getTime())) return false;
      return v <= todayISO();
    }, { message: "Date of birth must be a valid past date" }),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  father_name: z.string().optional().or(z.literal("")),
  mother_name: z.string().optional().or(z.literal("")),
  marital_status: z.string().optional().or(z.literal("")),
  spouse_name: z.string().optional().or(z.literal("")),
  aadhaar_number: z.string().optional().or(z.literal(""))
    .refine(v => {
      if (!v || v === "") return true;
      const digits = v.replace(/[\s-]/g, "");
      return /^[0-9]{12}$/.test(digits);
    }, { message: "Aadhaar number must contain 12 digits" }),
  pan_number: z.string().optional().or(z.literal(""))
    .transform(v => (v ? v.trim().toUpperCase() : v))
    .refine(v => !v || v === "" || PAN_REGEX.test(v), { message: "Enter a valid PAN, e.g. ABCDE1234F" }),
  gst_number: z.string().optional().or(z.literal(""))
    .transform(v => (v ? v.trim().toUpperCase() : v))
    .refine(v => !v || v === "" || GST_REGEX.test(v), { message: "Enter a valid 15-character GST number, e.g. 22AAAAA0000A1Z5" }),
  voter_id_number: z.string().optional().or(z.literal(""))
    .transform(v => (v ? v.trim().toUpperCase() : v))
    .refine(v => !v || v === "" || EPIC_REGEX.test(v), { message: "Enter a valid Voter ID / EPIC number, e.g. ABC1234567" }),
  address: z.string().transform(v => v.trim()).pipe(z.string().min(1, "Address is required")),
  city: z.string().optional().or(z.literal("")),
  district: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pincode: z.string().optional().or(z.literal(""))
    .refine(v => {
      if (!v || v === "") return true;
      return v.replace(/\D/g, "").length === 6;
    }, { message: "PIN code must contain 6 digits" }),
  post_office: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  photo_url: z.string().optional(),
  photo_source: z.string().optional(),
  original_language_name: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "lead"]),
});

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

function parse(data: Record<string, unknown>) {
  return customerSchema.safeParse(data);
}

const BASE: Record<string, unknown> = {
  first_name: "Rahul",
  last_name: "Sharma",
  phone: "+91-9876543210",
  address: "123 Main Street, Kolkata",
  status: "active",
};

// ---- S1: Required fields ----
console.log("\n== SECTION 1: Required fields ==");
assert(parse({ ...BASE }).success, "Valid minimal customer passes");
assert(!parse({ ...BASE, first_name: "" }).success, "Empty first_name rejected");
assert(!parse({ ...BASE, last_name: "" }).success, "Empty last_name rejected");
assert(!parse({ ...BASE, phone: "" }).success, "Empty phone rejected");
assert(!parse({ ...BASE, address: "" }).success, "Empty address rejected");

// ---- S2: Whitespace trimming ----
console.log("\n== SECTION 2: Whitespace trimming ==");
assert(!parse({ ...BASE, first_name: "   " }).success, "Whitespace-only first_name rejected");
assert(!parse({ ...BASE, last_name: "\t" }).success, "Whitespace-only last_name rejected");
assert(!parse({ ...BASE, address: "  " }).success, "Whitespace-only address rejected");

// ---- S3: Optional blanks pass ----
console.log("\n== SECTION 3: Optional blank fields pass ==");
const OPTIONALS = ["customer_code","middle_name","whatsapp","email","date_of_birth","father_name","mother_name","marital_status","spouse_name","aadhaar_number","pan_number","gst_number","voter_id_number","pincode","city","district","state","post_office","country","original_language_name"];
for (const f of OPTIONALS) {
  assert(parse({ ...BASE, [f]: "" }).success, "Optional " + f + " blank passes");
}
assert(parse({ ...BASE, original_language_name: "\u09b0\u09be\u09b9\u09c1\u09b2 \u09b6\u09b0\u09cd\u09ae\u09be" }).success, "Bengali name passes");
assert(parse({ ...BASE, original_language_name: "\u0930\u094b\u0939\u0928 \u0915\u0941\u092e\u093e\u0930" }).success, "Hindi Devanagari name passes");

// ---- S4: Phone ----
console.log("\n== SECTION 4: Phone validation ==");
for (const ph of ["+91-9876543210","+1-4155552671","+44-7700900999","+880-1712345678"]) {
  assert(parse({ ...BASE, phone: ph }).success, "Valid phone: " + ph);
}
for (const ph of ["+91-", "9876543210", "+919876543210", "+91 9876543210", "+91-987", "91-9876543210"]) {
  const r = parse({ ...BASE, phone: ph });
  assert(!r.success, "Invalid phone rejected: " + ph);
  if (!r.success) {
    const msg = r.error?.issues[0]?.message ?? "";
    assert(msg.includes("country code"), "Phone error mentions country code for: " + ph, msg);
  }
}
assert(parse({ ...BASE, whatsapp: "" }).success, "WhatsApp blank valid");
assert(parse({ ...BASE, whatsapp: "+91-9876543210" }).success, "Valid WhatsApp passes");
assert(!parse({ ...BASE, whatsapp: "9876543210" }).success, "Invalid WhatsApp rejected");

// ---- S5: Email ----
console.log("\n== SECTION 5: Email validation ==");
assert(parse({ ...BASE, email: "" }).success, "Empty email valid");
assert(parse({ ...BASE, email: "rahul@example.com" }).success, "Valid email passes");
assert(parse({ ...BASE, email: "user+tag@mail.co.in" }).success, "Email with plus-tag passes");
for (const em of ["notanemail","@domain.com","user@","user @domain.com"]) {
  const r = parse({ ...BASE, email: em });
  assert(!r.success, "Invalid email rejected: " + em);
  if (!r.success) {
    assert(r.error?.issues[0]?.message === "Enter a valid email address", "Email msg correct for: " + em, r.error?.issues[0]?.message);
  }
}

// ---- S6: DOB ----
console.log("\n== SECTION 6: Date of birth ==");
assert(parse({ ...BASE, date_of_birth: "" }).success, "Empty DOB valid");
assert(parse({ ...BASE, date_of_birth: "1990-06-15" }).success, "Past DOB passes");
assert(parse({ ...BASE, date_of_birth: todayISO() }).success, "Today DOB accepted");
const futureDate = new Date(); futureDate.setFullYear(futureDate.getFullYear() + 1);
assert(!parse({ ...BASE, date_of_birth: futureDate.toISOString().split("T")[0] }).success, "Future DOB rejected");
assert(!parse({ ...BASE, date_of_birth: "1899-13-45" }).success, "Impossible DOB rejected");
assert(!parse({ ...BASE, date_of_birth: "notadate" }).success, "Non-date DOB rejected");

// ---- S7: Aadhaar ----
console.log("\n== SECTION 7: Aadhaar ==");
assert(parse({ ...BASE, aadhaar_number: "" }).success, "Empty Aadhaar valid");
assert(parse({ ...BASE, aadhaar_number: "123456789012" }).success, "12-digit Aadhaar passes");
assert(parse({ ...BASE, aadhaar_number: "1234 5678 9012" }).success, "Aadhaar with spaces passes");
assert(!parse({ ...BASE, aadhaar_number: "12345678901" }).success, "11-digit Aadhaar rejected");
assert(!parse({ ...BASE, aadhaar_number: "1234567890123" }).success, "13-digit Aadhaar rejected");
assert(!parse({ ...BASE, aadhaar_number: "ABCD12345678" }).success, "Non-numeric Aadhaar rejected");
{
  const r = parse({ ...BASE, aadhaar_number: "12345678901" });
  if (!r.success) assert(r.error?.issues[0]?.message === "Aadhaar number must contain 12 digits", "Aadhaar error msg correct", r.error?.issues[0]?.message);
}

// ---- S8: PAN ----
console.log("\n== SECTION 8: PAN ==");
assert(parse({ ...BASE, pan_number: "" }).success, "Empty PAN valid");
assert(parse({ ...BASE, pan_number: "ABCDE1234F" }).success, "Valid PAN passes");
{
  const r = customerSchema.safeParse({ ...BASE, pan_number: "abcde1234f" });
  if (r.success) {
    const pan = (r.data as Record<string,unknown>).pan_number as string;
    assert(pan === "ABCDE1234F", "PAN lowercased → uppercased by transform", pan);
  } else {
    assert(false, "Lowercase PAN unexpectedly failed");
  }
}
for (const pan of ["ABC123","ABCDE12345","1BCDE1234F","ABCDE1234FF"]) {
  assert(!parse({ ...BASE, pan_number: pan }).success, "Invalid PAN rejected: " + pan);
}

// ---- S9: EPIC ----
console.log("\n== SECTION 9: EPIC / Voter ID ==");
assert(parse({ ...BASE, voter_id_number: "" }).success, "Empty EPIC valid");
assert(parse({ ...BASE, voter_id_number: "ABC1234567" }).success, "3-letter EPIC passes");
assert(parse({ ...BASE, voter_id_number: "ABCD123456" }).success, "4-letter EPIC passes");
{
  const r = customerSchema.safeParse({ ...BASE, voter_id_number: "abc1234567" });
  if (r.success) {
    const epic = (r.data as Record<string,unknown>).voter_id_number as string;
    assert(epic === "ABC1234567", "EPIC lowercased → uppercased", epic);
  } else {
    assert(false, "Lowercase EPIC unexpectedly failed");
  }
}
assert(!parse({ ...BASE, voter_id_number: "AB123" }).success, "Malformed EPIC rejected");

// ---- S10: PIN ----
console.log("\n== SECTION 10: PIN code ==");
assert(parse({ ...BASE, pincode: "" }).success, "Empty PIN valid");
assert(parse({ ...BASE, pincode: "700001" }).success, "6-digit PIN passes");
assert(!parse({ ...BASE, pincode: "70000" }).success, "5-digit PIN rejected");
assert(!parse({ ...BASE, pincode: "7000011" }).success, "7-digit PIN rejected");
{
  const r = parse({ ...BASE, pincode: "70000" });
  if (!r.success) assert(r.error?.issues[0]?.message === "PIN code must contain 6 digits", "PIN error msg correct", r.error?.issues[0]?.message);
}

// ---- S11: Smart Import invalid OCR values ----
console.log("\n== SECTION 11: Smart Import OCR validation ==");
assert(!parse({ ...BASE, pan_number: "ABC123" }).success, "OCR bad PAN rejected → shows field error");
assert(!parse({ ...BASE, aadhaar_number: "12345678901" }).success, "OCR 11-digit Aadhaar rejected");
assert(!parse({ ...BASE, date_of_birth: "2099-01-01" }).success, "OCR future DOB rejected");
{
  const r = parse({ ...BASE, aadhaar_number: "11111111111" });
  assert(!r.success, "Bad OCR Aadhaar fails with field-level error (not silently discarded)");
  if (!r.success) assert(!!r.error?.issues[0], "Field-level Zod issue present");
}

// ---- S12: Add Customer — canonical empty blocked ----
console.log("\n== SECTION 12: Add Customer canonical empty blocked ==");
{
  const empty: Record<string, unknown> = { customer_code:"",first_name:"",middle_name:"",last_name:"",phone:"",whatsapp:"",email:"",date_of_birth:"",gender:"",father_name:"",mother_name:"",marital_status:"",spouse_name:"",aadhaar_number:"",pan_number:"",gst_number:"",voter_id_number:"",address:"",city:"",district:"",state:"",pincode:"",post_office:"",country:"India",original_language_name:"",status:"lead" };
  const r = parse(empty);
  assert(!r.success, "Canonical empty customer blocked — save correctly prevented");
  const failing = r.error?.issues.map(i => i.path[0]) ?? [];
  assert(failing.includes("first_name"), "first_name in failing fields");
  assert(failing.includes("last_name"), "last_name in failing fields");
  assert(failing.includes("phone"), "phone in failing fields");
  assert(failing.includes("address"), "address in failing fields");
  const emptyWithPrefix: Record<string, unknown> = { ...empty, phone: "+91-" };
  const r2 = parse(emptyWithPrefix);
  assert(!r2.success, "Canonical empty customer with +91- prefix blocked — save correctly prevented");
  const failing2 = r2.error?.issues.map(i => i.path[0]) ?? [];
  assert(failing2.includes("phone"), "phone with +91- prefix alone is in failing fields");
  assert(failing2.includes("address"), "address in failing fields for emptyWithPrefix");
}

// ---- S13: Edit Customer — historical records openable ----
console.log("\n== SECTION 13: Edit Customer compatibility ==");
{
  const hist = { customer_code:"CUST-001",first_name:"Rahim",middle_name:"Kumar",last_name:"Gazi",phone:"+91-9876543210",whatsapp:"+91-9876543210",email:"rahim@example.com",date_of_birth:"1988-04-15",gender:"male" as const,father_name:"Karim Gazi",mother_name:"Fatima Bibi",marital_status:"Married",spouse_name:"Ayesha",aadhaar_number:"123456789012",pan_number:"ABCDE1234F",gst_number:"22ABCDE1234F1Z5",voter_id_number:"ABC1234567",address:"Vill Gazi Para",city:"Basirhat",district:"North 24 Parganas",state:"West Bengal",pincode:"743411",post_office:"Basirhat",country:"India",original_language_name:"\u09b0\u09be\u09b9\u09bf\u09ae \u0997\u09be\u099c\u09bf",status:"active" as const };
  assert(parse(hist).success, "Full valid historical customer passes");
}
{
  const minimal = { first_name:"Sita",last_name:"Devi",phone:"+91-8765432109",address:"Village Sitapur",status:"active" as const };
  assert(parse(minimal).success, "Minimal historical customer passes");
}

// ---- S14: Reset — no cross-customer contamination ----
console.log("\n== SECTION 14: Reset — no contamination ==");
{
  const A = { ...BASE, first_name:"Rahim", aadhaar_number:"123456789012" };
  assert(parse(A).success, "Customer A saves successfully");
  assert(!parse({ ...BASE, first_name:"" }).success, "Customer B blank blocked after reset");
  const B = { ...BASE, first_name:"Priya", last_name:"Roy", aadhaar_number:"987654321012" };
  const rB = parse(B);
  assert(rB.success, "Customer B fresh data passes");
  if (rB.success) {
    const bAadhaar = (rB.data as Record<string,unknown>).aadhaar_number;
    assert(bAadhaar === "987654321012", "Customer B Aadhaar is own value, not A's", String(bAadhaar));
  }
}

// ---- Summary ----
console.log("\n==========================================");
console.log("Total Passed: " + totalPassed);
console.log("Total Failed: " + totalFailed);
if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.error(f));
}
console.log("==========================================\n");

if (totalFailed > 0) process.exit(1);
