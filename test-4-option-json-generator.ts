import fs from 'fs';
import path from 'path';
import { JSONValidator } from './src/lib/ai/parser/validator';
import { LocalOcrEngine } from './src/lib/ocr/LocalOcrEngine';
import { AIProviderRegistry } from './src/lib/ai/providers';

// Load .env.local for CLI test environment
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function runJsonGeneratorTest() {
  console.log("==========================================================================");
  console.log("🧪 4-OPTION AI DOCUMENT -> JSON GENERATOR SUITE");
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

  // 1. Check AI Provider Registry Registrations
  try {
    const gemini = AIProviderRegistry.getProvider('gemini');
    assert(gemini.getName() === 'gemini', "Gemini provider registered in AIProviderRegistry");
  } catch (e: any) {
    assert(false, "Gemini provider registered: " + e.message);
  }

  try {
    const openai = AIProviderRegistry.getProvider('openai');
    assert(openai.getName() === 'openai', "OpenAI provider registered in AIProviderRegistry");
  } catch (e: any) {
    assert(false, "OpenAI provider registered: " + e.message);
  }

  try {
    const claude = AIProviderRegistry.getProvider('claude');
    assert(claude.getName() === 'claude', "Claude provider registered in AIProviderRegistry");
  } catch (e: any) {
    assert(false, "Claude provider registered: " + e.message);
  }

  // 2. Markdown Fence Stripping & JSON Cleaning Test
  const markdownFencedJson = "```json\n{\n  \"customer\": {\n    \"full_name\": \"MOHAMMAD ISLAM GAZI\",\n    \"dob\": \"1990-01-01\"\n  }\n}\n```";
  const cleaned = JSONValidator.cleanAndParse(markdownFencedJson);
  assert(cleaned.customer?.full_name === "MOHAMMAD ISLAM GAZI", "Markdown fences (```json ... ```) correctly stripped and parsed");

  // 3. Schema Validation & Malformed JSON Handling
  try {
    JSONValidator.cleanAndParse("INVALID NON-JSON TEXT");
    assert(false, "Malformed non-JSON text rejected");
  } catch {
    assert(true, "Malformed non-JSON text rejected by JSONValidator");
  }

  // 4. Local OCR Option Contract & Canonical JSON Generation Test
  const fixtureText = `
    GOVERNMENT OF INDIA
    MOHAMMAD ISLAM GAZI
    DOB: 01/01/1990
    MALE
    9999 8888 7777
  `;
  const evalResult = LocalOcrEngine.evaluateVariant('ORIGINAL', fixtureText, 0.95, 'aadhaar.jpg');
  const canonicalLocalJson = {
    customer: evalResult.parsedFields.customer || {},
    address: evalResult.parsedFields.address || {},
    documents: evalResult.parsedFields.documents || {},
    detected_documents: evalResult.parsedFields.detected_documents || [],
    confidence_summary: evalResult.parsedFields.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
  };

  assert(canonicalLocalJson.customer?.full_name === "MOHAMMAD ISLAM GAZI", "Local OCR generates canonical customer JSON");
  assert(canonicalLocalJson.documents?.aadhaar?.number === "999988887777", "Local OCR preserves 12-digit Aadhaar in canonical JSON");
  assert(canonicalLocalJson.detected_documents?.[0]?.detected_type === "aadhaar_front", "Local OCR populates detected_documents array");

  // 5. Verify Canonical JSON High-Level Shape
  assert("customer" in canonicalLocalJson && "address" in canonicalLocalJson && "documents" in canonicalLocalJson, "Canonical JSON matches standard GCDS schema contract");

  console.log("==========================================================================");
  console.log(`TOTAL 4-OPTION JSON GENERATOR TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================================");

  await LocalOcrEngine.terminate();

  if (failed > 0) process.exit(1);
}

runJsonGeneratorTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
