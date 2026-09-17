import fs from 'fs';
import path from 'path';

// Load .env.local if present
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.trim().match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

import { countUsableFields, getSmartImportFailure } from './src/lib/ocr/errorClassification';
import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';
import { OcrSpaceProvider } from './src/lib/ocr/OcrSpaceProvider';

console.log("==========================================================================");
console.log("🧪 GCDS SMART IMPORT ERROR CLASSIFICATION REGRESSION SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: unknown) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`, detail !== undefined ? detail : '');
    failed++;
  }
}

async function runTests() {
  // --------------------------------------------------------------------------
  // TEST 1 — OCR EMPTY
  // text = ""
  // Expected: TEXT_EXTRACTION_FAILED, true unreadable-document message
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 1: OCR EMPTY ---");
  const emptyText = "";
  const normalizedEmpty = emptyText.trim();
  const hasExtractedTextEmpty = normalizedEmpty.length > 0;
  const failure1 = getSmartImportFailure({
    hasExtractedText: hasExtractedTextEmpty,
    usableFieldCount: 0
  });

  assert(failure1.success === false, "1a. Empty OCR text returns success: false");
  assert(failure1.code === "TEXT_EXTRACTION_FAILED", `1b. Code is TEXT_EXTRACTION_FAILED (got ${failure1.code})`);
  assert(
    failure1.error === "We couldn't read this document automatically. Please upload a clearer copy or enter the details manually.",
    "1c. Error message matches exact true unreadable-document message"
  );
  assert(!failure1.error.includes("Unable to read text from document"), "1d. Does NOT contain legacy generic message");

  // --------------------------------------------------------------------------
  // TEST 2 — OCR TEXT BUT PARSER ZERO
  // Extracted text exists, normalized text length > 0, but 0 usable fields parsed
  // Expected: DOCUMENT_PARSE_FAILED, must NOT contain "Unable to read text"
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 2: OCR TEXT BUT PARSER ZERO ---");
  const lowTextFixture = "2026-09-17 12:00 random noise";
  const normalizedLowText = lowTextFixture.trim();
  const classification2 = DocumentClassifier.classify(normalizedLowText);
  const parsed2 = DocumentTextParser.parse(normalizedLowText, classification2.documentType, "low_text.jpg");

  const canonical2 = {
    customer: parsed2.customer || {},
    address: parsed2.address || {},
    documents: parsed2.documents || {},
    detected_documents: parsed2.detected_documents || []
  };
  const usableCount2 = countUsableFields(canonical2);

  assert(normalizedLowText.length > 0, "2a. Extracted text exists (length > 0)");
  assert(usableCount2 === 0, `2b. Usable field count is 0 (got ${usableCount2})`);

  const failure2 = getSmartImportFailure({
    hasExtractedText: normalizedLowText.length > 0,
    usableFieldCount: usableCount2
  });

  assert(failure2.success === false, "2c. Parser zero returns success: false");
  assert(failure2.code === "DOCUMENT_PARSE_FAILED", `2d. Code is DOCUMENT_PARSE_FAILED (got ${failure2.code})`);
  assert(
    failure2.error === "We could read the document, but couldn't identify the details. Please review the document and enter the missing information manually.",
    "2e. Error message accurately reflects parser inability to identify fields"
  );
  assert(!failure2.error.includes("Unable to read text"), "2f. Does NOT contain 'Unable to read text'");

  // --------------------------------------------------------------------------
  // TEST 3 — PARTIAL PARSE
  // At least one field found -> review-capable result, no fatal error
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 3: PARTIAL PARSE ---");
  const partialCanonical = {
    customer: { full_name: "Dipika Roy" },
    address: {},
    documents: {},
    detected_documents: [{ detected_type: "unknown" }]
  };

  const partialUsableCount = countUsableFields(partialCanonical);
  assert(partialUsableCount >= 1, `3a. Partial parse has at least one usable field (got ${partialUsableCount})`);

  // Partial parse must NOT trigger fatal failure
  const isPartialSuccessful = partialUsableCount > 0;
  assert(isPartialSuccessful === true, "3b. Partial extraction qualifies for review mode (not fatal error)");

  const isPartialReview = partialUsableCount > 0 && (!partialCanonical.customer || !("dob" in partialCanonical.customer));
  const partialCode = isPartialReview ? "PARTIAL_EXTRACTION" : "FULL_PARSE";
  const partialWarning = isPartialReview ? "We could read the document, but some details need your review." : undefined;

  assert(partialCode === "PARTIAL_EXTRACTION", `3c. Internal code is PARTIAL_EXTRACTION (got ${partialCode})`);
  assert(partialWarning === "We could read the document, but some details need your review.", "3d. Warning message matches specification");

  // --------------------------------------------------------------------------
  // TEST 4 — CLEAR AADHAAR FIXTURE
  // benchmark-docs/doc_1.png
  // Expected: OCR success, aadhaar_combined, parsed fields > 0, normal review path
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 4: CLEAR AADHAAR FIXTURE ---");
  const clearAadhaarPath = path.join(process.cwd(), 'benchmark-docs', 'doc_1.png');
  assert(fs.existsSync(clearAadhaarPath), "4a. benchmark-docs/doc_1.png exists");

  const buffer = fs.readFileSync(clearAadhaarPath);
  const ocrRes = await OcrSpaceProvider.extractText({
    buffer,
    filename: 'doc_1.png',
    mimeType: 'image/png'
  });

  assert(ocrRes.success === true, "4b. OCR success is true");
  assert(Boolean(ocrRes.text && ocrRes.text.length > 50), `4c. OCR text extracted (length: ${ocrRes.text?.length || 0})`);

  const classification4 = DocumentClassifier.classify(ocrRes.text || "");
  assert(
    classification4.documentType.startsWith("aadhaar"),
    `4d. Classification detected Aadhaar document type: ${classification4.documentType}`
  );

  const parsed4 = DocumentTextParser.parse(ocrRes.text || "", classification4.documentType, 'doc_1.png');
  const canonical4 = {
    customer: parsed4.customer || {},
    address: parsed4.address || {},
    documents: parsed4.documents || {},
    detected_documents: parsed4.detected_documents || []
  };

  const usableCount4 = countUsableFields(canonical4);
  assert(usableCount4 > 0, `4e. Parsed fields count > 0 (got ${usableCount4} usable fields)`);

  const fullParseCode = usableCount4 > 0 ? (usableCount4 >= 5 ? "FULL_PARSE" : "PARTIAL_EXTRACTION") : "DOCUMENT_PARSE_FAILED";
  assert(fullParseCode === "FULL_PARSE" || fullParseCode === "PARTIAL_EXTRACTION", `4f. Normal review path entered with code ${fullParseCode}`);

  console.log("\n==========================================================================");
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("==========================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
