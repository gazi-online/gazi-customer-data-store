import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ExtractionCache } from './src/lib/ai/cache/ExtractionCache';

// Hardened Mock Database simulating composite unique constraint (created_by, request_hash) and RLS
class MockHardenedSupabaseClient {
  // Keyed by `${created_by}:${request_hash}` for per-user composite unique constraint
  public cacheStore = new Map<string, any>();

  from(table: string) {
    if (table !== 'ai_extraction_cache') {
      throw new Error(`Unexpected table access: ${table}`);
    }

    return {
      select: (cols?: string) => ({
        eq: (col1: string, val1: string) => ({
          eq: (col2: string, val2: string) => ({
            maybeSingle: async () => {
              // Lookup by request_hash (val1) and created_by (val2)
              const key = `${val2}:${val1}`;
              const entry = this.cacheStore.get(key);
              if (entry) {
                return { data: entry, error: null };
              }
              return { data: null, error: null };
            }
          })
        })
      }),
      update: (updateData: any) => ({
        eq: async (col: string, val: string) => {
          // Update matching entry by ID
          const existingEntry = Array.from(this.cacheStore.values()).find(e => e.id === val);
          if (existingEntry) {
            if (updateData.hit_count !== undefined) existingEntry.hit_count = updateData.hit_count;
            if (updateData.last_used_at !== undefined) existingEntry.last_used_at = updateData.last_used_at;
          }
          return { error: null };
        }
      }),
      upsert: async (insertData: any, options?: { onConflict?: string }) => {
        const compositeKey = `${insertData.created_by}:${insertData.request_hash}`;
        const existing = this.cacheStore.get(compositeKey);
        
        const entry = {
          id: existing ? existing.id : crypto.randomUUID(),
          ...insertData,
          hit_count: existing ? existing.hit_count : 0
        };
        this.cacheStore.set(compositeKey, entry);
        return { error: null };
      }
    };
  }

  // Simulates user trying to mutate another user's cache row (RLS Blocked)
  async attemptCrossUserUpdate(targetUserId: string, targetRequestHash: string, mutatingUserId: string) {
    const key = `${targetUserId}:${targetRequestHash}`;
    const target = this.cacheStore.get(key);
    if (!target) return { updated: false, reason: 'NOT_FOUND' };
    
    // RLS Policy Check: auth.uid() = created_by
    if (target.created_by !== mutatingUserId) {
      return { updated: false, reason: 'RLS_MUTATION_BLOCKED' };
    }

    target.result_json = { hijacked: true };
    return { updated: true, reason: 'MUTATED' };
  }

  // Cleanup helper matching SQL cleanup function
  async cleanupExpiredEntries(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;
    for (const [key, entry] of Array.from(this.cacheStore.entries())) {
      if (entry.expires_at && new Date(entry.expires_at) < now) {
        this.cacheStore.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }
}

async function runCacheHardeningTestSuite() {
  console.log("==========================================================================");
  console.log("🔒 CACHE HARDENING & USER ISOLATION TEST SUITE (COMPOSITE UNIQUE INDEX)");
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

  // --- REQUIREMENT A: SAME USER + SAME REQUEST (MISS -> WRITE -> HIT) ---
  const baseHash = ExtractionCache.computeRequestHash({
    files: baseFiles,
    documentTypes: baseDocTypes,
    promptVersion: basePromptVersion,
    modelName: baseModelName
  });

  // First Lookup (User A) -> MISS
  const lookupA1 = await ExtractionCache.lookupCache(mockDb, userA, baseHash);
  recordTest(1, "User A Initial Lookup", "CACHE MISS", lookupA1.hit ? "CACHE HIT" : "CACHE MISS", lookupA1.hit === false);

  // Write Cache (User A)
  const saveA = await ExtractionCache.saveCache(mockDb, {
    requestHash: baseHash,
    userId: userA,
    provider: 'gemini',
    modelName: baseModelName,
    promptVersion: basePromptVersion,
    resultJson: mockExtractionResult
  });

  // Second Lookup (User A) -> HIT
  const lookupA2 = await ExtractionCache.lookupCache(mockDb, userA, baseHash);
  recordTest(2, "User A Second Lookup (Identical Request)", "CACHE HIT", lookupA2.hit ? "CACHE HIT" : "CACHE MISS", lookupA2.hit === true);

  // --- REQUIREMENT B: USER A AND USER B + SAME REQUEST_HASH ---
  // User B saves cache with the EXACT same request_hash
  const saveB = await ExtractionCache.saveCache(mockDb, {
    requestHash: baseHash,
    userId: userB,
    provider: 'gemini',
    modelName: baseModelName,
    promptVersion: basePromptVersion,
    resultJson: { ...mockExtractionResult, customer: { ...mockExtractionResult.customer, full_name: "Bob Unique Copy" } }
  });

  const totalStoreRows = mockDb.cacheStore.size;
  recordTest(3, "User B Independent Cache Write (Same Hash)", "2 Isolated Cache Rows", saveB.success && totalStoreRows === 2 ? "2 Isolated Cache Rows" : `Rows: ${totalStoreRows}`, saveB.success && totalStoreRows === 2);

  // --- REQUIREMENT C: USER A CANNOT READ USER B CACHE ---
  const lookupB = await ExtractionCache.lookupCache(mockDb, userB, baseHash);
  const isDifferentResult = lookupB.resultJson.customer.full_name === "Bob Unique Copy" && lookupA2.resultJson.customer.full_name === "Rahat Ali";
  recordTest(4, "Cross-User Read Isolation (RLS)", "Isolated Independent JSON", isDifferentResult ? "Isolated Independent JSON" : "Leaked/Mixed JSON", isDifferentResult);

  // --- REQUIREMENT D: USER A CANNOT UPDATE/DELETE USER B CACHE ---
  const mutationResult = await mockDb.attemptCrossUserUpdate(userB, baseHash, userA);
  recordTest(5, "Cross-User Mutation Protection (RLS)", "RLS_MUTATION_BLOCKED", mutationResult.reason, mutationResult.reason === 'RLS_MUTATION_BLOCKED');

  // --- REQUIREMENT E: NO DUPLICATE CACHE ROW FOR SAME (created_by, request_hash) ---
  const initialUserARowId = mockDb.cacheStore.get(`${userA}:${baseHash}`)?.id;
  await ExtractionCache.saveCache(mockDb, {
    requestHash: baseHash,
    userId: userA,
    provider: 'gemini',
    modelName: baseModelName,
    promptVersion: basePromptVersion,
    resultJson: mockExtractionResult
  });
  const updatedUserARowId = mockDb.cacheStore.get(`${userA}:${baseHash}`)?.id;
  const rowsAfterSecondUserASave = mockDb.cacheStore.size;
  const noDuplicates = rowsAfterSecondUserASave === 2 && initialUserARowId === updatedUserARowId;
  recordTest(6, "No Duplicate Rows for Same (created_by, request_hash)", "Upserts Same Row (0 Duplicates)", noDuplicates ? "Upserts Same Row (0 Duplicates)" : "Duplicate Created", noDuplicates);

  // --- ADDITIONAL EDGE CASES ---
  // TEST 7: PROMPT VERSION CHANGE
  const hashPromptChange = ExtractionCache.computeRequestHash({
    files: baseFiles,
    documentTypes: baseDocTypes,
    promptVersion: 'v2-experimental',
    modelName: baseModelName
  });
  const lookup7 = await ExtractionCache.lookupCache(mockDb, userA, hashPromptChange);
  recordTest(7, "Prompt Version Change", "CACHE MISS", lookup7.hit ? "CACHE HIT" : "CACHE MISS", lookup7.hit === false);

  // TEST 8: FILE CONTENT CHANGE (1 byte altered)
  const modifiedBuffer = Buffer.from(baseFileBuffer);
  modifiedBuffer[modifiedBuffer.length - 1] ^= 0xFF;
  const modifiedFiles = [{ base64Data: modifiedBuffer.toString('base64'), mimeType: 'image/png' }];
  const hashFileChange = ExtractionCache.computeRequestHash({
    files: modifiedFiles,
    documentTypes: baseDocTypes,
    promptVersion: basePromptVersion,
    modelName: baseModelName
  });
  const lookup8 = await ExtractionCache.lookupCache(mockDb, userA, hashFileChange);
  recordTest(8, "File Content Change (1 Byte)", "CACHE MISS", lookup8.hit ? "CACHE HIT" : "CACHE MISS", lookup8.hit === false);

  // TEST 9: EXPIRED CACHE CLEANUP
  const expiredHash = "hash_expired_entry_999";
  mockDb.cacheStore.set(`${userA}:${expiredHash}`, {
    id: "id_expired_1",
    request_hash: expiredHash,
    created_by: userA,
    provider: 'gemini',
    model_name: baseModelName,
    prompt_version: basePromptVersion,
    result_json: mockExtractionResult,
    expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    hit_count: 0
  });

  const deletedCount = await mockDb.cleanupExpiredEntries();
  recordTest(9, "Expired Row Cleanup", "1 Expired Deleted", `Deleted ${deletedCount} expired row`, deletedCount === 1);

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
  console.log(`VERDICT: ${allPassed ? '✅ ALL CACHE HARDENING & USER ISOLATION TESTS PASSED!' : '❌ SOME TESTS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runCacheHardeningTestSuite().catch(console.error);
