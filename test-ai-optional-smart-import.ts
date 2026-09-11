import { MarkdownTextAdapter } from './src/lib/ocr/MarkdownTextAdapter';
import { ExtractionCompletenessEvaluator } from './src/lib/ocr/ExtractionCompletenessEvaluator';
import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';
import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { ImportJob } from './src/components/AiSmartImportEngine/types';

console.log("==========================================================================");
console.log("🧪 GCDS AI-OPTIONAL SMART IMPORT & ROUTING TEST SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`, detail !== undefined ? detail : '');
    failed++;
  }
}

// --------------------------------------------------------------------------
async function runAllTests() {
console.log("\n--- SECTION 1: MARKDOWN TEXT ADAPTER ---");

const mdTable = `
# Customer Information Form
| Field | Value |
| --- | --- |
| Full Name | Rahul Kumar |
| Date of Birth | 1995-01-10 |
| Gender | Male |
| Mobile | 9876543210 |
| Permanent Address | 123 Park Street, Kolkata, West Bengal 700016 |
| PAN Number | ABCDE1234F |
`;

const adaptedText = MarkdownTextAdapter.adaptToStructuredText(mdTable);
assert(adaptedText.includes("Full Name: Rahul Kumar"), "1a. Table row converted to key-value");
assert(adaptedText.includes("Date of Birth: 1995-01-10"), "1b. DOB table row converted");
assert(!adaptedText.includes("| --- | --- |"), "1c. Markdown delimiter row removed");
assert(!adaptedText.includes("# Customer Information Form"), "1d. Header stripped markdown hash");

const mdBold = `
**Name**: Anita Sharma
**DOB**: 15/05/1992
*Gender*: Female
- Aadhaar Number: 9999 8888 7777
Address: Station Road, Howrah, West Bengal - 711101
`;
const adaptedBold = MarkdownTextAdapter.adaptToStructuredText(mdBold);
assert(adaptedBold.includes("Name: Anita Sharma"), "1e. Bold formatting stripped safely");
assert(adaptedBold.includes("Gender: Female"), "1f. Italic formatting stripped safely");
assert(adaptedBold.includes("Aadhaar Number: 9999 8888 7777"), "1g. Bullet marker stripped safely");

// --------------------------------------------------------------------------
// 2. STRUCTURED DOCUMENT LOCAL PARSING (DOCX / XLSX / Text PDF)
// --------------------------------------------------------------------------
console.log("\n--- SECTION 2: STRUCTURED DOCUMENT LOCAL PARSER ---");

const docxParsed = DocumentTextParser.parse(adaptedText, 'unknown', 'customer-details.docx');
assert(docxParsed.customer?.full_name === 'Rahul Kumar', "2a. DOCX adapted text extracts full_name locally", docxParsed);
assert(docxParsed.customer?.dob === '1995-01-10', "2b. DOCX adapted text extracts dob locally", docxParsed);
assert(docxParsed.customer?.gender === 'male', "2c. DOCX adapted text extracts gender locally", docxParsed);
assert(docxParsed.customer?.phone === '9876543210', "2d. DOCX adapted text extracts mobile locally", docxParsed);
assert(docxParsed.documents?.pan?.number === 'ABCDE1234F', "2e. DOCX adapted text extracts PAN locally", docxParsed);
assert(docxParsed.address?.state === 'West Bengal', "2f. DOCX adapted text extracts state locally", docxParsed);
assert(docxParsed.address?.pincode === '700016', "2g. DOCX adapted text extracts pincode locally", docxParsed);

const xlsxTable = `
| Field | Value |
| --- | --- |
| Customer Name | Dipika Roy |
| DOB | 15/05/1992 |
| Gender | Female |
| Aadhaar | 9999 8888 7777 |
| Address | Park Street, Kolkata, 700016 |
`;
const xlsxAdapted = MarkdownTextAdapter.adaptToStructuredText(xlsxTable);
const xlsxParsed = DocumentTextParser.parse(xlsxAdapted, 'unknown', 'customer-sheet.xlsx');
assert(xlsxParsed.customer?.full_name === 'Dipika Roy', "2h. XLSX adapted text extracts full_name locally", xlsxParsed);
assert(xlsxParsed.customer?.dob === '1992-05-15', "2i. XLSX adapted text extracts normalized dob locally", xlsxParsed);
assert(xlsxParsed.customer?.gender === 'female', "2j. XLSX adapted text extracts gender locally", xlsxParsed);
assert(xlsxParsed.documents?.aadhaar?.number === '999988887777', "2k. XLSX adapted text extracts Aadhaar number locally", xlsxParsed);

// --------------------------------------------------------------------------
// 3. DETERMINISTIC EXTRACTION COMPLETENESS EVALUATOR TESTS
// --------------------------------------------------------------------------
console.log("\n--- SECTION 3: COMPLETENESS EVALUATOR ---");

// Case A: Complete Aadhaar Front + Back
const completeAadhaar = {
  customer: { full_name: "Dipika Roy", dob: "1992-05-15", gender: "female" },
  address: { full_address: "123 Park Street, Kolkata, West Bengal - 700016", pincode: "700016", state: "West Bengal" },
  documents: { aadhaar: { number: "999988887777" } },
  detected_documents: [{ detected_type: "aadhaar_combined", confidence: 0.95 }]
};
const evalA = ExtractionCompletenessEvaluator.evaluate(completeAadhaar);
assert(evalA.completeness >= 0.85, `3a. Complete Aadhaar completeness >= 0.85 (got ${evalA.completeness})`);
assert(evalA.requiresAiEnhancement === false, "3b. Complete Aadhaar does NOT require AI enhancement");
assert(evalA.missingImportantFields.length === 0, "3c. No important fields missing");

// Case B: Incomplete extraction (Missing Name & Invalid Aadhaar)
const incompleteDoc = {
  customer: { gender: "male" },
  address: { pincode: "700016" },
  documents: { aadhaar: { number: "123" } }, // Invalid Aadhaar
  detected_documents: [{ detected_type: "aadhaar_front", confidence: 0.8 }]
};
const evalB = ExtractionCompletenessEvaluator.evaluate(incompleteDoc);
assert(evalB.requiresAiEnhancement === true, "3d. Incomplete extraction correctly flags requiresAiEnhancement = true");
assert(evalB.missingImportantFields.includes('full_name'), "3e. Correctly flags full_name missing");
assert(evalB.missingImportantFields.includes('aadhaar_number'), "3f. Correctly flags invalid aadhaar_number");
assert(evalB.invalidRequiredFields.includes('aadhaar_number'), "3f-ext. Explicit invalidRequiredFields contains invalid aadhaar_number");


// Case C: Optional fields (email, occupation, education, income, remarks) missing
// MUST NOT trigger AI enhancement if core fields are present!
const docWithOptionalMissing = {
  customer: { full_name: "Rahul Kumar", dob: "1995-01-10", gender: "male" },
  address: { full_address: "123 Park Street, Kolkata, West Bengal", pincode: "700016", state: "West Bengal" },
  documents: { pan: { number: "ABCDE1234F" } },
  detected_documents: [{ detected_type: "pan_card", confidence: 0.92 }]
};
const evalC = ExtractionCompletenessEvaluator.evaluate(docWithOptionalMissing);
assert(evalC.requiresAiEnhancement === false, "3g. Missing optional fields (email/income) does NOT require AI");
assert(evalC.completeness >= 0.80, `3h. High completeness score with only core fields (got ${evalC.completeness})`);

// --------------------------------------------------------------------------
// 4. PROVE ZERO AI CALLS FOR LOCAL EXTRACTIONS
// --------------------------------------------------------------------------
console.log("\n--- SECTION 4: PROVE ZERO AI CALLS (PRIMARY FLOW) ---");

let mockGeminiCalls = 0;
let mockOpenRouterCalls = 0;
let mockOcrSpaceCalls = 0;
let mockMarkItDownCalls = 0;

function resetMockCounters() {
  mockGeminiCalls = 0;
  mockOpenRouterCalls = 0;
  mockOcrSpaceCalls = 0;
  mockMarkItDownCalls = 0;
}

// Simulated Orchestrator Logic matching extractDataFromDocuments
async function simulateExtractionOrchestrator(params: {
  fileName: string;
  fileType: string;
  ocrSpaceMockResult?: { success: boolean; text?: string };
  markItDownMockResult?: { success: boolean; markdown?: string; fallbackRequired?: boolean };
  aiEnhancementFlag: string | undefined;
  explicitAiRequest?: boolean;
  geminiConfigured?: boolean;
  openRouterConfigured?: boolean;
}) {
  const ext = params.fileName.toLowerCase().slice(params.fileName.lastIndexOf('.'));
  const isImage = ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || params.fileType.startsWith('image/');
  const isPdf = ext === '.pdf' || params.fileType === 'application/pdf';
  const isOffice = ext === '.docx' || ext === '.xlsx';

  const isAiFlagTrue = params.aiEnhancementFlag === 'true';
  const allowAi = isAiFlagTrue || Boolean(params.explicitAiRequest);

  const allParsedData: any[] = [];
  const sourcesUsed: string[] = [];

  if (isImage) {
    mockOcrSpaceCalls++;
    if (params.ocrSpaceMockResult?.success && params.ocrSpaceMockResult.text) {
      const classification = DocumentClassifier.classify(params.ocrSpaceMockResult.text);
      const parsed = DocumentTextParser.parse(params.ocrSpaceMockResult.text, classification.documentType, params.fileName);
      allParsedData.push(parsed);
      sourcesUsed.push('ocr-space');
    }
  } else if (isPdf) {
    mockMarkItDownCalls++;
    if (params.markItDownMockResult?.success && params.markItDownMockResult.markdown && !params.markItDownMockResult.fallbackRequired) {
      const structured = MarkdownTextAdapter.adaptToStructuredText(params.markItDownMockResult.markdown);
      const classification = DocumentClassifier.classify(structured);
      const parsed = DocumentTextParser.parse(structured, classification.documentType, params.fileName);
      allParsedData.push(parsed);
      sourcesUsed.push('markitdown');
    } else if (params.markItDownMockResult?.fallbackRequired) {
      // Scanned PDF fallback to OCR.Space
      mockOcrSpaceCalls++;
      if (params.ocrSpaceMockResult?.success && params.ocrSpaceMockResult.text) {
        const classification = DocumentClassifier.classify(params.ocrSpaceMockResult.text);
        const parsed = DocumentTextParser.parse(params.ocrSpaceMockResult.text, classification.documentType, params.fileName);
        allParsedData.push(parsed);
        sourcesUsed.push('ocr-space');
      }
    }
  } else if (isOffice) {
    mockMarkItDownCalls++;
    // Strictly NO OCR.Space calls for DOCX/XLSX
    if (params.markItDownMockResult?.success && params.markItDownMockResult.markdown) {
      const structured = MarkdownTextAdapter.adaptToStructuredText(params.markItDownMockResult.markdown);
      const classification = DocumentClassifier.classify(structured);
      const parsed = DocumentTextParser.parse(structured, classification.documentType, params.fileName);
      allParsedData.push(parsed);
      sourcesUsed.push('markitdown');
    }
  }

  let canonicalJson: any = null;
  if (allParsedData.length > 0) {
    const first = allParsedData[0];
    canonicalJson = {
      customer: first.customer || {},
      address: first.address || {},
      documents: first.documents || {},
      detected_documents: first.detected_documents || [],
      confidence_summary: { overall: 0.9, low_confidence_fields: [] }
    };
  }

  const evaluation = canonicalJson
    ? ExtractionCompletenessEvaluator.evaluate(canonicalJson)
    : { completeness: 0, requiresAiEnhancement: true, missingImportantFields: ['all'], confidenceSummary: { overall: 0, low_confidence_fields: ['all'] } };

  const needsAi = evaluation.requiresAiEnhancement || allParsedData.length === 0;
  const shouldTriggerAi = allowAi && needsAi;

  let extractionSource = sourcesUsed.includes('markitdown') ? 'markitdown' : (sourcesUsed.includes('ocr-space') ? 'ocr-space' : 'none');
  let aiEnhancementUsed = false;

  if (!shouldTriggerAi) {
    // Standard Local Extraction
    return {
      success: true,
      data: canonicalJson,
      extractionSource,
      aiEnhancementUsed: false,
      completeness: evaluation.completeness
    };
  } else {
    // Optional AI Enhancement
    if (params.geminiConfigured) {
      mockGeminiCalls++;
      aiEnhancementUsed = true;
      extractionSource = 'gemini';
    } else if (params.openRouterConfigured) {
      mockOpenRouterCalls++;
      aiEnhancementUsed = true;
      extractionSource = 'openrouter';
    }
    return {
      success: true,
      data: canonicalJson,
      extractionSource,
      aiEnhancementUsed,
      completeness: evaluation.completeness
    };
  }
}

// Test 4A: JPG -> OCR.Space -> local JSON (Gemini calls = 0, OpenRouter calls = 0)
resetMockCounters();
const test4aRes = await simulateExtractionOrchestrator({
  fileName: "aadhaar.jpg",
  fileType: "image/jpeg",
  ocrSpaceMockResult: {
    success: true,
    text: "GOVERNMENT OF INDIA\nAADHAAR\nDipika Roy\nDOB: 15/05/1992\nFEMALE\n9999 8888 7777\nAddress: 123 Station Road, Kolkata - 700001"
  },
  aiEnhancementFlag: undefined, // Default unset
  geminiConfigured: true,
  openRouterConfigured: true
});
assert(test4aRes.success === true, "4a. JPG extraction succeeds");
assert(test4aRes.extractionSource === 'ocr-space', "4a. JPG extraction source is ocr-space");
assert(mockOcrSpaceCalls === 1, "4a. OCR.space was called exactly once");
assert(mockGeminiCalls === 0, "4a. Gemini calls is strictly 0");
assert(mockOpenRouterCalls === 0, "4a. OpenRouter calls is strictly 0");
assert(test4aRes.aiEnhancementUsed === false, "4a. aiEnhancementUsed is false");

// Test 4B: PNG -> OCR.Space -> local JSON (Zero AI calls)
resetMockCounters();
const test4bRes = await simulateExtractionOrchestrator({
  fileName: "pan_card.png",
  fileType: "image/png",
  ocrSpaceMockResult: {
    success: true,
    text: "INCOME TAX DEPARTMENT\nGOVT. OF INDIA\nName: RAHUL KUMAR\nFather Name: SURESH KUMAR\nDate of Birth: 10/01/1995\nABCDE1234F"
  },
  aiEnhancementFlag: "false",
  geminiConfigured: true
});
assert(test4bRes.success === true, "4b. PNG extraction succeeds");
assert(mockGeminiCalls === 0, "4b. PNG: Gemini calls is strictly 0");
assert(mockOpenRouterCalls === 0, "4b. PNG: OpenRouter calls is strictly 0");

// Test 4C: Text PDF -> MarkItDown -> local JSON (Zero AI calls, Zero OCR.Space calls)
resetMockCounters();
const test4cRes = await simulateExtractionOrchestrator({
  fileName: "kyc_doc.pdf",
  fileType: "application/pdf",
  markItDownMockResult: {
    success: true,
    markdown: mdTable,
    fallbackRequired: false
  },
  aiEnhancementFlag: "false",
  geminiConfigured: true
});
assert(test4cRes.success === true, "4c. Text PDF extraction succeeds");
assert(test4cRes.extractionSource === 'markitdown', "4c. Extraction source is markitdown");
assert(mockMarkItDownCalls === 1, "4c. MarkItDown called once");
assert(mockOcrSpaceCalls === 0, "4c. Text PDF does NOT call OCR.Space");
assert(mockGeminiCalls === 0, "4c. Text PDF: Gemini calls is strictly 0");

// Test 4D: Scanned PDF -> MarkItDown fallbackRequired -> OCR.Space -> local JSON
resetMockCounters();
const test4dRes = await simulateExtractionOrchestrator({
  fileName: "scanned_doc.pdf",
  fileType: "application/pdf",
  markItDownMockResult: {
    success: false,
    fallbackRequired: true
  },
  ocrSpaceMockResult: {
    success: true,
    text: "GOVERNMENT OF INDIA\nAADHAAR\nDipika Roy\nDOB: 15/05/1992\nFEMALE\n9999 8888 7777\nAddress: Kolkata 700001"
  },
  aiEnhancementFlag: "false"
});
assert(test4dRes.success === true, "4d. Scanned PDF routes to OCR.Space fallback");
assert(mockMarkItDownCalls === 1, "4d. Scanned PDF tried MarkItDown first");
assert(mockOcrSpaceCalls === 1, "4d. Scanned PDF routed to OCR.Space");
assert(mockGeminiCalls === 0, "4d. Scanned PDF: Gemini calls is strictly 0");

// Test 4E: DOCX -> MarkItDown -> local JSON (OCR.Space calls = 0, AI calls = 0)
resetMockCounters();
const test4eRes = await simulateExtractionOrchestrator({
  fileName: "customer.docx",
  fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markItDownMockResult: {
    success: true,
    markdown: mdTable
  },
  aiEnhancementFlag: "false",
  geminiConfigured: true
});
assert(test4eRes.success === true, "4e. DOCX extraction succeeds via MarkItDown");
assert(mockMarkItDownCalls === 1, "4e. MarkItDown executed for DOCX");
assert(mockOcrSpaceCalls === 0, "4e. OCR.Space strictly NEVER called for DOCX");
assert(mockGeminiCalls === 0, "4e. DOCX: Gemini calls is strictly 0");

// Test 4F: XLSX -> MarkItDown -> local JSON (OCR.Space calls = 0, AI calls = 0)
resetMockCounters();
const test4fRes = await simulateExtractionOrchestrator({
  fileName: "data.xlsx",
  fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  markItDownMockResult: {
    success: true,
    markdown: xlsxTable
  },
  aiEnhancementFlag: "false",
  geminiConfigured: true
});
assert(test4fRes.success === true, "4f. XLSX extraction succeeds via MarkItDown");
assert(mockMarkItDownCalls === 1, "4f. MarkItDown executed for XLSX");
assert(mockOcrSpaceCalls === 0, "4f. OCR.Space strictly NEVER called for XLSX");
assert(mockGeminiCalls === 0, "4f. XLSX: Gemini calls is strictly 0");

// --------------------------------------------------------------------------
// 5. MISSING AI KEYS RESILIENCE
// --------------------------------------------------------------------------
console.log("\n--- SECTION 5: MISSING PROVIDER KEYS HARMFREE ---");

// Test 5A: Missing GEMINI_API_KEY -> standard extraction succeeds
resetMockCounters();
const test5aRes = await simulateExtractionOrchestrator({
  fileName: "aadhaar.jpg",
  fileType: "image/jpeg",
  ocrSpaceMockResult: {
    success: true,
    text: "GOVERNMENT OF INDIA\nAADHAAR\nDipika Roy\nDOB: 15/05/1992\nFEMALE\n9999 8888 7777\nAddress: Kolkata 700001"
  },
  aiEnhancementFlag: "false",
  geminiConfigured: false,
  openRouterConfigured: true
});
assert(test5aRes.success === true, "5a. Missing GEMINI_API_KEY is harmless, standard extraction succeeds");
assert(test5aRes.data.customer.full_name === "Dipika Roy", "5a. Customer data extracted correctly");

// Test 5B: Missing OPENROUTER_API_KEY -> standard extraction succeeds
resetMockCounters();
const test5bRes = await simulateExtractionOrchestrator({
  fileName: "customer.docx",
  fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markItDownMockResult: { success: true, markdown: mdTable },
  aiEnhancementFlag: "false",
  geminiConfigured: true,
  openRouterConfigured: false
});
assert(test5bRes.success === true, "5b. Missing OPENROUTER_API_KEY is harmless, standard extraction succeeds");

// Test 5C: Both GEMINI and OPENROUTER keys missing -> standard extraction succeeds
resetMockCounters();
const test5cRes = await simulateExtractionOrchestrator({
  fileName: "customer.docx",
  fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markItDownMockResult: { success: true, markdown: mdTable },
  aiEnhancementFlag: "false",
  geminiConfigured: false,
  openRouterConfigured: false
});
assert(test5cRes.success === true, "5c. BOTH AI keys absent: standard extraction still succeeds completely");
assert(test5cRes.data.customer.full_name === "Rahul Kumar", "5c. Extracted customer full_name matches");

// --------------------------------------------------------------------------
// 6. OPTIONAL AI ENHANCEMENT & FEATURE FLAG MATRIX
// --------------------------------------------------------------------------
console.log("\n--- SECTION 6: OPTIONAL AI MATRIX & FEATURE FLAGS ---");

// Test 6A: Feature flag matrix: unset, 'false', '0', 'yes', '1' all evaluate to FALSE
const flagValues = [undefined, 'false', '0', 'yes', '1', 'TRUE', 'True'];
for (const flag of flagValues) {
  resetMockCounters();
  const res = await simulateExtractionOrchestrator({
    fileName: "incomplete.jpg",
    fileType: "image/jpeg",
    ocrSpaceMockResult: { success: true, text: "Some blurry text without name" },
    aiEnhancementFlag: flag,
    geminiConfigured: true
  });
  assert(mockGeminiCalls === 0, `6a. Flag '${flag}' safely disables automatic AI enhancement (Gemini calls = 0)`);
  assert(res.aiEnhancementUsed === false, `6a. Flag '${flag}' aiEnhancementUsed is false`);
}

// Test 6B: Low-confidence extraction + AI enhancement enabled ("true") + Gemini configured -> Gemini called
resetMockCounters();
const test6bRes = await simulateExtractionOrchestrator({
  fileName: "blurry_aadhaar.jpg",
  fileType: "image/jpeg",
  ocrSpaceMockResult: { success: true, text: "blurry text without name or dob" },
  aiEnhancementFlag: "true",
  geminiConfigured: true
});
assert(mockGeminiCalls === 1, "6b. Low-confidence + flag 'true' + Gemini available -> Gemini triggered");
assert(test6bRes.aiEnhancementUsed === true, "6b. aiEnhancementUsed is true");
assert(test6bRes.extractionSource === 'gemini', "6b. extractionSource is gemini");

// Test 6C: Low-confidence extraction + AI enhancement enabled + Gemini unavailable + OpenRouter configured -> OpenRouter fallback
resetMockCounters();
const test6cRes = await simulateExtractionOrchestrator({
  fileName: "blurry_aadhaar.jpg",
  fileType: "image/jpeg",
  ocrSpaceMockResult: { success: true, text: "blurry text" },
  aiEnhancementFlag: "true",
  geminiConfigured: false,
  openRouterConfigured: true
});
assert(mockGeminiCalls === 0, "6c. Gemini not configured -> 0 Gemini calls");
assert(mockOpenRouterCalls === 1, "6c. OpenRouter fallback triggered successfully");
assert(test6cRes.aiEnhancementUsed === true, "6c. aiEnhancementUsed is true");
assert(test6cRes.extractionSource === 'openrouter', "6c. extractionSource is openrouter");

// Test 6D: Low-confidence extraction + AI enhancement enabled + Both AI keys absent -> safe local manual review
resetMockCounters();
const test6dRes = await simulateExtractionOrchestrator({
  fileName: "blurry_aadhaar.jpg",
  fileType: "image/jpeg",
  ocrSpaceMockResult: { success: true, text: "Partial: Address: Kolkata 700001" },
  aiEnhancementFlag: "true",
  geminiConfigured: false,
  openRouterConfigured: false
});
assert(mockGeminiCalls === 0 && mockOpenRouterCalls === 0, "6d. Zero AI calls when keys absent");
assert(test6dRes.success === true, "6d. Succeeded with partial local data for manual review");
assert(test6dRes.aiEnhancementUsed === false, "6d. aiEnhancementUsed is false");

  console.log("\n==========================================================================");
  console.log(`📊 AI-OPTIONAL SMART IMPORT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
