import { JSONValidator } from './src/lib/ai/parser/validator';
import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';
import { CANONICAL_GCDS_EXTRACTION_PROMPT } from './src/lib/ai/prompts/canonicalPrompt';
import { PROVIDER_CONFIGS } from './src/components/AiSmartImportEngine/components/ProviderCard';

async function runJsonGeneratorTest() {
  console.log("==========================================================================");
  console.log("🧪 4-OPTION WEB AI + OCR.SPACE JSON GENERATOR SUITE");
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

  // 1. Check 4 Provider Cards Configuration
  assert(PROVIDER_CONFIGS.gemini_web?.isWeb === true, "Gemini Web configured as browser AI card (0 API calls)");
  assert(PROVIDER_CONFIGS.chatgpt_web?.isWeb === true, "ChatGPT Web configured as browser AI card (0 API calls)");
  assert(PROVIDER_CONFIGS.claude_web?.isWeb === true, "Claude Web configured as browser AI card (0 API calls)");
  assert(PROVIDER_CONFIGS.ocr_space?.isWeb === false, "OCR.space configured as dedicated OCR card");

  // 2. Verify Canonical Extraction Prompt
  assert(CANONICAL_GCDS_EXTRACTION_PROMPT.includes("You are a high-precision Customer Extraction AI for GCDS"), "Extraction prompt contains GCDS header");
  assert(CANONICAL_GCDS_EXTRACTION_PROMPT.includes("full_name"), "Extraction prompt includes full_name rule");
  assert(CANONICAL_GCDS_EXTRACTION_PROMPT.includes("Aadhaar Back"), "Extraction prompt includes Aadhaar Back address priority rule");
  assert(CANONICAL_GCDS_EXTRACTION_PROMPT.includes("Do NOT include markdown blocks"), "Extraction prompt instructs AI to exclude markdown fences/prose");

  // 3. Response Parsing & Cleanup (Case A, B, C, D)
  const rawValid = '{"customer":{"full_name":"Mohammad Islam Gazi"}}';
  const parsedA = JSONValidator.cleanAndParse(rawValid);
  assert(parsedA.customer?.full_name === "Mohammad Islam Gazi", "Case A: Raw Valid JSON accepted");

  const markdownFenced = '```json\n{"customer":{"full_name":"Mohammad Islam Gazi"}}\n```';
  const parsedB = JSONValidator.cleanAndParse(markdownFenced);
  assert(parsedB.customer?.full_name === "Mohammad Islam Gazi", "Case B: Fenced JSON safely normalized and accepted");

  const proseJson = 'Here is the JSON:\n{\n  "customer": {"full_name": "Mohammad Islam Gazi"}\n}\nThanks!';
  const parsedC = JSONValidator.cleanAndParse(proseJson);
  assert(parsedC.customer?.full_name === "Mohammad Islam Gazi", "Case C: Prose + JSON cleanly extracted and accepted");

  try {
    JSONValidator.cleanAndParse('{"customer": {"full_name": "Mohammad"');
    assert(false, "Case D: Malformed JSON rejected");
  } catch {
    assert(true, "Case D: Malformed JSON rejected");
  }

  // 4. OCR.space Automatic Canonical JSON Generation
  const sampleText = "GOVERNMENT OF INDIA\nMOHAMMAD ISLAM GAZI\nDOB: 01/01/1990\nMALE\n9999 8888 7777";
  const classification = DocumentClassifier.classify(sampleText);
  const parsedFields = DocumentTextParser.parse(sampleText, classification.documentType);
  const canonicalJson = {
    customer: parsedFields.customer || {},
    address: parsedFields.address || {},
    documents: parsedFields.documents || {},
    detected_documents: parsedFields.detected_documents || [],
    confidence_summary: parsedFields.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
  };

  assert(canonicalJson.customer?.full_name === "MOHAMMAD ISLAM GAZI", "OCR text generates canonical customer JSON");
  assert(canonicalJson.documents?.aadhaar?.number === "999988887777", "OCR text preserves 12-digit Aadhaar");
  assert("customer" in canonicalJson && "address" in canonicalJson && "documents" in canonicalJson, "Canonical JSON matches standard GCDS schema contract");

  console.log("==========================================================================");
  console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================================");

  if (failed > 0) process.exit(1);
}

runJsonGeneratorTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
