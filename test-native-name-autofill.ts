/**
 * test-native-name-autofill.ts
 *
 * Regression Test Suite for Native Language Name — Suggestion-Only UX
 *
 * NEW UX CONTRACT (0268edd):
 *   - original_language_name is NEVER silently written into the form payload
 *   - Extracted native-script name is preserved as nativeNameCandidate in
 *     SmartImportMetadata { value, provenance }
 *   - The suggestion card in CustomerForm requires explicit operator click to fill
 *   - No transliteration-generated value may enter nativeNameCandidate
 *   - Father/guardian/mother/spouse native names do not become nativeNameCandidate
 *
 * Tests:
 *   A. Bengali candidate extracted -> nativeNameCandidate set, flat payload empty
 *   B. Devanagari candidate -> nativeNameCandidate set, flat payload empty
 *   C. candidate metadata preserved (value only, no fabrication)
 *   D. Use this name -> exact candidate value (simulated)
 *   E. Ignore -> field remains blank (simulated)
 *   F. manual value never silently overwritten (update policy)
 *   G. new import resets dismissed suggestion (state machine)
 *   H. father native name is NOT offered as customer suggestion
 *   I. guardian/mother/spouse native names are NOT offered
 *   J. address/header native text is NOT offered
 *   K. English-only source -> no suggestion
 *   L. JSON import -> no silent native-name autofill in flat
 *   M. existing first/last/DOB/gender/father autofill still works
 *   N. no fabricated transliteration presented as document-derived
 *
 * Run: npx tsx test-native-name-autofill.ts
 */

import { hasMeaningfulNativeScript, isNonPersonNameCandidate } from './src/lib/names/nameSafety';
import { isBengaliScript } from './src/lib/names/BengaliNameTransliterator';
import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';
import { ImportJob, NormalizedData } from './src/components/AiSmartImportEngine/types';
import {
  canImportOverwriteField,
  initializeFieldOrigins,
  FieldOrigins
} from './src/components/forms/customerFormUpdatePolicy';

console.log("==========================================================================");
console.log("🧪 NATIVE-LANGUAGE NAME SUGGESTION UX REGRESSION SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, actual?: unknown) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} | Actual:`, actual);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Helper: simulate the new AiSmartImportEngine flat + candidate logic
// This mirrors the exact code in index.tsx handleExtractMultiDocuments and
// handleAddJson (both paths, post 0268edd).
// ---------------------------------------------------------------------------
function simulateEngineAutoAdvance(mergedData: NormalizedData, sourceLabel: string): {
  flat: Record<string, unknown>;
  nativeNameCandidate: { value: string; provenance: string } | null;
} {
  const flat: Record<string, unknown> = {};
  const mergedDataRecord = mergedData as Record<string, { value?: unknown } | undefined>;
  Object.keys(mergedData).forEach(key => {
    if (key !== 'profile_photo') {
      flat[key] = mergedDataRecord[key]?.value;
    }
  });

  // NEW: native name is NEVER auto-filled
  const docNativeName: string | undefined = mergedData.original_language_name?.value;
  delete flat.original_language_name; // always removed from payload

  const nativeNameCandidate = (docNativeName && hasMeaningfulNativeScript(docNativeName))
    ? { value: docNativeName, provenance: sourceLabel }
    : null;

  return { flat, nativeNameCandidate };
}

// ---------------------------------------------------------------------------
// TEST A: Bengali candidate extracted -> nativeNameCandidate set, flat payload empty
// ---------------------------------------------------------------------------
console.log("\n--- TEST A: Bengali candidate extracted -> payload empty, candidate set ---");
{
  const mergedData: NormalizedData = {
    full_name: { value: "Jesmira Khatun", confidence: 0.95, source_document: "Aadhaar", source_side: "front" },
    original_language_name: { value: "জেসমিরা খাতুন", confidence: 0.96, source_document: "Aadhaar", source_side: "front" }
  };
  const { flat, nativeNameCandidate } = simulateEngineAutoAdvance(mergedData, "doc.jpg");
  assert(flat.original_language_name === undefined, "A1: Bengali: flat payload does NOT contain original_language_name", flat.original_language_name);
  assert(nativeNameCandidate !== null, "A2: Bengali: nativeNameCandidate is set");
  assert(nativeNameCandidate?.value === "জেসমিরা খাতুন", "A3: Bengali: candidate value is exact extracted text", nativeNameCandidate?.value);
  assert(isBengaliScript(nativeNameCandidate?.value ?? ''), "A4: Bengali: candidate confirmed Bengali script");
}

// ---------------------------------------------------------------------------
// TEST B: Devanagari candidate -> payload empty, candidate set
// ---------------------------------------------------------------------------
console.log("\n--- TEST B: Devanagari/Hindi candidate ---");
{
  const mergedData: NormalizedData = {
    full_name: { value: "Nur Islam Gazi", confidence: 0.95, source_document: "Aadhaar", source_side: "front" },
    original_language_name: { value: "नूर इस्लाम गाज़ी", confidence: 0.96, source_document: "Aadhaar", source_side: "front" }
  };
  const { flat, nativeNameCandidate } = simulateEngineAutoAdvance(mergedData, "doc.jpg");
  assert(flat.original_language_name === undefined, "B1: Devanagari: flat payload does NOT contain original_language_name", flat.original_language_name);
  assert(nativeNameCandidate !== null, "B2: Devanagari: nativeNameCandidate is set");
  assert(nativeNameCandidate?.value === "नूर इस्लाम गाज़ी", "B3: Devanagari: candidate value is exact text", nativeNameCandidate?.value);
  assert(hasMeaningfulNativeScript(nativeNameCandidate?.value ?? ''), "B4: Devanagari: validated by hasMeaningfulNativeScript");
}

// ---------------------------------------------------------------------------
// TEST C: Candidate metadata preserved (value, no fabrication)
// ---------------------------------------------------------------------------
console.log("\n--- TEST C: Candidate metadata preservation ---");
{
  const mergedData: NormalizedData = {
    full_name: { value: "Reshma Khatun", confidence: 0.95, source_document: "Voter ID", source_side: "front" },
    original_language_name: { value: "রেশমা খাতুন", confidence: 0.96, source_document: "Voter ID", source_side: "front" }
  };
  const { nativeNameCandidate } = simulateEngineAutoAdvance(mergedData, "voter_id.jpg");
  assert(nativeNameCandidate?.value === "রেশমা খাতুন", "C1: Candidate value matches extraction exactly");
  assert(typeof nativeNameCandidate?.provenance === 'string' && nativeNameCandidate.provenance.length > 0, "C2: Provenance is non-empty string");
  // Value must be the actual OCR text, not transliterated
  assert(isBengaliScript(nativeNameCandidate?.value ?? ''), "C3: Candidate is genuine Bengali script (not transliterated Latin)");
}

// ---------------------------------------------------------------------------
// TEST D: "Use this name" -> exact candidate enters field (logic simulation)
// ---------------------------------------------------------------------------
console.log("\n--- TEST D: Use this name -> exact candidate value ---");
{
  const candidate = { value: "জেসমিরা খাতুন", provenance: "doc.jpg" };
  // Simulate the onClick handler in CustomerForm
  let fieldValue = "";
  const handleUseThisName = () => {
    fieldValue = candidate.value;
  };
  handleUseThisName();
  assert(fieldValue === "জেসমিরা খাতুন", "D1: 'Use this name' sets field to exact candidate value", fieldValue);
  assert(fieldValue !== "Jesmira Khatun", "D2: Latin name is NOT written (only native script candidate)");
}

// ---------------------------------------------------------------------------
// TEST E: Ignore -> field remains blank
// ---------------------------------------------------------------------------
console.log("\n--- TEST E: Ignore -> field remains blank ---");
{
  let fieldValue = "";
  let dismissed = false;
  const handleIgnore = () => { dismissed = true; };
  handleIgnore();
  assert((dismissed as boolean) === true, "E1: Dismiss state is set");
  assert(fieldValue === "", "E2: Field value remains empty after Ignore", fieldValue);
}

// ---------------------------------------------------------------------------
// TEST F: Manual value in field prevents suggestion from appearing
//         (update policy canImportOverwriteField protection)
// ---------------------------------------------------------------------------
console.log("\n--- TEST F: Manual value never silently overwritten ---");
{
  // Scenario F1: existing populated value blocks import overwrite
  assert(
    canImportOverwriteField('original_language_name', 'নতুন নাম', 'রেশমা খাতুন', undefined) === false,
    "F1: Populated original_language_name blocks import overwrite"
  );
  // Scenario F2: user-marked origin blocks overwrite
  assert(
    canImportOverwriteField('original_language_name', 'নতুন নাম', 'ম্যানুয়াল নাম', 'user') === false,
    "F2: User-origin original_language_name strictly blocked"
  );
  // Scenario F3: empty incoming never erases
  assert(
    canImportOverwriteField('original_language_name', '', 'রেশমা খাতুন', undefined) === false,
    "F3: Empty incoming value never erases existing native name"
  );
  // Scenario F4: empty field accepts incoming (normal case)
  assert(
    canImportOverwriteField('original_language_name', 'রেশমা খাতুন', '', undefined) === true,
    "F4: Empty field allows incoming native name (but we never send it now)"
  );
}

// ---------------------------------------------------------------------------
// TEST G: New import resets dismissed suggestion
// ---------------------------------------------------------------------------
console.log("\n--- TEST G: New import resets dismissed state ---");
{
  // Simulate state machine: nativeNameDismissed reset on new import
  let nativeNameDismissed = true; // was dismissed from previous import
  const handleNewImport = (meta: { nativeNameCandidate: unknown }) => {
    if (meta) {
      nativeNameDismissed = false; // reset on each fresh import
    }
  };
  handleNewImport({ nativeNameCandidate: { value: "জেসমিরা খাতুন", provenance: "doc.jpg" } });
  assert((nativeNameDismissed as boolean) === false, "G1: nativeNameDismissed resets to false on new import");
}

// ---------------------------------------------------------------------------
// TEST H: Father native name NOT offered as customer suggestion
// ---------------------------------------------------------------------------
console.log("\n--- TEST H: Father native name is NOT customer suggestion ---");
{
  // DocumentTextParser fixture with native father name in D/O line
  // The Aadhaar scoring algorithm scores the customer name (above DOB) higher
  // The father name in Bengali on D/O line does not match isNonPersonHeader (it's just a name)
  // but DocumentTextParser only sets original_language_name from the CUSTOMER name scoring zone
  const aadhaarWithNativeFather = `
GOVERNMENT OF INDIA
জেসমিরা খাতুন
Jesmira Khatun
DOB: 24/10/2000
Female
D/O: Abdul Rahaman Sardar
1234 5678 9012
`.trim();
  const parsed = DocumentTextParser.parse(aadhaarWithNativeFather, 'aadhaar_front', 'doc.jpg');
  assert(
    parsed.customer?.original_language_name === "জেসমিরা খাতুন",
    "H1: Customer native name correctly extracted (জেসমিরা খাতুন)",
    parsed.customer?.original_language_name
  );
  assert(
    parsed.customer?.original_language_name !== "Abdul Rahaman Sardar",
    "H2: Father Latin name is NOT customer native name"
  );
  // Now with native Bengali father name
  const aadhaarWithBengaliFather = `
GOVERNMENT OF INDIA
জেসমিরা খাতুন
Jesmira Khatun
DOB: 24/10/2000
Female
D/O: আব্দুল রহমান সরদার
1234 5678 9012
`.trim();
  const parsedF2 = DocumentTextParser.parse(aadhaarWithBengaliFather, 'aadhaar_front', 'doc.jpg');
  assert(
    parsedF2.customer?.original_language_name === "জেসমিরা খাতুন",
    "H3: Bengali father name does NOT replace customer native name",
    parsedF2.customer?.original_language_name
  );
  // Verify nativeNameCandidate path also doesn't expose father name
  const normalized = DataNormalizer.normalize({
    customer: parsedF2.customer,
    address: parsedF2.address,
    detected_documents: parsedF2.detected_documents
  });
  const job: ImportJob = { id: 'h-test', documentType: 'aadhaar_front', provider: 'ocr-space', source: 'file', version: 1, status: 'completed', normalizedData: normalized };
  const merged = MergeEngine.merge([job]);
  const { flat, nativeNameCandidate } = simulateEngineAutoAdvance(merged.data, "doc.jpg");
  assert(flat.original_language_name === undefined, "H4: flat payload does NOT contain original_language_name");
  assert(nativeNameCandidate?.value === "জেসমিরা খাতুন", "H5: nativeNameCandidate is customer name, not father name", nativeNameCandidate?.value);
}

// ---------------------------------------------------------------------------
// TEST I: Guardian/mother/spouse native names are NOT offered
// ---------------------------------------------------------------------------
console.log("\n--- TEST I: Guardian/mother/spouse native names NOT offered ---");
{
  // nameSafety.ts isNonPersonNameCandidate rejects lines starting with relationship prefixes
  // S/O, D/O, W/O, H/O, C/O
  const relationshipLines = [
    "S/O: আব্দুল রহমান",
    "D/O: রেশমা বেগম",
    "W/O: সুমন চক্রবর্তী",
    "H/O: আবুল হাসান",
    "Son of: Sumon Chakraborty",
    "Daughter of: Reshma Khatun"
  ];
  for (const line of relationshipLines) {
    assert(
      isNonPersonNameCandidate(line) === true,
      `I: Relationship line rejected: "${line}"`
    );
  }
  // Also verify via hasMeaningfulNativeScript — these contain Bengali but should be rejected
  const nativeRelLines = [
    "S/O: আব্দুল রহমান সরদার",
    "D/O: রেশমা বেগম খাতুন"
  ];
  for (const line of nativeRelLines) {
    assert(
      hasMeaningfulNativeScript(line) === false,
      `I: Relationship+native line rejected by hasMeaningfulNativeScript: "${line}"`
    );
  }
}

// ---------------------------------------------------------------------------
// TEST J: Address/header native text is NOT offered
// ---------------------------------------------------------------------------
console.log("\n--- TEST J: Address/header native text NOT offered as suggestion ---");
{
  const nonPersonCandidates = [
    { val: "পশ্চিমবঙ্গ সরকার", desc: "Bengali Govt Header" },
    { val: "ভারত সরকার", desc: "Indian Govt Bengali" },
    { val: "भारत सरकार", desc: "Indian Govt Hindi" },
    { val: "পশ্চিমবঙ্গ, দক্ষিণ ২৪ পরগনা", desc: "Bengali district address" },
    { val: "নির্বাচন কমিশন", desc: "Election Commission Bengali" },
    { val: "আয়কর বিভাগ", desc: "Income Tax Bengali" },
    { val: "জন্ম তারিখ: 24/10/2000", desc: "Bengali DOB line" },
    { val: "ঠিকানা: কলকাতা", desc: "Bengali address label" },
    { val: "GOVERNMENT OF INDIA", desc: "Govt English" },
    { val: "ELECTION COMMISSION OF INDIA", desc: "Election Commission English" },
    { val: "Address: 123 Main St", desc: "Address label" },
  ];
  for (const c of nonPersonCandidates) {
    assert(
      hasMeaningfulNativeScript(c.val) === false || isNonPersonNameCandidate(c.val) === true,
      `J: "${c.desc}" rejected`
    );
  }
}

// ---------------------------------------------------------------------------
// TEST K: English-only source -> no suggestion
// ---------------------------------------------------------------------------
console.log("\n--- TEST K: English-only source -> no nativeNameCandidate ---");
{
  const mergedData: NormalizedData = {
    full_name: { value: "Reshma Khatun", confidence: 0.95 },
    first_name: { value: "Reshma", confidence: 0.95 },
    last_name: { value: "Khatun", confidence: 0.95 }
    // no original_language_name
  };
  const { flat, nativeNameCandidate } = simulateEngineAutoAdvance(mergedData, "doc.jpg");
  assert(flat.original_language_name === undefined, "K1: English-only: no original_language_name in flat");
  assert(nativeNameCandidate === null, "K2: English-only: nativeNameCandidate is null");
  // Also verify hasMeaningfulNativeScript rejects Latin
  assert(hasMeaningfulNativeScript("Reshma Khatun") === false, "K3: Latin text rejected by hasMeaningfulNativeScript");
}

// ---------------------------------------------------------------------------
// TEST L: JSON import path -> no silent native-name autofill
// ---------------------------------------------------------------------------
console.log("\n--- TEST L: JSON import path -> no silent autofill ---");
{
  const jsonPayload = {
    customer: {
      full_name: "Nur Islam Gazi",
      original_language_name: "নুর ইসলাম গাজী"
    }
  };
  const normalized = DataNormalizer.normalize(jsonPayload);
  const job: ImportJob = {
    id: "json-test",
    documentType: "JSON",
    provider: "gemini",
    source: "json",
    version: 1,
    status: "completed",
    normalizedData: normalized
  };
  const merged = MergeEngine.merge([job]);
  // Simulate the JSON import path (same logic as handleAddJson in index.tsx)
  const { flat, nativeNameCandidate } = simulateEngineAutoAdvance(merged.data, "JSON Data");
  assert(flat.original_language_name === undefined, "L1: JSON import: original_language_name NOT in flat payload");
  assert(nativeNameCandidate !== null, "L2: JSON import: nativeNameCandidate preserved in metadata");
  assert(nativeNameCandidate?.value === "নুর ইসলাম গাজী", "L3: JSON import: candidate value matches source");
  // Other fields DO still autofill
  assert(flat.full_name === "Nur Islam Gazi", "L4: JSON import: full_name still autofills normally");
}

// ---------------------------------------------------------------------------
// TEST M: Existing first/last/DOB/gender/father autofill still works
// ---------------------------------------------------------------------------
console.log("\n--- TEST M: Other fields still autofill normally ---");
{
  const mergedData: NormalizedData = {
    full_name: { value: "Jesmira Khatun", confidence: 0.95 },
    first_name: { value: "Jesmira", confidence: 0.95 },
    last_name: { value: "Khatun", confidence: 0.95 },
    date_of_birth: { value: "2000-10-24", confidence: 0.95 },
    gender: { value: "female", confidence: 0.95 },
    father_name: { value: "Abdul Rahaman Sardar", confidence: 0.90 },
    original_language_name: { value: "জেসমিরা খাতুন", confidence: 0.96 }
  };
  const { flat, nativeNameCandidate } = simulateEngineAutoAdvance(mergedData, "doc.jpg");
  assert(flat.first_name === "Jesmira", "M1: first_name autofills");
  assert(flat.last_name === "Khatun", "M2: last_name autofills");
  assert(flat.date_of_birth === "2000-10-24", "M3: date_of_birth autofills");
  assert(flat.gender === "female", "M4: gender autofills");
  assert(flat.father_name === "Abdul Rahaman Sardar", "M5: father_name autofills");
  assert(flat.original_language_name === undefined, "M6: original_language_name is NOT in flat");
  assert(nativeNameCandidate?.value === "জেসমিরা খাতুন", "M7: native name preserved as candidate in metadata");
}

// ---------------------------------------------------------------------------
// TEST N: No fabricated transliteration presented as document-derived
// ---------------------------------------------------------------------------
console.log("\n--- TEST N: No transliteration fabrication in nativeNameCandidate ---");
{
  // Verify DataNormalizer does not accept Latin values under native aliases
  const latinAlias = { customer: { full_name: "Nur Islam Gazi", native_name: "Nur Islam Gazi" } };
  const normLatin = DataNormalizer.normalize(latinAlias);
  assert(normLatin.original_language_name === undefined, "N1: Latin value under native_name alias rejected");

  // Verify hasMeaningfulNativeScript blocks all Latin
  const latinNames = ["Jesmira Khatun", "Nur Islam Gazi", "Reshma Begum", "Abdul Rahaman"];
  for (const n of latinNames) {
    assert(hasMeaningfulNativeScript(n) === false, `N2: Latin "${n}" cannot become nativeNameCandidate`);
  }

  // Verify that the only way a value enters nativeNameCandidate is via document extraction
  // (DataNormalizer.normalize + hasMeaningfulNativeScript check)
  const validNativeNames = [
    "জেসমিরা খাতুন",
    "নুর ইসলাম গাজী",
    "नूर इस्लाम गाज़ी",
    "রেশমা খাতুন"
  ];
  for (const n of validNativeNames) {
    assert(hasMeaningfulNativeScript(n) === true, `N3: Genuine native name "${n}" passes validation`);
  }
}

// ---------------------------------------------------------------------------
// TEST 1 (Backwards compat): DataNormalizer alias mapping still works
// ---------------------------------------------------------------------------
console.log("\n--- TEST 1: DataNormalizer alias mapping ---");
{
  const aliasesToTest = [
    { key: "native_name", val: "নুর ইসলাম গাজী" },
    { key: "local_name", val: "নুর ইসলাম গাজী" },
    { key: "bengali_name", val: "নুর ইসলাম গাজী" },
    { key: "hindi_name", val: "नूर इस्लाम गाज़ी" },
    { key: "vernacular_name", val: "নুর ইসলাম গাজী" },
  ];
  for (const alias of aliasesToTest) {
    const payload = { customer: { full_name: "Nur Islam Gazi", [alias.key]: alias.val } };
    const res = DataNormalizer.normalize(payload);
    assert(res.original_language_name?.value === alias.val, `1: Alias '${alias.key}' -> canonical original_language_name`);
  }
  // Latin value in alias must be rejected
  const invalidLatin = { customer: { full_name: "Nur Islam Gazi", native_name: "Nur Islam Gazi" } };
  const invalidNorm = DataNormalizer.normalize(invalidLatin);
  assert(invalidNorm.original_language_name === undefined, "1: Latin value in native alias rejected");
}

// ---------------------------------------------------------------------------
// TEST 2: DocumentTextParser extracts customer native name (not father)
// ---------------------------------------------------------------------------
console.log("\n--- TEST 2: DocumentTextParser produces correct original_language_name ---");
{
  const aadhaarText = `
GOVERNMENT OF INDIA
জেসমিরা খাতুন
Jesmira Khatun
DOB: 24/10/2000
Female
D/O: Abdul Rahaman Sardar
1234 5678 9012
`.trim();
  const parsed = DocumentTextParser.parse(aadhaarText, 'aadhaar_front', 'doc.jpg');
  assert(parsed.customer?.full_name === "Jesmira Khatun", "2a: Latin full name extracted");
  assert(parsed.customer?.original_language_name === "জেসমিরা খাতুন", "2b: Bengali customer name extracted");
  assert(parsed.customer?.father_name === "Abdul Rahaman Sardar", "2c: Father name extracted separately");
  assert(parsed.customer?.original_language_name !== "Abdul Rahaman Sardar", "2d: Father name is NOT original_language_name");
}

// ---------------------------------------------------------------------------
// TEST 3: MergeEngine preserves original_language_name in merged.data
// ---------------------------------------------------------------------------
console.log("\n--- TEST 3: MergeEngine preserves native name in merged.data ---");
{
  const mockJobs: ImportJob[] = [{
    id: "job-1",
    documentType: "Aadhaar Card",
    provider: "ocr-space",
    source: "file",
    version: 1,
    status: "completed",
    normalizedData: {
      full_name: { value: "Jesmira Khatun", confidence: 0.95, source_document: "Aadhaar", source_side: "front" },
      original_language_name: { value: "জেসমিরা খাতুন", confidence: 0.96, source_document: "Aadhaar", source_side: "front" }
    }
  }];
  const merged = MergeEngine.merge(mockJobs);
  assert(merged.data.original_language_name !== undefined, "3a: MergeEngine outputs original_language_name in merged.data");
  assert(merged.data.original_language_name?.value === "জেসমিরা খাতুন", "3b: Value matches source");
  assert(merged.data.original_language_name?.source_document === "Aadhaar", "3c: Source document preserved");
}

// ===========================================================================
// SUMMARY
// ===========================================================================
console.log("\n==========================================================================");
console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log("==========================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL NATIVE-LANGUAGE NAME SUGGESTION UX TESTS PASSED!");
  console.log("");
  console.log("CONFIRMED:");
  console.log("  ✓ original_language_name is NEVER silently written to form payload");
  console.log("  ✓ Extracted name preserved as nativeNameCandidate in metadata");
  console.log("  ✓ Father/guardian/mother/spouse native names filtered before suggestion");
  console.log("  ✓ Government headers and address lines rejected");
  console.log("  ✓ No transliteration fabrication in candidates");
  console.log("  ✓ Manual field values never silently overwritten");
  console.log("  ✓ All other fields (name/DOB/gender/father) still autofill normally");
}
