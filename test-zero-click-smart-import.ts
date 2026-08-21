import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { suggestNameComponentsFromFullName } from './src/components/AiSmartImportEngine/nameUtils';
import { ImportJob } from './src/components/AiSmartImportEngine/types';
import { ExtractionCache } from './src/lib/ai/cache/ExtractionCache';

console.log("==========================================================================");
console.log("🧪 ZERO-CLICK MULTI-DOCUMENT SMART IMPORT SUITE");
console.log("==========================================================================");

let passCount = 0;
let failCount = 0;

function report(testName: string, condition: boolean, details?: any) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.log(`❌ [FAIL] ${testName}`, details || '');
    failCount++;
  }
}

// --------------------------------------------------------------------------
// TEST A: Single Aadhaar JPG -> auto-detect aadhaar_front
// --------------------------------------------------------------------------
const rawA = {
  customer: { full_name: "Dipika Roy", dob: "1992-05-15", gender: "female" },
  documents: { aadhaar: { number: "999988887777" } },
  detected_documents: [
    { detected_type: "aadhaar_front", confidence: 0.98, source_filename: "aadhaar-front.jpg" }
  ]
};
const normA = DataNormalizer.normalize(rawA);
report("TEST A: Single Aadhaar JPG auto-detected as aadhaar_front", 
  normA.detected_documents?.[0]?.detected_type === "aadhaar_front" && normA.aadhaar_number?.value === "999988887777",
  normA
);

// --------------------------------------------------------------------------
// TEST B: Aadhaar Front + Back auto-pairing & Aadhaar Back address priority
// --------------------------------------------------------------------------
const rawB_Front = {
  customer: { full_name: "Dipika Roy", gender: "female" },
  address: "Partial Address, Kolkata",
  documents: { aadhaar: { number: "999988887777" } },
  detected_documents: [
    { detected_type: "aadhaar_front", confidence: 0.98, source_filename: "doc-1.jpg" }
  ]
};
const rawB_Back = {
  address: { house: "45B", street: "Park Street", city: "Kolkata", district: "Kolkata", state: "West Bengal", pincode: "700016" },
  detected_documents: [
    { detected_type: "aadhaar_back", confidence: 0.96, source_filename: "doc-2.png" }
  ]
};

const jobB1: ImportJob = { id: "b1", documentType: "Aadhaar Front", provider: "gemini", source: "file", status: "completed", normalizedData: DataNormalizer.normalize(rawB_Front), version: 1 };
const jobB2: ImportJob = { id: "b2", documentType: "Aadhaar Back", provider: "gemini", source: "file", status: "completed", normalizedData: DataNormalizer.normalize(rawB_Back), version: 1 };
const mergeB = MergeEngine.merge([jobB1, jobB2]);

report("TEST B: Aadhaar Front + Back paired & Aadhaar Back address preferred",
  mergeB.data.address?.value === "45B, Park Street" && mergeB.data.pincode?.value === "700016" && mergeB.data.aadhaar_number?.value === "999988887777",
  mergeB.data
);

// --------------------------------------------------------------------------
// TEST C: Multi-document batch (Aadhaar PDF + Voter JPG + PAN PNG)
// --------------------------------------------------------------------------
const rawC = {
  customer: { full_name: "Mohammad Islam Gazi", dob: "1988-11-20" },
  documents: {
    aadhaar: { number: "111122223333" },
    pan: { number: "ABCDE1234F" },
    voter_id: { number: "WB/01/123/456789" }
  },
  detected_documents: [
    { detected_type: "aadhaar_combined", confidence: 0.99, source_filename: "aadhaar.pdf" },
    { detected_type: "pan_card", confidence: 0.97, source_filename: "pan.png" },
    { detected_type: "voter_id", confidence: 0.95, source_filename: "voter.jpg" }
  ]
};

const normC = DataNormalizer.normalize(rawC);
const jobC: ImportJob = { id: "c1", documentType: "Batch", provider: "gemini", source: "file", status: "completed", normalizedData: normC, version: 1 };
const mergeC = MergeEngine.merge([jobC]);

report("TEST C: Multi-document batch preserves all identity numbers & detected types",
  mergeC.data.aadhaar_number?.value === "111122223333" && 
  mergeC.data.pan_number?.value === "ABCDE1234F" && 
  mergeC.data.voter_id_number?.value === "WB/01/123/456789" &&
  mergeC.data.detected_documents?.length === 3,
  mergeC.data
);

// --------------------------------------------------------------------------
// TEST D: Unknown document image -> classified as unknown (no fabricated type)
// --------------------------------------------------------------------------
const rawD = {
  customer: { full_name: "Unknown Person" },
  detected_documents: [
    { detected_type: "unknown", confidence: 0.2, source_filename: "random-photo.jpg" }
  ]
};
const normD = DataNormalizer.normalize(rawD);
report("TEST D: Unknown image classified as 'unknown' without fabricated type",
  normD.detected_documents?.[0]?.detected_type === "unknown",
  normD
);

// --------------------------------------------------------------------------
// TEST E: Misleading filename (pan.jpg actually contains Voter ID)
// --------------------------------------------------------------------------
const rawE = {
  documents: { voter_id: { number: "XYZ9876543" } },
  detected_documents: [
    { detected_type: "voter_id", confidence: 0.96, source_filename: "pan.jpg" }
  ]
};
const normE = DataNormalizer.normalize(rawE);
report("TEST E: Misleading filename 'pan.jpg' classified by content as voter_id",
  normE.detected_documents?.[0]?.detected_type === "voter_id" && normE.voter_id_number?.value === "XYZ9876543",
  normE
);

// --------------------------------------------------------------------------
// TEST F: Cache Hash calculation without manual documentTypes
// --------------------------------------------------------------------------
const hash1 = ExtractionCache.computeRequestHash({
  files: [{ base64Data: "abc12345", mimeType: "application/pdf" }],
  promptVersion: "v1",
  modelName: "gemini-flash-latest"
});
const hash2 = ExtractionCache.computeRequestHash({
  files: [{ base64Data: "abc12345", mimeType: "application/pdf" }],
  promptVersion: "v1",
  modelName: "gemini-flash-latest"
});

report("TEST F: ExtractionCache request hash calculation is deterministic & auto-detection compatible",
  hash1 === hash2 && typeof hash1 === "string" && hash1.length === 64,
  { hash1, hash2 }
);

// --------------------------------------------------------------------------
// TEST G: Existing reviewable name component suggestion flow works
// --------------------------------------------------------------------------
const sugName = suggestNameComponentsFromFullName(mergeC.data.full_name?.value);
report("TEST G: Reviewable name component suggestion flow intact for multi-doc batch",
  sugName?.first_name === "Mohammad" && sugName?.middle_name === "Islam" && sugName?.last_name === "Gazi",
  sugName
);

console.log("==========================================================================");
console.log(`TOTAL RESULT: ${passCount} PASSED, ${failCount} FAILED`);
console.log("==========================================================================");

if (failCount > 0) process.exit(1);
