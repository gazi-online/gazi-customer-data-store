/**
 * test-bengali-transliterator.ts
 *
 * Regression test for the Bengali script detection utility (isBengaliScript)
 * and the shared name safety guard (isNonPersonNameCandidate).
 *
 * NOTE: The phonetic TOKEN_DICT / suggestBengaliNames engine has been removed
 * as of the Google Input Tools migration. Production Bengali suggestions now
 * come from GoogleInputToolsProvider → /api/bengali-suggestions.
 * Mocked tests for that flow are in test-google-input-tools.ts.
 *
 * Run: npx tsx test-bengali-transliterator.ts
 */

import { isBengaliScript } from './src/lib/names/BengaliNameTransliterator';
import { isNonPersonNameCandidate } from './src/lib/names/nameSafety';

console.log("==========================================================================");
console.log("🧪 BENGALI SCRIPT DETECTION & NAME SAFETY TEST SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, actual?: unknown) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${testName} | Actual:`, actual);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// CASE A: Bengali script detection — positive cases
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE A: Bengali script detection — positive");
assert(isBengaliScript("রেশমা খাতুন") === true, "A: রেশমা খাতুন = Bengali", null);
assert(isBengaliScript("মোহাম্মদ") === true, "A: মোহাম্মদ = Bengali", null);
assert(isBengaliScript("সুমন চক্রবর্তী") === true, "A: সুমন চক্রবর্তী = Bengali", null);
assert(isBengaliScript("পশ্চিমবঙ্গ সরকার") === true, "A: Bengali govt header = Bengali script", null);
assert(isBengaliScript("অরিন্দম বোস") === true, "A: অরিন্দম বোস = Bengali", null);

// ---------------------------------------------------------------------------
// CASE B: Bengali script detection — negative cases (Latin/Devanagari/empty)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE B: Bengali script detection — negative");
assert(isBengaliScript("Reshma Khatun") === false, "B: Latin = NOT Bengali", null);
assert(isBengaliScript("Mohammad Islam Gazi") === false, "B: Latin = NOT Bengali", null);
assert(isBengaliScript("रेशमा खातून") === false, "B: Hindi Devanagari = NOT Bengali", null);
assert(isBengaliScript("भारत सरकार") === false, "B: Hindi = NOT Bengali", null);
assert(isBengaliScript("") === false, "B: Empty = NOT Bengali", null);
assert(isBengaliScript("   ") === false, "B: Whitespace = NOT Bengali", null);

// ---------------------------------------------------------------------------
// CASE C: Document Bengali name → ReviewPanel must NOT re-transliterate
//         (logic: hasDocBengaliName = isBengaliScript(docNativeName))
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE C: Document Bengali name → ReviewPanel flow (isBengaliScript guard)");
const docNativeName = "রেশমা খাতুন";
const hasDocBengaliName = isBengaliScript(docNativeName);
assert(hasDocBengaliName === true, "C: Document Bengali name → hasDocBengaliName = true", docNativeName);
// When hasDocBengaliName === true, ReviewPanel skips the Google Input Tools fetch.
// Verified in test-google-input-tools.ts Case H.

// ---------------------------------------------------------------------------
// CASE D: Hindi native name → NOT treated as Bengali (distinct script guard)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE D: Hindi ≠ Bengali (Devanagari is a different Unicode block)");
const hindiDocName = "रेशमा खातून";
assert(isBengaliScript(hindiDocName) === false, "D: Hindi Devanagari NOT detected as Bengali", hindiDocName);
// When false → hasDocBengaliName = false → ReviewPanel fetches Bengali suggestions
// from Google Input Tools using English full_name. Not tested here (requires HTTP mock).

// ---------------------------------------------------------------------------
// CASE E: Government / header strings → hard rejected
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE E: Government / header strings → isNonPersonNameCandidate");

// English government headers
assert(isNonPersonNameCandidate("Government of West Bengal") === true, "E: English govt header rejected", null);
assert(isNonPersonNameCandidate("GOVERNMENT OF INDIA") === true, "E: ALL_CAPS govt header rejected", null);
assert(isNonPersonNameCandidate("Election Commission of India") === true, "E: Election Commission rejected", null);
assert(isNonPersonNameCandidate("Income Tax Department") === true, "E: Income Tax Dept rejected", null);
assert(isNonPersonNameCandidate("Ministry of Finance") === true, "E: Ministry rejected", null);
assert(isNonPersonNameCandidate("Government Sarkar Department") === true, "E: Mixed English govt header rejected", null);

// Bengali government headers
assert(isNonPersonNameCandidate("পশ্চিমবঙ্গ সরকার") === true, "E: Bengali গভ header পশ্চিমবঙ্গ rejected", null);
assert(isNonPersonNameCandidate("ভারত সরকার") === true, "E: Bengali ভারত সরকার rejected", null);
assert(isNonPersonNameCandidate("নির্বাচন কমিশন") === true, "E: Bengali election commission rejected", null);

// Hindi government headers
assert(isNonPersonNameCandidate("भारत सरकार") === true, "E: Hindi भारत सरकार rejected", null);
assert(isNonPersonNameCandidate("पश्चिमबंग सरकार") === true, "E: Hindi पश्चिमबंग सरकार rejected", null);
assert(isNonPersonNameCandidate("आयकर विभाग") === true, "E: Hindi income tax rejected", null);

// ---------------------------------------------------------------------------
// CASE F: Legitimate person names → NOT rejected
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE F: Legitimate person names → isNonPersonNameCandidate = false");

assert(isNonPersonNameCandidate("Rina Sarkar") === false, "F: Rina Sarkar NOT rejected (surname safety)", null);
assert(isNonPersonNameCandidate("Reshma Khatun") === false, "F: Reshma Khatun NOT rejected", null);
assert(isNonPersonNameCandidate("Mohammad Islam Gazi") === false, "F: Mohammad Islam Gazi NOT rejected", null);
assert(isNonPersonNameCandidate("Suman Chakraborty") === false, "F: Suman Chakraborty NOT rejected", null);
assert(isNonPersonNameCandidate("Arindam Bose") === false, "F: Arindam Bose NOT rejected", null);
assert(isNonPersonNameCandidate("Sudip Mandal") === false, "F: Sudip Mandal NOT rejected", null);
assert(isNonPersonNameCandidate("Tanmoy Ghosh") === false, "F: Tanmoy Ghosh NOT rejected", null);
assert(isNonPersonNameCandidate("Priya Das") === false, "F: Priya Das NOT rejected", null);

// ---------------------------------------------------------------------------
// CASE G: Degenerate / edge inputs → rejected
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE G: Degenerate inputs → rejected");

assert(isNonPersonNameCandidate("") === true, "G: Empty string rejected", null);
assert(isNonPersonNameCandidate("   ") === true, "G: Whitespace-only rejected", null);
assert(isNonPersonNameCandidate("DOB: 01/01/1990") === true, "G: DOB label rejected", null);
assert(isNonPersonNameCandidate("MALE") === true, "G: Gender label rejected", null);
assert(isNonPersonNameCandidate("Address: 123 Main St") === true, "G: Address label rejected", null);
assert(isNonPersonNameCandidate("1234567890123") === true, "G: Long number rejected", null);

// ---------------------------------------------------------------------------
// CASE H: Stale selection guard — different names have different cache keys
//         (ensures ReviewPanel sequence-ID logic is meaningful)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE H: Different names → different cache keys (stale guard basis)");

const nameA = "Reshma Khatun";
const nameB = "Mohammad Islam Gazi";
const keyA = nameA.trim().toLowerCase();
const keyB = nameB.trim().toLowerCase();
assert(keyA !== keyB, "H: Reshma Khatun and Mohammad Islam Gazi have distinct cache keys", { keyA, keyB });

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log("==========================================================================");
console.log(`BENGALI TRANSLITERATOR TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log("==========================================================================");
console.log("");
console.log("ℹ️  NOTE: Phonetic engine tests (suggestBengaliNames) have been removed.");
console.log("   Production Bengali suggestions now come from Google Input Tools.");
console.log("   See test-google-input-tools.ts for the full mocked test suite.");

if (failed > 0) process.exit(1);
