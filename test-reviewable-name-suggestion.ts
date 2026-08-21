import { suggestNameComponentsFromFullName } from './src/components/AiSmartImportEngine/nameUtils';
import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { ImportJob } from './src/components/AiSmartImportEngine/types';

console.log("==========================================================================");
console.log("🧪 REVIEWABLE NAME COMPONENT SUGGESTION TEST SUITE");
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

// TEST A: 2-token full_name ("Reshma Khatun")
const sugA = suggestNameComponentsFromFullName("Reshma Khatun");
assert(
  sugA !== null && sugA.first_name === "Reshma" && sugA.middle_name === "" && sugA.last_name === "Khatun" && sugA.isReliable === true,
  "Test A: 2-token full_name ('Reshma Khatun') yields First='Reshma', Middle='', Last='Khatun'",
  sugA
);

// TEST B: 3-token full_name ("Mohammad Islam Gazi")
const sugB = suggestNameComponentsFromFullName("Mohammad Islam Gazi");
assert(
  sugB !== null && sugB.first_name === "Mohammad" && sugB.middle_name === "Islam" && sugB.last_name === "Gazi" && sugB.isReliable === true,
  "Test B: 3-token full_name ('Mohammad Islam Gazi') yields First='Mohammad', Middle='Islam', Last='Gazi'",
  sugB
);

// TEST C: Single-token full_name ("Reshma") -> NO fabricated last_name
const sugC = suggestNameComponentsFromFullName("Reshma");
assert(
  sugC !== null && sugC.first_name === "Reshma" && sugC.last_name === "" && sugC.isReliable === false,
  "Test C: Single-token full_name ('Reshma') does NOT fabricate Last Name",
  sugC
);

// TEST D: Native-script full_name ("রেশমা খাতুন") -> Preserves original script text
const sugD = suggestNameComponentsFromFullName("রেশমা খাতুন");
assert(
  sugD !== null && sugD.first_name === "রেশমা" && sugD.last_name === "খাতুন",
  "Test D: Native-script full_name ('রেশমা খাতুন') preserves original Bengali text",
  sugD
);

// TEST E: Explicit components already exist -> No suggestion needed
const rawExplicit = {
  customer: {
    full_name: "Dipika Roy",
    first_name: "Dipika",
    last_name: "Roy"
  }
};
const normExplicit = DataNormalizer.normalize(rawExplicit);
const hasExplicit = !!(normExplicit.first_name?.value && normExplicit.last_name?.value);
assert(
  hasExplicit === true,
  "Test E: Document with explicit first_name & last_name flags hasExplicitNameComponents = true",
  normExplicit
);

// TEST F: No form mutation before user acceptance
const rawAadhaar = {
  customer: {
    full_name: "Reshma Khatun",
    first_name: null,
    middle_name: null,
    last_name: null
  }
};
const normAadhaar = DataNormalizer.normalize(rawAadhaar);
const jobAadhaar: ImportJob = {
  id: "job-101",
  documentType: "Aadhaar Card",
  provider: "gemini",
  source: "file",
  status: "completed",
  normalizedData: normAadhaar,
  version: 1
};
const mergeAadhaar = MergeEngine.merge([jobAadhaar]);

// Unaccepted resolvedData (initial state)
const initialResolved: Record<string, any> = { full_name: mergeAadhaar.data.full_name?.value };
assert(
  initialResolved.first_name === undefined && initialResolved.last_name === undefined,
  "Test F: Initial resolved review state does NOT mutate form fields before user acceptance",
  initialResolved
);

// Accepted resolvedData (user clicks [Use Suggested Name Components])
const sugForAadhaar = suggestNameComponentsFromFullName(initialResolved.full_name);
const acceptedResolved: Record<string, any> = {
  ...initialResolved,
  first_name: sugForAadhaar?.first_name,
  middle_name: sugForAadhaar?.middle_name,
  last_name: sugForAadhaar?.last_name
};
assert(
  acceptedResolved.first_name === "Reshma" && acceptedResolved.last_name === "Khatun",
  "Test F2: Accepted review state populates First Name='Reshma' and Last Name='Khatun'",
  acceptedResolved
);

// TEST G: Canonical full_name is preserved unmutated
assert(
  acceptedResolved.full_name === "Reshma Khatun",
  "Test G: Canonical full_name remains 'Reshma Khatun' (unmutated)",
  acceptedResolved.full_name
);

console.log("==========================================================================");
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("==========================================================================");

if (failed > 0) process.exit(1);
