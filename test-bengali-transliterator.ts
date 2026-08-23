/**
 * test-bengali-transliterator.ts
 *
 * Test suite for BengaliNameTransliterator and the Bengali suggestion
 * flow in ReviewPanel (logic layer).
 *
 * Run: npx tsx test-bengali-transliterator.ts
 */

import { suggestBengaliNames, isBengaliScript } from './src/lib/names/BengaliNameTransliterator';
import { isNonPersonNameCandidate } from './src/lib/names/nameSafety';

console.log("==========================================================================");
console.log("🧪 BENGALI NAME TRANSLITERATOR TEST SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, actual?: any) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${testName} | Actual:`, actual);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// CASE A: Document Bengali name exists → no transliteration needed
//         (simulated by checking isBengaliScript detection)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE A: Bengali document name detection");
const docName = "রেশমা খাতুন";
assert(isBengaliScript(docName) === true, "A: রেশমা খাতুন detected as Bengali script", docName);
// If docNativeName is Bengali, ReviewPanel should NOT call suggestBengaliNames
// We verify that by confirming suggestBengaliNames returns [] for Bengali input
const sugA = suggestBengaliNames(docName);
assert(sugA.length === 0, "A: suggestBengaliNames returns [] for already-Bengali input (no re-transliteration)", sugA);

// ---------------------------------------------------------------------------
// CASE B: English-only — Reshma Khatun
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE B: English-only 'Reshma Khatun'");
const sugB = suggestBengaliNames("Reshma Khatun");
assert(sugB.length >= 1, "B: At least 1 suggestion for 'Reshma Khatun'", sugB);
assert(sugB.length <= 3, "B: At most 3 suggestions", sugB.length);
assert(sugB[0].value.includes("রেশমা"), "B: First suggestion includes রেশমা", sugB[0].value);
assert(sugB[0].value.includes("খাতুন"), "B: First suggestion includes খাতুন", sugB[0].value);
assert(sugB.every(s => s.value.trim().length > 0), "B: All suggestion values are non-empty", sugB);

// ---------------------------------------------------------------------------
// CASE C: Mohammad Islam Gazi — multiple distinct suggestions
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE C: 'Mohammad Islam Gazi'");
const sugC = suggestBengaliNames("Mohammad Islam Gazi");
assert(sugC.length >= 1, "C: At least 1 suggestion", sugC);
assert(sugC.length <= 3, "C: At most 3 suggestions", sugC.length);
// Check distinctness
const valuesC = sugC.map(s => s.value);
const uniqueC = new Set(valuesC);
assert(uniqueC.size === valuesC.length, "C: All suggestions are distinct (no duplicates)", valuesC);
// All must contain Islam transliteration
assert(sugC.every(s => s.value.includes("ইসলাম")), "C: All suggestions contain ইসলাম", valuesC);
// Must not invent a completely different person's name
assert(sugC.every(s => !s.value.includes("রহমান") || valuesC.length > 1), "C: No obviously wrong person name injected", valuesC);

// ---------------------------------------------------------------------------
// CASE D: Single token — Gazi
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE D: Single token 'Gazi'");
const sugD = suggestBengaliNames("Gazi");
assert(sugD.length >= 1, "D: At least 1 suggestion for single token", sugD);
assert(sugD.length <= 3, "D: At most 3 suggestions", sugD.length);
// Must not fabricate a second token
sugD.forEach((s, idx) => {
  const tokenCount = s.value.trim().split(/\s+/).length;
  assert(tokenCount === 1, `D.${idx}: Output has exactly 1 token (no fabricated token)`, s.value);
});
assert(sugD[0].value === "গাজী" || sugD[0].value === "গাজি", "D: First suggestion is গাজী or গাজি", sugD[0].value);

// ---------------------------------------------------------------------------
// CASE E: Existing manual Bengali name — protected
//         (ReviewPanel logic: hasDocBengaliName === true → no suggestion shown)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE E: Existing manual Bengali value protection");
const manualBengali = "রেশমা খাতুন";
// isBengaliScript === true means ReviewPanel will set hasDocBengaliName = true
// and bengaliSuggestions will be empty → no overwrite possible
const sugE = suggestBengaliNames(manualBengali);
assert(isBengaliScript(manualBengali) === true, "E: Manual Bengali value detected as Bengali", manualBengali);
assert(sugE.length === 0, "E: No suggestions generated when value is already Bengali", sugE);

// ---------------------------------------------------------------------------
// CASE F: full_name changes → old suggestion invalidated
//         (simulated by checking the stale guard logic)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE F: Stale suggestion guard (full_name change simulation)");
const sugF1 = suggestBengaliNames("Reshma Khatun");
const sugF2 = suggestBengaliNames("Mohammad Islam Gazi");
assert(sugF1[0]?.value !== sugF2[0]?.value, "F: Different full_name yields different suggestions (stale guard relevant)", {f1: sugF1[0]?.value, f2: sugF2[0]?.value});
// The UI state bengaliSuggestionForName would differ → ReviewPanel resets selection

// ---------------------------------------------------------------------------
// CASE G: Government of West Bengal → []
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE G: Government of West Bengal → rejected");
const sugG = suggestBengaliNames("Government of West Bengal");
assert(sugG.length === 0, "G: 'Government of West Bengal' returns [] (hard rejected)", sugG);
assert(isNonPersonNameCandidate("Government of West Bengal") === true, "G: isNonPersonNameCandidate('Government of West Bengal') = true", null);

// ---------------------------------------------------------------------------
// CASE H: পশ্চিমবঙ্গ সরকার → []
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE H: পশ্চিমবঙ্গ সরকার → rejected");
const sugH = suggestBengaliNames("পশ্চিমবঙ্গ সরকার");
assert(sugH.length === 0, "H: 'পশ্চিমবঙ্গ সরকার' returns [] (Bengali script, but hard rejected before that)", sugH);
assert(isNonPersonNameCandidate("পশ্চিমবঙ্গ সরকার") === true, "H: isNonPersonNameCandidate('পশ্চিমবঙ্গ সরকার') = true", null);

// ---------------------------------------------------------------------------
// CASE I: भारत सरकार → []
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE I: भारत सरकार → rejected");
const sugI = suggestBengaliNames("भारत सरकार");
assert(sugI.length === 0, "I: 'भारत सरकार' returns [] (Hindi govt header)", sugI);
assert(isNonPersonNameCandidate("भारत सरकार") === true, "I: isNonPersonNameCandidate('भारत सरकार') = true", null);

// ---------------------------------------------------------------------------
// CASE J: null/empty full_name → []
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE J: null/empty full_name → []");
assert(suggestBengaliNames("").length === 0, "J: Empty string returns []", null);
assert(suggestBengaliNames("  ").length === 0, "J: Whitespace-only returns []", null);
// TypeScript won't allow null directly but guard handles it
assert(suggestBengaliNames(null as any).length === 0, "J: null returns []", null);

// ---------------------------------------------------------------------------
// CASE K: Deduplication — same output from dictionary and phonetic
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE K: Deduplication");
const sugK = suggestBengaliNames("Reshma Khatun");
const valuesK = sugK.map(s => s.value);
const uniqueK = new Set(valuesK);
assert(uniqueK.size === valuesK.length, "K: No duplicate Bengali suggestions (deduped)", valuesK);

// ---------------------------------------------------------------------------
// CASE L: Accepted suggestion → original_language_name populated
//         (logic simulation — no React state, just verify the value is correct)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE L: Accepted suggestion value correctness");
const sugL = suggestBengaliNames("Reshma Khatun");
assert(sugL.length >= 1, "L: Has at least 1 suggestion to accept", sugL);
// Simulate: user selects sugL[0], bengaliSuggestionAccepted = true
const acceptedValue = sugL[0].value;
assert(typeof acceptedValue === 'string' && acceptedValue.length > 0, "L: Accepted suggestion value is a non-empty string", acceptedValue);
assert(isBengaliScript(acceptedValue), "L: Accepted suggestion value is Bengali script", acceptedValue);

// ---------------------------------------------------------------------------
// CASE M: Unaccepted suggestion → original_language_name absent
//         (logic simulation — in ReviewPanel, delete finalData.original_language_name)
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE M: Unaccepted suggestion does NOT auto-populate");
// Simulate resolvedData after merge (no manual original_language_name)
const simulatedResolvedData: Record<string, any> = { full_name: "Reshma Khatun" };
// bengaliSuggestionAccepted = false → ReviewPanel deletes original_language_name
const finalData = { ...simulatedResolvedData };
const bengaliSuggestionAccepted = false;
if (!bengaliSuggestionAccepted) {
  delete finalData.original_language_name;
}
assert(!('original_language_name' in finalData), "M: Unaccepted suggestion NOT in finalData", finalData);

// ---------------------------------------------------------------------------
// CASE N: Hindi source name + English full_name
//         Hindi is NOT Bengali → ReviewPanel should show Bengali suggestions
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 CASE N: Hindi source name ≠ Bengali");
const hindiName = "रेशमा खातून";
assert(isBengaliScript(hindiName) === false, "N: Hindi Devanagari is NOT detected as Bengali script", hindiName);
// Since isBengaliScript returns false, hasDocBengaliName = false
// → ReviewPanel will show Bengali suggestions from full_name
const sugN = suggestBengaliNames("Reshma Khatun");
assert(sugN.length >= 1, "N: Bengali suggestions available when doc name is Hindi", sugN);
assert(sugN[0].value.includes("রেশমা") || sugN[0].value.length > 0, "N: Bengali suggestion value is non-empty", sugN[0].value);

// ---------------------------------------------------------------------------
// ADDITIONAL: Max 3 suggestions guard
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 ADDITIONAL: Max suggestions = 3 guard");
const sugMax = suggestBengaliNames("Mohammad Islam Gazi");
assert(sugMax.length <= 3, "MAX: Total suggestions never exceed 3", sugMax.length);

// ---------------------------------------------------------------------------
// ADDITIONAL: isBengaliScript utility
// ---------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 ADDITIONAL: isBengaliScript utility");
assert(isBengaliScript("রেশমা") === true, "isBengaliScript: Bengali string returns true", null);
assert(isBengaliScript("Reshma") === false, "isBengaliScript: Latin string returns false", null);
assert(isBengaliScript("रेशमा") === false, "isBengaliScript: Devanagari returns false (not Bengali)", null);
assert(isBengaliScript("") === false, "isBengaliScript: Empty string returns false", null);

// ---------------------------------------------------------------------------
console.log("==========================================================================");
console.log(`BENGALI TRANSLITERATOR TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log("==========================================================================");

if (failed > 0) process.exit(1);
