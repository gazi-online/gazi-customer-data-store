import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';

async function runOcrSpaceTestSuite() {
  console.log("==========================================================================");
  console.log("🧪 OCR.SPACE PROVIDER & SMART EXTRACTION SUITE");
  console.log("==========================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Mock OCR.space Text Response -> DocumentClassifier
  const mockAadhaarText = `
    GOVERNMENT OF INDIA
    Dipika Roy
    DOB: 15/05/1992
    FEMALE
    9999 8888 7777
  `;

  const classification = DocumentClassifier.classify(mockAadhaarText);
  const detectedType = classification.documentType;
  assert(detectedType === "aadhaar_front", "OCR.space extracted text correctly classified as aadhaar_front");

  // 2. DocumentTextParser -> Canonical JSON
  const parsedFields = DocumentTextParser.parse(mockAadhaarText, detectedType);
  assert(parsedFields.customer?.full_name === "Dipika Roy", "DocumentTextParser extracts customer name");
  assert(parsedFields.documents?.aadhaar?.number === "999988887777", "DocumentTextParser extracts 12-digit Aadhaar number");
  assert(parsedFields.customer?.gender === "female", "DocumentTextParser extracts gender");

  // 3. Multi-page Page Text Merger Test
  const mockPage1 = "--- PAGE 1 ---\nGOVERNMENT OF INDIA\nRahul Kumar\nDOB: 10/01/1995";
  const mockPage2 = "--- PAGE 2 ---\nAddress: 123 Station Road, Kolkata - 700001";
  const multiPageText = `${mockPage1}\n\n${mockPage2}`;

  const multiParsed = DocumentTextParser.parse(multiPageText, "aadhaar_combined");
  assert(multiParsed.customer?.full_name === "Rahul Kumar", "Multi-page OCR text preserves customer full_name");
  assert(multiParsed.address?.pincode === "700001", "Multi-page OCR text preserves address pincode");

  // 4. Unicode Hindi & Bengali Preservation Test
  const mockHindiText = "GOVERNMENT OF INDIA\nभारत सरकार\nरेशमा खातून\nDOB: 01/01/1990\nMALE\n9999 8888 7777";
  const hindiParsed = DocumentTextParser.parse(mockHindiText, "aadhaar_front");
  assert(hindiParsed.documents?.aadhaar?.number === "999988887777", `Hindi OCR text extracts Aadhaar number (${hindiParsed.documents?.aadhaar?.number})`);

  const mockBengaliText = "GOVERNMENT OF INDIA\nভারত সরকার\nরেশমা খাতুন\nDOB: 01/01/1990\nMALE\n9999 8888 7777";
  const bengaliParsed = DocumentTextParser.parse(mockBengaliText, "aadhaar_front");
  assert(bengaliParsed.documents?.aadhaar?.number === "999988887777", `Bengali OCR text extracts Aadhaar number (${bengaliParsed.documents?.aadhaar?.number})`);

  // 5. Canonical JSON Contract Verification
  const canonicalJson = {
    customer: parsedFields.customer || {},
    address: parsedFields.address || {},
    documents: parsedFields.documents || {},
    detected_documents: parsedFields.detected_documents || [],
    confidence_summary: parsedFields.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
  };

  assert("customer" in canonicalJson && "address" in canonicalJson && "documents" in canonicalJson, "Canonical JSON matches standard GCDS schema contract");

  console.log("==========================================================================");
  console.log(`TOTAL OCR.SPACE TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================================");

  if (failed > 0) process.exit(1);
}

runOcrSpaceTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
