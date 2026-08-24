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
  const TOTAL_TESTS = 14;

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

  // Test 8: Voter ID-only extraction -> normalized & merged correctly
  const voterObj = {
    customer: { full_name: "Vikram Singh" },
    documents: { voter_id: { number: "ABC1234567" } }
  };
  const normVoter = DataNormalizer.normalize(voterObj);
  const voterJob: ImportJob = {
    id: "job-voter-1",
    documentType: "Voter ID",
    provider: "gemini",
    source: "file",
    status: "completed",
    rawResponse: voterObj,
    normalizedData: normVoter,
    version: 1
  };
  const mergeVoter = MergeEngine.merge([voterJob]);
  if (normVoter.voter_id_number?.value === "ABC1234567" && mergeVoter.data.voter_id_number?.value === "ABC1234567") {
    console.log("✅ Test 8: Voter ID-only extraction normalized & merged [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 8 [FAIL]");
  }

  // Test 9: Aadhaar + Voter ID merge -> both aadhaar_number & voter_id_number present
  const mergeAadhaarVoter = MergeEngine.merge([testJob, voterJob]);
  if (mergeAadhaarVoter.data.aadhaar_number?.value === "987654321098" && mergeAadhaarVoter.data.voter_id_number?.value === "ABC1234567") {
    console.log("✅ Test 9: Aadhaar + Voter ID merge preserves both identity numbers [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 9 [FAIL]");
  }

  // Test 10: Conflict between two Voter ID values is surfaced
  const voterObjConflict = {
    customer: { full_name: "Vikram Singh" },
    documents: { voter_id: { number: "XYZ9876543" } }
  };
  const normVoterConflict = DataNormalizer.normalize(voterObjConflict);
  const voterJob2: ImportJob = {
    id: "job-voter-2",
    documentType: "Voter ID",
    provider: "gemini",
    source: "file",
    status: "completed",
    rawResponse: voterObjConflict,
    normalizedData: normVoterConflict,
    version: 2
  };
  const mergeVoterConflict = MergeEngine.merge([voterJob, voterJob2]);
  const voterConflictFound = mergeVoterConflict.conflicts.some(c => c.field === "voter_id_number");
  if (voterConflictFound) {
    console.log("✅ Test 10: Conflict between two Voter ID values surfaced correctly [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 10 [FAIL]");
  }

  // Test 11: Multiline Aadhaar back parser -> DataNormalizer -> MergeEngine -> Final Merged Data contains address, district, state, pincode
  const { DocumentTextParser } = await import('./src/lib/ocr/DocumentTextParser');
  const rawBackOcr = `
    Address:
    C/O Abdul Karim,
    Village ABC,
    P.O. XYZ,
    District - Murshidabad,
    West Bengal - 742123
  `;
  const parsedBack = DocumentTextParser.parse(rawBackOcr, 'aadhaar_back');
  const normBack = DataNormalizer.normalize(parsedBack);
  const backJob: ImportJob = {
    id: "job-aadhaar-back",
    documentType: "Aadhaar Card Back",
    provider: "manual",
    source: "file",
    status: "completed",
    rawResponse: parsedBack,
    normalizedData: normBack,
    version: 1
  };
  const mergeBack = MergeEngine.merge([backJob]);
  if (
    mergeBack.data.address?.value?.includes("C/O Abdul Karim") &&
    mergeBack.data.address?.value?.includes("Village ABC") &&
    mergeBack.data.district?.value === "Murshidabad" &&
    mergeBack.data.state?.value === "West Bengal" &&
    mergeBack.data.pincode?.value === "742123"
  ) {
    console.log("✅ Test 11: Multiline Aadhaar back parsed -> normalized -> merged with full address, district, state, PIN [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 11 [FAIL]", mergeBack.data);
  }

  // Test 12: Aadhaar Front + Back multi-doc -> Aadhaar Back address wins cleanly without conflict
  const rawFrontOcr = `
    GOVERNMENT OF INDIA
    Reshma Khatun
    DOB: 01/01/1990
    FEMALE
    1234 5678 9012
  `;
  const parsedFront = DocumentTextParser.parse(rawFrontOcr, 'aadhaar_front');
  const normFront = DataNormalizer.normalize(parsedFront);
  const frontJob: ImportJob = {
    id: "job-aadhaar-front",
    documentType: "Aadhaar Card Front",
    provider: "manual",
    source: "file",
    status: "completed",
    rawResponse: parsedFront,
    normalizedData: normFront,
    version: 1
  };
  const mergeFrontBack = MergeEngine.merge([frontJob, backJob]);
  if (
    mergeFrontBack.data.full_name?.value === "Reshma Khatun" &&
    mergeFrontBack.data.aadhaar_number?.value === "123456789012" &&
    mergeFrontBack.data.address?.value?.includes("C/O Abdul Karim") &&
    mergeFrontBack.data.district?.value === "Murshidabad" &&
    !mergeFrontBack.conflicts.some(c => c.field === "address")
  ) {
    console.log("✅ Test 12: Aadhaar Front + Back merge gives back address priority without blocking conflict [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 12 [FAIL]", mergeFrontBack.data);
  }

  // Test 13: Null extraction from Front does not erase valid Back address
  const emptyAddressFront = DataNormalizer.normalize({ customer: { full_name: "Reshma Khatun" }, address: {} });
  const frontEmptyJob: ImportJob = {
    id: "job-front-empty",
    documentType: "Aadhaar Card Front",
    provider: "manual",
    source: "file",
    status: "completed",
    rawResponse: {},
    normalizedData: emptyAddressFront,
    version: 1
  };
  const mergeNullProtect = MergeEngine.merge([frontEmptyJob, backJob]);
  if (
    mergeNullProtect.data.address?.value?.includes("C/O Abdul Karim") &&
    mergeNullProtect.data.pincode?.value === "742123"
  ) {
    console.log("✅ Test 13: Null/empty front address does not erase valid back address [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 13 [FAIL]", mergeNullProtect.data);
  }

  // Test 14: Aadhaar with mobile number -> normalized & merged into MergedResult.data.phone
  const rawPhoneOcr = `
    GOVERNMENT OF INDIA
    Reshma Khatun
    DOB: 01/01/1990
    Mobile: 9876543210
    1234 5678 9012
  `;
  const parsedPhone = DocumentTextParser.parse(rawPhoneOcr, 'aadhaar_front');
  const normPhone = DataNormalizer.normalize(parsedPhone);
  const phoneJob: ImportJob = {
    id: "job-phone-test",
    documentType: "Aadhaar Card Front",
    provider: "manual",
    source: "file",
    status: "completed",
    rawResponse: parsedPhone,
    normalizedData: normPhone,
    version: 1
  };
  const mergePhone = MergeEngine.merge([phoneJob]);
  if (mergePhone.data.phone?.value === "9876543210") {
    console.log("✅ Test 14: Aadhaar mobile parsed -> normalized -> merged into primary phone [PASS]");
    passCount++;
  } else {
    console.error("❌ Test 14 [FAIL]", mergePhone.data);
  }

  console.log("-------------------------------------------------");
  console.log(`TOTAL RESULT: ${passCount}/${TOTAL_TESTS} PASSED`);
  if (passCount === TOTAL_TESTS) {
    console.log("🎉 ALL SMART IMPORT REGRESSION TESTS PASSED!");
  } else {
    process.exit(1);
  }
}

runRegressionTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
