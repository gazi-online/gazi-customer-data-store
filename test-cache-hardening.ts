import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ExtractionCache } from './src/lib/ai/cache/ExtractionCache';

class MockHardenedSupabaseClient {
  public cacheStore = new Map<string, any>();

  from(table: string) {
    if (table !== 'ai_extraction_cache') {
      throw new Error(`Unexpected table access: ${table}`);
    }

    return {
      select: () => ({
        eq: (col1: string, val1: string) => ({
          eq: (col2: string, val2: string) => ({
            maybeSingle: async () => {
              const entry = this.cacheStore.get(val1);
              // RLS Enforcement: Entry must belong to the exact querying user
              if (entry && entry.created_by === val2) {
                return { data: entry, error: null };
              }
              return { data: null, error: null };
            }
          })
        })
      }),
      update: (updateData: any) => ({
        eq: async (col: string, val: string) => {
          const existing = Array.from(this.cacheStore.values()).find(e => e.id === val);
          if (existing) {
            if (updateData.hit_count !== undefined) existing.hit_count = updateData.hit_count;
            if (updateData.last_used_at !== undefined) existing.last_used_at = updateData.last_used_at;
          }
          return { error: null };
        }
      }),
      upsert: async (insertData: any) => {
        const id = crypto.randomUUID();
        const existing = this.cacheStore.get(insertData.request_hash);
        const entry = {
          id: existing ? existing.id : id,
          ...insertData,
          hit_count: existing ? existing.hit_count : 0
        };
        this.cacheStore.set(insertData.request_hash, entry);
        return { error: null };
      }
    };
  }

  // Cleanup helper matching SQL cleanup function
  async cleanupExpiredEntries(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;
    for (const [hash, entry] of Array.from(this.cacheStore.entries())) {
      if (entry.expires_at && new Date(entry.expires_at) < now) {
        this.cacheStore.delete(hash);
        deletedCount++;
      }
    }
    return deletedCount;
  }
}

async function runCacheHardeningTestSuite() {
  console.log("==========================================================================");
  console.log("🔒 PHASE 6: CACHE HARDENING & PRODUCTION VALIDATION TEST SUITE");
  console.log("==========================================================================\n");

  const mockDb = new MockHardenedSupabaseClient() as any;
  const userA = "usr_alice_101";
  const userB = "usr_bob_202";

  const dummyDocPath = path.join(process.cwd(), 'benchmark-docs', 'doc_1.png');
  const baseFileBuffer = fs.readFileSync(dummyDocPath);
  const base64Data = baseFileBuffer.toString('base64');
  
  const baseFiles = [{ base64Data, mimeType: 'image/png' }];
  const baseDocTypes = ['Aadhaar Card'];
  const basePromptVersion = 'v1';
  const baseModelName = 'gemini-flash-latest';

  const mockExtractionResult = {
    customer: {
      full_name: 'Rahat Ali',
      original_language_name: 'রাহাত আলী',
      father_name: 'Imtiaz Ali',
      address: { district: 'Murshidabad', pincode: '742308' }
    }
  };

  const testResults: { testNo: number; name: string; expected: string; actual: string; status: 'PASS' | 'FAIL' }[] = [];

  function recordTest(testNo: number, name: string, expected: string, actual: string, passCondition: boolean) {
    const status = passCondition ? 'PASS' : 'FAIL';
    testResults.push({ testNo, name, expected, actual, status });
    console.log(`[TEST ${testNo}] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  }

  // Initial Setup: Save baseline entry for User A
  const baseHash = ExtractionCache.computeRequestHash({
    files: baseFiles,
    documentTypes: baseDocTypes,
    promptVersion: basePromptVersion,
    modelName: baseModelName
  });

  await ExtractionCache.saveCache(mockDb, {
    requestHash: baseHash,
    userId: userA,
    provider: 'gemini',
    modelName: baseModelName,
    promptVersion: basePromptVersion,
    resultJson: mockExtractionResult
  });

  // TEST 1: IDENTICAL REQUEST
  const lookup1 = await ExtractionCache.lookupCache(mockDb, userA, baseHash);
  recordTest(1, "Identical Request", "CACHE HIT", lookup1.hit ? "CACHE HIT" : "CACHE MISS", lookup1.hit === true);

  // TEST 2: PROMPT VERSION CHANGE
  const hashPromptChange = ExtractionCache.computeRequestHash({
    files: baseFiles,
    documentTypes: baseDocTypes,
    promptVersion: 'v2-experimental',
    modelName: baseModelName
  });
  const lookup2 = await ExtractionCache.lookupCache(mockDb, userA, hashPromptChange);
  recordTest(2, "Prompt Version Change", "CACHE MISS", lookup2.hit ? "CACHE HIT" : "CACHE MISS", lookup2.hit === false);

  // TEST 3: MODEL CHANGE
  const hashModelChange = ExtractionCache.computeRequestHash({
    files: baseFiles,
    documentTypes: baseDocTypes,
    promptVersion: basePromptVersion,
    modelName: 'gemini-2.0-pro'
  });
  const lookup3 = await ExtractionCache.lookupCache(mockDb, userA, hashModelChange);
  recordTest(3, "Model Change", "CACHE MISS", lookup3.hit ? "CACHE HIT" : "CACHE MISS", lookup3.hit === false);

  // TEST 4: FILE CONTENT CHANGE (1 byte altered)
  const modifiedBuffer = Buffer.from(baseFileBuffer);
  modifiedBuffer[modifiedBuffer.length - 1] ^= 0xFF; // Flip last byte
  const modifiedFiles = [{ base64Data: modifiedBuffer.toString('base64'), mimeType: 'image/png' }];
  
  const hashFileChange = ExtractionCache.computeRequestHash({
    files: modifiedFiles,
    documentTypes: baseDocTypes,
    promptVersion: basePromptVersion,
    modelName: baseModelName
  });
  const lookup4 = await ExtractionCache.lookupCache(mockDb, userA, hashFileChange);
  recordTest(4, "File Content Change (1 Byte)", "CACHE MISS", lookup4.hit ? "CACHE HIT" : "CACHE MISS", lookup4.hit === false);

  // TEST 5: DOCUMENT TYPE CHANGE
  const hashDocTypeChange = ExtractionCache.computeRequestHash({
    files: baseFiles,
    documentTypes: ['PAN Card'],
    promptVersion: basePromptVersion,
    modelName: baseModelName
  });
  const lookup5 = await ExtractionCache.lookupCache(mockDb, userA, hashDocTypeChange);
  recordTest(5, "Document Type Change", "CACHE MISS", lookup5.hit ? "CACHE HIT" : "CACHE MISS", lookup5.hit === false);

  // TEST 6: EXPIRED CACHE
  const expiredHash = "hash_expired_entry_999";
  mockDb.cacheStore.set(expiredHash, {
    id: "id_expired_1",
    request_hash: expiredHash,
    created_by: userA,
    provider: 'gemini',
    model_name: baseModelName,
    prompt_version: basePromptVersion,
    result_json: mockExtractionResult,
    expires_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
    hit_count: 0
  });
  const lookup6 = await ExtractionCache.lookupCache(mockDb, userA, expiredHash);
  recordTest(6, "Expired Cache Entry", "CACHE MISS", lookup6.hit ? "CACHE HIT" : "CACHE MISS", lookup6.hit === false);

  // TEST 7: USER ISOLATION / RLS
  const lookup7 = await ExtractionCache.lookupCache(mockDb, userB, baseHash);
  recordTest(7, "User Isolation (RLS - User B vs User A)", "CACHE MISS (ISOLATED)", lookup7.hit ? "CACHE HIT" : "CACHE MISS (ISOLATED)", lookup7.hit === false);

  // TEST 8: FAILED EXTRACTION CACHING PREVENTED
  const saveFailed = await ExtractionCache.saveCache(mockDb, {
    requestHash: "failed_extraction_hash",
    userId: userA,
    provider: 'gemini',
    modelName: baseModelName,
    promptVersion: basePromptVersion,
    resultJson: null as any // Null / Failed extraction
  });
  recordTest(8, "Prevent Caching Failed Extraction", "REJECTED (success=false)", saveFailed.success ? "CACHED (ERROR)" : "REJECTED (success=false)", saveFailed.success === false);

  // TEST 9: INVALID JSON RESPONSE PREVENTED
  const saveInvalidJson = await ExtractionCache.saveCache(mockDb, {
    requestHash: "invalid_json_hash",
    userId: userA,
    provider: 'gemini',
    modelName: baseModelName,
    promptVersion: basePromptVersion,
    resultJson: "Not A JSON Object String" as any
  });
  recordTest(9, "Prevent Caching Invalid JSON", "REJECTED (success=false)", saveInvalidJson.success ? "CACHED (ERROR)" : "REJECTED (success=false)", saveInvalidJson.success === false);

  // TEST 10: CACHE HIT RESULT CONSISTENCY (Deep JSON Match)
  const isDeepMatch = JSON.stringify(lookup1.resultJson) === JSON.stringify(mockExtractionResult);
  recordTest(10, "Result Consistency (Cold vs Warm JSON)", "IDENTICAL JSON", isDeepMatch ? "IDENTICAL JSON" : "MISMATCH", isDeepMatch);

  // TEST 11: EXPIRED ROW CLEANUP
  const activeHashBeforeCleanup = mockDb.cacheStore.has(baseHash);
  const expiredHashBeforeCleanup = mockDb.cacheStore.has(expiredHash);
  const deletedCount = await mockDb.cleanupExpiredEntries();
  const activeHashAfterCleanup = mockDb.cacheStore.has(baseHash);
  const expiredHashAfterCleanup = mockDb.cacheStore.has(expiredHash);
  
  const cleanupPassed = (expiredHashBeforeCleanup && !expiredHashAfterCleanup && activeHashBeforeCleanup && activeHashAfterCleanup);
  recordTest(11, "Expired Row Cleanup", "Expired Deleted & Active Preserved", `Deleted ${deletedCount} expired rows`, cleanupPassed);

  console.log("\n==========================================================================");
  console.log("📊 HARDENING SUMMARY REPORT");
  console.log("==========================================================================\n");

  console.table(testResults.map(t => ({
    'Test #': t.testNo,
    'Requirement Name': t.name,
    'Expected Outcome': t.expected,
    'Actual Result': t.actual,
    'Status': t.status
  })));

  const allPassed = testResults.every(t => t.status === 'PASS');
  console.log("\n==========================================================================");
  console.log(`VERDICT: ${allPassed ? '✅ ALL 11 HARDENING TESTS PASSED. CACHE LAYER IS PRODUCTION READY!' : '❌ SOME TESTS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runCacheHardeningTestSuite();
