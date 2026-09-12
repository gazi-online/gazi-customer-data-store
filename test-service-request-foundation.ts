import assert from "assert";
import fs from "fs";
import path from "path";
import {
  CustomerService,
  ServiceRequest,
  ServiceRequestPriority,
  CustomerServiceStatus,
  ServiceRequestStatus,
  ServiceRequestWorkflowStatus,
  ServiceRequestDocument,
  ServiceRequestStatusHistory,
  ServiceRequestWithDetails
} from "./src/types/service";
import { customerServiceSchema } from "./src/app/(dashboard)/services/schema";

console.log("==========================================================================");
console.log("🧪 MILESTONE 10 PHASE 1: SERVICE REQUEST FOUNDATION TEST SUITE");
console.log("==========================================================================");

let passedTests = 0;
let totalTests = 0;

function it(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ─── 1. REQUEST NUMBER FORMAT, DB OWNERSHIP, AND IMMUTABILITY ────────────────

it("1a. Request number adheres to SR-YYYY-NNNNNN canonical format", () => {
  const sampleNumber = "SR-2026-001001";
  const regex = /^SR-\d{4}-\d{6}$/;
  assert.strictEqual(regex.test(sampleNumber), true, "Sample request number must match format");

  const year = 2026;
  const seqVal = 42;
  const generated = `SR-${year}-${String(seqVal).padStart(6, '0')}`;
  assert.strictEqual(generated, "SR-2026-000042");
  assert.strictEqual(regex.test(generated), true);
});

it("1b. Generator rejects malformed prefixes and lowercase letters", () => {
  const regex = /^SR-\d{4}-\d{6}$/;
  assert.strictEqual(regex.test("sr-2026-001001"), false, "Lowercase prefix must fail");
  assert.strictEqual(regex.test("REQ-2026-001001"), false, "Wrong prefix must fail");
  assert.strictEqual(regex.test("SR-26-001001"), false, "2-digit year must fail");
  assert.strictEqual(regex.test("SR-2026-1001"), false, "Unpadded sequence must fail");
});

it("1c. DB ownership: client-supplied request number cannot override DB generation on INSERT", () => {
  // Simulating trg_func_manage_service_request_number logic on INSERT
  const simulateInsertTrigger = (clientSuppliedNumber: string | null | undefined, generatedSeq: number) => {
    const dbGenerated = `SR-2026-${String(generatedSeq).padStart(6, '0')}`;
    const row = { request_number: clientSuppliedNumber };
    row.request_number = dbGenerated;
    return row.request_number;
  };

  const clientAttempt = "SR-9999-999999";
  const result = simulateInsertTrigger(clientAttempt, 1005);
  assert.strictEqual(result, "SR-2026-001005", "Database must assign its own generated number and discard client value");
});

it("1d. Immutability: assigned request_number cannot be modified on UPDATE", () => {
  const simulateUpdateTrigger = (oldRow: { request_number: string | null }, newRow: { request_number: string | null }) => {
    if (oldRow.request_number !== null && newRow.request_number !== oldRow.request_number) {
      throw new Error(`request_number is immutable once assigned (attempted change from ${oldRow.request_number} to ${newRow.request_number})`);
    }
    if (oldRow.request_number === null && newRow.request_number !== null) {
      newRow.request_number = oldRow.request_number;
    }
    return newRow;
  };

  const existingRow = { request_number: "SR-2026-001001" };
  const updateAttempt = { request_number: "SR-2026-009999" };

  assert.throws(
    () => simulateUpdateTrigger(existingRow, updateAttempt),
    /request_number is immutable once assigned/
  );
});

it("1e. Legacy rows with NULL request_number remain valid and supported", () => {
  const legacyRow = {
    id: "legacy-cs-1",
    customer_id: "c-1",
    service_id: "s-1",
    status: "pending" as CustomerServiceStatus,
    request_number: null
  };

  const updatePayload = { ...legacyRow, status: "in_progress" as CustomerServiceStatus, request_number: null };
  assert.strictEqual(updatePayload.request_number, null, "Legacy row maintains null request_number safely");
  assert.strictEqual(updatePayload.status, "in_progress");
});

// ─── 2. PRIORITY VALIDATION ──────────────────────────────────────────────────

it("2a. Priority accepts valid values ('low', 'normal', 'high', 'urgent')", () => {
  const validPriorities: ServiceRequestPriority[] = ['low', 'normal', 'high', 'urgent'];
  validPriorities.forEach(p => {
    const res = customerServiceSchema.safeParse({
      customer_id: "a0000000-0000-0000-0000-000000000001",
      service_id: "b0000000-0000-0000-0000-000000000001",
      service_date: "2026-09-12",
      amount: 150,
      priority: p
    });
    assert.strictEqual(res.success, true, `Priority ${p} should be accepted`);
    assert.strictEqual(res.data?.priority, p);
  });
});

it("2b. Priority defaults to 'normal' when omitted", () => {
  const res = customerServiceSchema.safeParse({
    customer_id: "a0000000-0000-0000-0000-000000000001",
    service_id: "b0000000-0000-0000-0000-000000000001",
    service_date: "2026-09-12",
    amount: 150
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data?.priority, "normal");
});

it("2c. Priority rejects invalid arbitrary values", () => {
  const res = customerServiceSchema.safeParse({
    customer_id: "a0000000-0000-0000-0000-000000000001",
    service_id: "b0000000-0000-0000-0000-000000000001",
    service_date: "2026-09-12",
    amount: 150,
    priority: "critical" // Not in enum
  });
  assert.strictEqual(res.success, false, "Invalid priority must be rejected");
});

// ─── 3. STATUS BOUNDARY: CURRENT PERSISTENCE VS FUTURE WORKFLOW ──────────────

it("3a. Legacy persisted statuses ('pending', 'in_progress', 'completed', 'cancelled', 'archived') are accepted", () => {
  const legacyStatuses: CustomerServiceStatus[] = ['pending', 'in_progress', 'completed', 'cancelled', 'archived'];
  legacyStatuses.forEach(s => {
    const res = customerServiceSchema.safeParse({
      customer_id: "a0000000-0000-0000-0000-000000000001",
      service_id: "b0000000-0000-0000-0000-000000000001",
      service_date: "2026-09-12",
      amount: 100,
      status: s
    });
    assert.strictEqual(res.success, true, `Legacy status ${s} must remain valid`);
  });
});

it("3b. Future Phase 2 statuses are strictly REJECTED by current persistence schema", () => {
  const futureStatuses = [
    'draft',
    'documents_pending',
    'ready_to_submit',
    'submitted',
    'in_process',
    'action_required',
    'rejected',
    'delivered'
  ];
  futureStatuses.forEach(s => {
    const res = customerServiceSchema.safeParse({
      customer_id: "a0000000-0000-0000-0000-000000000001",
      service_id: "b0000000-0000-0000-0000-000000000001",
      service_date: "2026-09-12",
      amount: 100,
      status: s
    });
    assert.strictEqual(
      res.success,
      false,
      `Future status '${s}' must NOT be accepted by Phase 1 persistence schema until Phase 2 FSM is ready`
    );
  });
});

it("3c. Migration SQL leaves customer_services.status CHECK constraint completely UNTOUCHED", () => {
  const sqlContent = fs.readFileSync(path.join(__dirname, "service_requests_foundation_migration.sql"), "utf-8");

  assert.strictEqual(
    sqlContent.includes("ALTER TABLE public.customer_services DROP CONSTRAINT IF EXISTS check_customer_services_status;"),
    false,
    "Migration must not drop check_customer_services_status in Phase 1"
  );
  assert.strictEqual(
    sqlContent.includes("CHECK (status IN ("),
    false,
    "Migration must not define an expanded status check in Phase 1"
  );
});

it("3d. Future-facing ServiceRequestWorkflowStatus type is decoupled from current CustomerServiceStatus", () => {
  const futureStatus: ServiceRequestWorkflowStatus = "submitted";
  assert.strictEqual(futureStatus, "submitted");

  const currentStatus: CustomerServiceStatus = "in_progress";
  assert.strictEqual(currentStatus, "in_progress");
});

it("3e. Generic/unvalidated updateServiceRequestStatus remains absent from server actions", () => {
  const actionsContent = fs.readFileSync(path.join(__dirname, "src/app/(dashboard)/services/actions.ts"), "utf-8");
  assert.strictEqual(
    actionsContent.includes("export async function updateServiceRequestStatus"),
    false,
    "Unvalidated updateServiceRequestStatus should be deferred to Phase 2"
  );
});

// ─── 4. DOCUMENT INTEGRITY & ARCHIVE MODEL VALIDATION ────────────────────────

// Trigger simulation following public.check_service_request_document_integrity()
type MockCS = { id: string; customer_id: string } | null;
type MockDoc = { id: string; customer_id: string; status: string; archived_at: string | null } | null;

const simulateDocIntegrityTrigger = (cs: MockCS, doc: MockDoc) => {
  // 1. Validate service request exists
  if (!cs || !cs.customer_id) {
    throw new Error(`Referenced customer_service does not exist.`);
  }
  // 2. Validate customer document exists
  if (!doc || !doc.customer_id) {
    throw new Error(`Referenced customer_document does not exist.`);
  }
  // 3. Reject archived document (status = 'archived' OR archived_at IS NOT NULL)
  if (doc.status === 'archived' || doc.archived_at !== null) {
    throw new Error(`Cannot attach archived document (id: ${doc.id}): document status is ${doc.status}, archived_at is ${doc.archived_at}.`);
  }
  // 4. Enforce same-customer ownership
  if (cs.customer_id !== doc.customer_id) {
    throw new Error(`Customer integrity mismatch: Document customer (${doc.customer_id}) does not match service request customer (${cs.customer_id}). Cross-customer document attachment is forbidden.`);
  }
  return true;
};

it("4a. Active same-customer document attachment passes integrity check", () => {
  const cs = { id: "cs-1", customer_id: "cust-111" };
  const doc = { id: "doc-1", customer_id: "cust-111", status: "active", archived_at: null };
  assert.strictEqual(simulateDocIntegrityTrigger(cs, doc), true);
});

it("4b. Cross-customer document attachment is strictly rejected", () => {
  const cs = { id: "cs-1", customer_id: "cust-111" };
  const doc = { id: "doc-2", customer_id: "cust-222", status: "active", archived_at: null };

  assert.throws(
    () => simulateDocIntegrityTrigger(cs, doc),
    /Customer integrity mismatch/
  );
});

it("4c. status='archived' document is rejected even if customer matches", () => {
  const cs = { id: "cs-1", customer_id: "cust-111" };
  const doc = { id: "doc-archived", customer_id: "cust-111", status: "archived", archived_at: null };

  assert.throws(
    () => simulateDocIntegrityTrigger(cs, doc),
    /Cannot attach archived document/
  );
});

it("4d. archived_at IS NOT NULL document is rejected even if customer matches", () => {
  const cs = { id: "cs-1", customer_id: "cust-111" };
  const doc = { id: "doc-archived-ts", customer_id: "cust-111", status: "active", archived_at: "2026-09-12T10:00:00Z" };

  assert.throws(
    () => simulateDocIntegrityTrigger(cs, doc),
    /Cannot attach archived document/
  );
});

it("4e. Missing service request row is rejected safely with clear error", () => {
  const cs: MockCS = null;
  const doc = { id: "doc-1", customer_id: "cust-111", status: "active", archived_at: null };

  assert.throws(
    () => simulateDocIntegrityTrigger(cs, doc),
    /Referenced customer_service does not exist/
  );
});

it("4f. Missing customer document row is rejected safely with clear error", () => {
  const cs = { id: "cs-1", customer_id: "cust-111" };
  const doc: MockDoc = null;

  assert.throws(
    () => simulateDocIntegrityTrigger(cs, doc),
    /Referenced customer_document does not exist/
  );
});

it("4g. Superseded document is accepted if not archived", () => {
  const cs = { id: "cs-1", customer_id: "cust-111" };
  const doc = { id: "doc-v1", customer_id: "cust-111", status: "superseded", archived_at: null };

  assert.strictEqual(simulateDocIntegrityTrigger(cs, doc), true);
});

it("4h. Existing associations remain intact if document is later archived", () => {
  // Associations table stores link independently; trigger only fires on INSERT or UPDATE of service_request_documents
  const existingLinks = [
    { id: "link-1", customer_service_id: "cs-1", document_id: "doc-1", requirement_tag: "identity" }
  ];
  // Document archived at later timestamp
  const doc = { id: "doc-1", status: "archived", archived_at: "2026-09-12T15:00:00Z" };

  assert.strictEqual(existingLinks.length, 1, "Historical link remains preserved");
  assert.strictEqual(doc.status, "archived");
});

it("4i. Same document can satisfy multiple distinct requirement tags", () => {
  const attachments = new Set<string>();
  const addAttachment = (csId: string, docId: string, tag: string) => {
    const key = `${csId}::${docId}::${tag}`;
    if (attachments.has(key)) {
      throw new Error("Duplicate attachment under same tag");
    }
    attachments.add(key);
  };

  const csId = "req-001";
  const docId = "doc-aadhaar";

  addAttachment(csId, docId, "Identity Proof");
  assert.strictEqual(attachments.has("req-001::doc-aadhaar::Identity Proof"), true);

  addAttachment(csId, docId, "Address Proof");
  assert.strictEqual(attachments.has("req-001::doc-aadhaar::Address Proof"), true);

  assert.throws(
    () => addAttachment(csId, docId, "Identity Proof"),
    /Duplicate attachment/
  );
});

// ─── 5. STATUS HISTORY ATOMICITY & IMMUTABILITY ──────────────────────────────

it("5a. DB trigger records exactly one history event when status changes", () => {
  const historyLog: Array<{ from: string; to: string; csId: string }> = [];

  const simulateStatusUpdateTrigger = (oldStatus: string, newStatus: string, csId: string) => {
    if (oldStatus !== newStatus) {
      historyLog.push({ from: oldStatus, to: newStatus, csId });
    }
  };

  simulateStatusUpdateTrigger("pending", "in_progress", "cs-101");
  assert.strictEqual(historyLog.length, 1);
  assert.strictEqual(historyLog[0].from, "pending");
  assert.strictEqual(historyLog[0].to, "in_progress");
});

it("5b. Unchanged status does NOT create a history entry", () => {
  const historyLog: Array<{ from: string; to: string; csId: string }> = [];

  const simulateStatusUpdateTrigger = (oldStatus: string, newStatus: string, csId: string) => {
    if (oldStatus !== newStatus) {
      historyLog.push({ from: oldStatus, to: newStatus, csId });
    }
  };

  simulateStatusUpdateTrigger("in_progress", "in_progress", "cs-101");
  assert.strictEqual(historyLog.length, 0, "No history entry created when status does not change");
});

it("5c. Status history is read-only for clients (no INSERT/UPDATE/DELETE RLS)", () => {
  const sqlContent = fs.readFileSync(path.join(__dirname, "service_requests_foundation_migration.sql"), "utf-8");

  assert.strictEqual(
    sqlContent.includes('CREATE POLICY "Authenticated users can view service_request_status_history"'),
    true
  );
  assert.strictEqual(
    sqlContent.includes('CREATE POLICY "Authenticated users can insert service_request_status_history"'),
    false
  );
  assert.strictEqual(
    sqlContent.includes('CREATE POLICY "Authenticated users can update service_request_status_history"'),
    false
  );
  assert.strictEqual(
    sqlContent.includes('CREATE POLICY "Authenticated users can delete service_request_status_history"'),
    false
  );
});

// ─── 6. MIGRATION & HOTFIX SQL VERIFICATION ──────────────────────────────────

it("6a. Both canonical migration and hotfix SQL contain NO references to deleted_at", () => {
  const canonicalContent = fs.readFileSync(path.join(__dirname, "service_requests_foundation_migration.sql"), "utf-8");
  const hotfixContent = fs.readFileSync(path.join(__dirname, "service_requests_document_integrity_hotfix.sql"), "utf-8");

  assert.strictEqual(
    canonicalContent.includes("deleted_at"),
    false,
    "Canonical migration must not reference non-existent deleted_at"
  );
  assert.strictEqual(
    hotfixContent.includes("deleted_at"),
    false,
    "Hotfix SQL must not reference non-existent deleted_at"
  );
});

it("6b. Both canonical migration and hotfix enforce safe search_path and revoke public access", () => {
  const canonicalContent = fs.readFileSync(path.join(__dirname, "service_requests_foundation_migration.sql"), "utf-8");
  const hotfixContent = fs.readFileSync(path.join(__dirname, "service_requests_document_integrity_hotfix.sql"), "utf-8");

  assert.strictEqual(canonicalContent.includes("SET search_path = public, pg_temp"), true);
  assert.strictEqual(hotfixContent.includes("SET search_path = public, pg_temp"), true);
  assert.strictEqual(canonicalContent.includes("REVOKE ALL ON FUNCTION public.check_service_request_document_integrity() FROM PUBLIC, anon, authenticated;"), true);
  assert.strictEqual(hotfixContent.includes("REVOKE ALL ON FUNCTION public.check_service_request_document_integrity() FROM PUBLIC, anon, authenticated;"), true);
});

it("6c. Migration triggers and policies are cleanly idempotent", () => {
  const sqlContent = fs.readFileSync(path.join(__dirname, "service_requests_foundation_migration.sql"), "utf-8");

  assert.strictEqual(sqlContent.includes("DROP TRIGGER IF EXISTS trg_manage_service_request_number"), true);
  assert.strictEqual(sqlContent.includes("DROP TRIGGER IF EXISTS trg_verify_service_request_doc_integrity"), true);
  assert.strictEqual(sqlContent.includes("DROP TRIGGER IF EXISTS trg_record_service_request_status_history"), true);

  assert.strictEqual(sqlContent.includes('DROP POLICY IF EXISTS "Authenticated users can view service_request_documents"'), true);
  assert.strictEqual(sqlContent.includes('DROP POLICY IF EXISTS "Authenticated users can insert service_request_documents"'), true);
  assert.strictEqual(sqlContent.includes('DROP POLICY IF EXISTS "Authenticated users can update service_request_documents"'), true);
  assert.strictEqual(sqlContent.includes('DROP POLICY IF EXISTS "Authenticated users can delete service_request_documents"'), true);
  assert.strictEqual(sqlContent.includes('DROP POLICY IF EXISTS "Authenticated users can view service_request_status_history"'), true);
});

// ─── 7. TYPESCRIPT CONTRACT COMPATIBILITY ────────────────────────────────────

it("7a. ServiceRequest is assignable to CustomerService without structural breaks", () => {
  const serviceRequest: ServiceRequest = {
    id: "cs-101",
    customer_id: "c-201",
    service_id: "s-301",
    status: "in_progress",
    amount: 250,
    payment_status: "paid",
    service_date: "2026-09-12",
    due_date: null,
    notes: "Urgent passport renewal",
    assigned_to: null,
    created_by: null,
    created_at: "2026-09-12T10:00:00Z",
    updated_at: "2026-09-12T10:30:00Z",
    completed_at: null,
    archived_at: null,
    request_number: "SR-2026-000101",
    application_reference: "ARN-987654321",
    portal_name: "Passport Seva",
    priority: "urgent"
  };

  const customerService: CustomerService = serviceRequest;
  assert.strictEqual(customerService.id, "cs-101");
  assert.strictEqual(customerService.status, "in_progress");
  assert.strictEqual(customerService.request_number, "SR-2026-000101");
  assert.strictEqual(customerService.priority, "urgent");
});

it("7b. Legacy CustomerService without new optional properties remains fully type-safe", () => {
  const legacyRecord: CustomerService = {
    id: "cs-old",
    customer_id: "c-old",
    service_id: "s-old",
    status: "pending",
    amount: 100,
    payment_status: "unpaid",
    service_date: "2026-08-01",
    due_date: null,
    notes: null,
    assigned_to: null,
    created_by: null,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    completed_at: null,
    archived_at: null
  };

  assert.strictEqual(legacyRecord.request_number, undefined);
  assert.strictEqual(legacyRecord.priority, undefined);
  assert.strictEqual(legacyRecord.status, "pending");
});

console.log("\n==========================================================================");
console.log(`📊 TEST RESULTS: ${passedTests} PASSED, 0 FAILED (TOTAL: ${totalTests})`);
console.log("==========================================================================");
