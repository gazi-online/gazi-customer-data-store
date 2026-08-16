import crypto from 'crypto';

// Mock database for Documents & AI Audit Trail Unit Tests
class MockAuditDatabase {
  public customerDocuments: any[] = [];
  public aiImportHistory: any[] = [];

  // Upload Document
  async uploadDocument(params: {
    customerId: string;
    documentType: string;
    fileUrl: string;
    sourceFilename: string;
    fileSize: number;
    mimeType: string;
    side?: string;
    userId: string;
  }) {
    const doc = {
      id: "doc_" + crypto.randomUUID().substring(0, 8),
      customer_id: params.customerId,
      document_type: params.documentType,
      file_url: params.fileUrl,
      source_filename: params.sourceFilename,
      file_size: params.fileSize,
      mime_type: params.mimeType,
      side: params.side || 'single',
      created_by: params.userId,
      status: 'active',
      version: 1,
      uploaded_at: new Date().toISOString()
    };
    this.customerDocuments.push(doc);
    return doc;
  }

  // Replace Document
  async replaceDocument(params: {
    oldDocumentId: string;
    customerId: string;
    documentType: string;
    fileUrl: string;
    sourceFilename: string;
    fileSize: number;
    mimeType: string;
    userId: string;
  }) {
    const oldDoc = this.customerDocuments.find(d => d.id === params.oldDocumentId);
    const newVersion = oldDoc ? oldDoc.version + 1 : 2;

    const newDoc = {
      id: "doc_" + crypto.randomUUID().substring(0, 8),
      customer_id: params.customerId,
      document_type: params.documentType,
      file_url: params.fileUrl,
      source_filename: params.sourceFilename,
      file_size: params.fileSize,
      mime_type: params.mimeType,
      side: oldDoc ? oldDoc.side : 'single',
      created_by: params.userId,
      status: 'active',
      version: newVersion,
      uploaded_at: new Date().toISOString()
    };

    if (oldDoc) {
      oldDoc.status = 'superseded';
      oldDoc.superseded_by = newDoc.id;
      oldDoc.updated_at = new Date().toISOString();
    }

    this.customerDocuments.push(newDoc);
    return newDoc;
  }

  // Archive Document
  async archiveDocument(documentId: string) {
    const doc = this.customerDocuments.find(d => d.id === documentId);
    if (doc) {
      doc.status = 'archived';
      doc.archived_at = new Date().toISOString();
    }
    return doc;
  }

  // Run or Retry AI Extraction (Creates NEW History Record)
  async createAiImportHistory(params: {
    userId: string;
    customerId: string;
    documentIds: string[];
    status: 'success' | 'failed';
    provider: string;
    modelName: string;
    promptVersion: string;
    resultJson?: any;
    errorMessage?: string;
    cacheHit?: boolean;
    photoSourceType?: 'manual' | 'ai_document';
  }) {
    const record = {
      id: "imp_" + crypto.randomUUID().substring(0, 8),
      created_by: params.userId,
      customer_id: params.customerId,
      document_ids: params.documentIds,
      ai_provider: params.provider,
      model_name: params.modelName,
      prompt_version: params.promptVersion,
      status: params.status,
      final_json: params.resultJson || null,
      error_message: params.errorMessage || null,
      cache_hit: params.cacheHit || false,
      photo_source_type: params.photoSourceType || 'manual',
      created_at: new Date().toISOString()
    };
    this.aiImportHistory.push(record);
    return record;
  }

  // RLS Filter Simulation for Documents
  getDocumentsForUser(userId: string, customerId: string, statusFilter = 'active') {
    return this.customerDocuments.filter(d => {
      if (d.customer_id !== customerId) return false;
      if (d.created_by !== userId) return false; // RLS restriction
      if (statusFilter === 'active') return d.status === 'active';
      return true;
    });
  }

  // RLS Filter Simulation for AI Imports
  getImportsForUser(userId: string, customerId: string) {
    return this.aiImportHistory.filter(i => i.customer_id === customerId && i.created_by === userId);
  }
}

async function runDocumentsAuditTestSuite() {
  console.log("==========================================================================");
  console.log("📂 PHASE 7: DOCUMENTS & AI IMPORT AUDIT TRAIL TEST SUITE");
  console.log("==========================================================================\n");

  const mockDb = new MockAuditDatabase();
  const userA = "usr_alice_101";
  const userB = "usr_bob_202";
  const customerId = "cust_rahul_999";

  const testResults: { caseId: string; name: string; expected: string; actual: string; status: 'PASS' | 'FAIL' }[] = [];

  function recordCase(caseId: string, name: string, expected: string, actual: string, pass: boolean) {
    const status = pass ? 'PASS' : 'FAIL';
    testResults.push({ caseId, name, expected, actual, status });
    console.log(`[CASE ${caseId}] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  }

  // CASE A: Upload document
  const doc1 = await mockDb.uploadDocument({
    customerId,
    documentType: 'Aadhaar Card (Front)',
    fileUrl: `${customerId}/aadhaar_front_1.png`,
    sourceFilename: 'aadhaar_front.png',
    fileSize: 450000,
    mimeType: 'image/png',
    side: 'front',
    userId: userA
  });
  recordCase("A", "Upload Document with Metadata", "active, v1, front", `${doc1.status}, v${doc1.version}, ${doc1.side}`, doc1.status === 'active' && doc1.version === 1);

  // CASE B: Document appears in timeline
  const activeTimeline = mockDb.getDocumentsForUser(userA, customerId, 'active');
  recordCase("B", "Document Appears in Timeline", "1 Active Document", `${activeTimeline.length} Active Document`, activeTimeline.length === 1 && activeTimeline[0].id === doc1.id);

  // CASE C: Run AI extraction
  const import1 = await mockDb.createAiImportHistory({
    userId: userA,
    customerId,
    documentIds: [doc1.id],
    status: 'success',
    provider: 'gemini',
    modelName: 'gemini-flash-latest',
    promptVersion: 'v1',
    resultJson: { customer: { full_name: 'Rahul Sharma' } }
  });
  recordCase("C", "Run AI Extraction History Created", "Status: success", `Status: ${import1.status}`, import1.status === 'success');

  // CASE D: AI import linked to document
  const isLinked = import1.document_ids?.includes(doc1.id);
  recordCase("D", "AI Import Linked to Document", "Linked to doc1", isLinked ? "Linked to doc1" : "NOT Linked", isLinked === true);

  // CASE E: Re-run creates second import history record
  const import2 = await mockDb.createAiImportHistory({
    userId: userA,
    customerId,
    documentIds: [doc1.id],
    status: 'success',
    provider: 'gemini',
    modelName: 'gemini-flash-latest',
    promptVersion: 'v1',
    cacheHit: true,
    resultJson: { customer: { full_name: 'Rahul Sharma' } }
  });
  const allImports = mockDb.getImportsForUser(userA, customerId);
  recordCase("E", "Re-run Creates 2nd Import Record (Old Preserved)", "2 Total Imports", `${allImports.length} Total Imports`, allImports.length === 2 && import1.id !== import2.id);

  // CASE F: Replace document preserves old history
  const doc2Replaced = await mockDb.replaceDocument({
    oldDocumentId: doc1.id,
    customerId,
    documentType: 'Aadhaar Card (Front)',
    fileUrl: `${customerId}/aadhaar_front_v2.png`,
    sourceFilename: 'aadhaar_front_new.png',
    fileSize: 520000,
    mimeType: 'image/png',
    userId: userA
  });

  const oldDocState = mockDb.customerDocuments.find(d => d.id === doc1.id);
  const replaceSuccess = oldDocState.status === 'superseded' && oldDocState.superseded_by === doc2Replaced.id && doc2Replaced.version === 2;
  recordCase("F", "Replace Document (v2 Active, v1 Superseded)", "v1 superseded, v2 active", `v1: ${oldDocState.status}, v2: ${doc2Replaced.status}`, replaceSuccess);

  // CASE G: Archive document hides it from active list but keeps history
  await mockDb.archiveDocument(doc2Replaced.id);
  const activeAfterArchive = mockDb.getDocumentsForUser(userA, customerId, 'active');
  const archivedDocState = mockDb.customerDocuments.find(d => d.id === doc2Replaced.id);
  recordCase("G", "Archive Document Hides from Active List", "0 Active, Archived Preserved", `${activeAfterArchive.length} Active, Status: ${archivedDocState.status}`, activeAfterArchive.length === 0 && archivedDocState.status === 'archived');

  // CASE H: Failed extraction retry creates new record
  const failedImport = await mockDb.createAiImportHistory({
    userId: userA,
    customerId,
    documentIds: [doc1.id],
    status: 'failed',
    provider: 'gemini',
    modelName: 'gemini-flash-latest',
    promptVersion: 'v1',
    errorMessage: 'Quota limit'
  });

  const retriedImport = await mockDb.createAiImportHistory({
    userId: userA,
    customerId,
    documentIds: [doc1.id],
    status: 'success',
    provider: 'openrouter',
    modelName: 'claude-3.5-sonnet',
    promptVersion: 'v1',
    resultJson: { customer: { full_name: 'Rahul Sharma' } }
  });

  const failedStillExists = mockDb.aiImportHistory.find(i => i.id === failedImport.id);
  recordCase("H", "Failed Extraction Retry Creates New Record", "Old failed preserved, new success created", `Failed ID: ${failedStillExists.status}, New ID: ${retriedImport.status}`, failedStillExists.status === 'failed' && retriedImport.status === 'success');

  // CASE I: Profile photo source tracking preserved
  const photoImport = await mockDb.createAiImportHistory({
    userId: userA,
    customerId,
    documentIds: [doc1.id],
    status: 'success',
    provider: 'gemini',
    modelName: 'gemini-flash-latest',
    promptVersion: 'v1',
    photoSourceType: 'ai_document'
  });
  recordCase("I", "Profile Photo Source Tracking (ai_document vs manual)", "ai_document", photoImport.photo_source_type || 'manual', photoImport.photo_source_type === 'ai_document');

  // CASE J: User A cannot view User B private documents/imports
  const userBDocs = mockDb.getDocumentsForUser(userB, customerId, 'active');
  const userBImports = mockDb.getImportsForUser(userB, customerId);
  const rlsPassed = userBDocs.length === 0 && userBImports.length === 0;
  recordCase("J", "User Isolation / RLS (User B gets 0 User A docs/imports)", "0 Docs & 0 Imports", `${userBDocs.length} Docs & ${userBImports.length} Imports`, rlsPassed);

  console.log("\n==========================================================================");
  console.log("📊 TEST SUITE SUMMARY REPORT");
  console.log("==========================================================================\n");

  console.table(testResults.map(t => ({
    'Case': t.caseId,
    'Test Name': t.name,
    'Expected Result': t.expected,
    'Actual Outcome': t.actual,
    'Status': t.status
  })));

  const allPassed = testResults.every(t => t.status === 'PASS');
  console.log("\n==========================================================================");
  console.log(`VERDICT: ${allPassed ? '✅ ALL 10 DOCUMENTS & AI AUDIT TEST CASES PASSED!' : '❌ SOME TESTS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runDocumentsAuditTestSuite();
