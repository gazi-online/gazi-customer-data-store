import fs from 'fs';
import path from 'path';
import type { ImportJob } from './src/components/AiSmartImportEngine/types';

// Load .env.local stripping \r
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const cleanLine = line.replace(/\r/g, '').trim();
    const match = cleanLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

async function runRegressionTests() {
  const { DataNormalizer } = await import('./src/components/AiSmartImportEngine/DataNormalizer');
  const { MergeEngine } = await import('./src/components/AiSmartImportEngine/MergeEngine');

  console.log("=================================================");
  console.log(" 🧪 SMART IMPORT ENGINE REGRESSION SUITE        ");
  console.log("=================================================");

  let passCount = 0;

  // Test 1: Valid object response -> normalizedData non-empty
  const validObj = {
    customer: { full_name: "Anita Roy", dob: "1992-05-15", gender: "female" },
    address: { city: "Kolkata", state: "West Bengal", pincode: "700001" },
    documents: { aadhaar: { number: "9876 5432 1098" } }
  };
  const norm1 = DataNormalizer.normalize(validObj);
  if (Object.keys(norm1).length > 0 && norm1.full_name?.value === "Anita Roy") {
    console.log("✅ Test 1: Valid object response -> normalizedData non-empty [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 1 [FAIL]");
  }

  // Test 2: Valid stringified JSON response -> safely parsed
  const validStr = JSON.stringify(validObj);
  const norm2 = DataNormalizer.normalize(validStr);
  if (Object.keys(norm2).length > 0 && norm2.full_name?.value === "Anita Roy") {
    console.log("✅ Test 2: Valid stringified JSON response -> safely parsed [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 2 [FAIL]");
  }

  // Test 3: Malformed JSON -> job not completed / returns empty normalized
  const malformedStr = "{ customer: { full_name: 'Anita Roy' ";
  const norm3 = DataNormalizer.normalize(malformedStr);
  if (Object.keys(norm3).length === 0) {
    console.log("✅ Test 3: Malformed JSON -> returned empty normalized safely [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 3 [FAIL]");
  }

  // Test 4: Empty extraction -> job not completed / empty normalized
  const emptyObj = {};
  const norm4 = DataNormalizer.normalize(emptyObj);
  if (Object.keys(norm4).length === 0) {
    console.log("✅ Test 4: Empty extraction -> returned empty normalized safely [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 4 [FAIL]");
  }

  // Test 5: Cache-hit response -> same normalized result as fresh response
  const freshNorm = DataNormalizer.normalize(validObj);
  const cacheNorm = DataNormalizer.normalize(JSON.stringify(validObj));
  if (JSON.stringify(freshNorm) === JSON.stringify(cacheNorm)) {
    console.log("✅ Test 5: Cache-hit response -> same normalized result as fresh response [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 5 [FAIL]");
  }

  // Test 6: Run Smart Engine after valid extraction -> MergedResult generated
  const testJob: ImportJob = {
    id: "job-test-1",
    documentType: "Aadhaar Front",
    provider: "gemini",
    source: "file",
    status: "completed",
    rawResponse: validObj,
    normalizedData: norm1,
    version: 1
  };
  const mergeRes6 = MergeEngine.merge([testJob]);
  if (Object.keys(mergeRes6.data).length > 0 && mergeRes6.data.full_name?.value === "Anita Roy") {
    console.log("✅ Test 6: Run Smart Engine after valid extraction -> Merged result valid [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 6 [FAIL]");
  }

  // Test 7: Run Smart Engine must never receive completed job with normalizedData = {}
  const emptyJob: ImportJob = {
    id: "job-test-2",
    documentType: "Aadhaar Front",
    provider: "gemini",
    source: "file",
    status: "completed",
    rawResponse: {},
    normalizedData: {},
    version: 1
  };
  const mergeRes7 = MergeEngine.merge([emptyJob]);
  if (Object.keys(mergeRes7.data).length === 0) {
    console.log("✅ Test 7: MergeEngine handles empty job safely (0 data keys) [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 7 [FAIL]");
  }

  console.log("-------------------------------------------------");
  console.log(`TOTAL RESULT: ${passCount}/7 PASSED`);
  if (passCount === 7) {
    console.log("🎉 ALL SMART IMPORT REGRESSION TESTS PASSED!");
  } else {
    process.exit(1);
  }
}

runRegressionTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
