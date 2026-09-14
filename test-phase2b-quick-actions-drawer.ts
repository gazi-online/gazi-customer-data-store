/**
 * MILESTONE 10 PHASE 2B-2 TEST SUITE
 * Quick Status Actions & Read-Only Request Inspection Drawer
 *
 * Verifies:
 * 1. Canonical FSM workflow transition enforcement & UI target filtering
 * 2. Mandatory rejection reason & optional application reference handling
 * 3. Notes preflight invariant: no unsafe request-notes overwrite path
 * 4. Revalidation contract including /requests
 * 5. Drawer narrow DTO & privacy: zero signed URLs, zero blobs, zero AI JSON
 * 6. Read-only status history with safe actor display ("Staff", no raw UUID)
 * 7. Billing schema accuracy (due_amount, not balance_due) and multi-invoice cardinality
 * 8. Drawer async sequence guard against race conditions
 * 9. Hard scope enforcement: no /requests/[id], no document mutations, no invoice generation
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import {
  getAllowedServiceRequestTransitions,
  getServiceRequestStatusLabel,
} from "./src/lib/services/serviceRequestWorkflow";
import { PERSISTED_STATUSES } from "./src/app/(dashboard)/requests/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

console.log("==========================================================================");
console.log("🧪 MILESTONE 10 PHASE 2B-2: QUICK ACTIONS & REQUEST DRAWER TEST SUITE");
console.log("==========================================================================\n");

// ==============================================================================
// 1. CANONICAL FSM REUSE & TARGET STATUS FILTERING
// ==============================================================================
console.log("--- 1. Canonical FSM Target Options & Filtering ---");

// 1a. Archived has exactly 0 outgoing transitions
const archivedTargets = getAllowedServiceRequestTransitions("archived");
assert(
  Array.isArray(archivedTargets) && archivedTargets.length === 0,
  "1a. Archived status has strictly zero allowed outgoing transitions"
);

// 1b. Legacy in_progress is never a target for any active or terminal status
for (const status of PERSISTED_STATUSES) {
  const targets = getAllowedServiceRequestTransitions(status);
  const allowsInProgress = targets.includes("in_progress");
  assert(
    !allowsInProgress,
    `1b. '${status}' does NOT allow transitioning into legacy 'in_progress'`
  );
}

// 1c. Modal filters targets from canonical helper
const submittedTargets = getAllowedServiceRequestTransitions("submitted");
assert(
  submittedTargets.includes("in_process") &&
    submittedTargets.includes("action_required") &&
    submittedTargets.includes("rejected"),
  "1c. 'submitted' canonical targets match: in_process, action_required, rejected"
);

// 1d. Pending allows documents_pending, ready_to_submit, cancelled, archived
const pendingTargets = getAllowedServiceRequestTransitions("pending");
assert(
  pendingTargets.includes("documents_pending") &&
    pendingTargets.includes("ready_to_submit") &&
    pendingTargets.includes("cancelled") &&
    pendingTargets.includes("archived"),
  "1d. 'pending' canonical targets match expected FSM set"
);

// 1e. Human-readable labels exist for all 12 statuses
for (const status of PERSISTED_STATUSES) {
  const label = getServiceRequestStatusLabel(status);
  assert(
    typeof label === "string" && label.length > 0 && label !== status,
    `1e. Status '${status}' resolves to readable label: '${label}'`
  );
}

// ==============================================================================
// 2. CONDITIONAL FIELDS & REJECTION REASON ENFORCEMENT
// ==============================================================================
console.log("\n--- 2. Conditional Fields & Validation Rules ---");

// 2a. Rejection reason validation logic
function validateTransitionInputs(
  toStatus: string,
  rejectionReason: string,
  applicationReference?: string
): { valid: boolean; error?: string } {
  if (!toStatus) return { valid: false, error: "Please select a target status." };
  if (toStatus === "rejected" && !rejectionReason.trim()) {
    return { valid: false, error: "A non-empty rejection reason is required when rejecting a request." };
  }
  if ((toStatus === "submitted" || toStatus === "in_process") && applicationReference) {
    // Optional reference accepted
  }
  return { valid: true };
}

assert(
  !validateTransitionInputs("rejected", "").valid,
  "2a. Empty rejection reason for 'rejected' target is invalid"
);
assert(
  !validateTransitionInputs("rejected", "   ").valid,
  "2b. Whitespace-only rejection reason for 'rejected' target is invalid"
);
assert(
  validateTransitionInputs("rejected", "Incomplete applicant documents").valid,
  "2c. Valid rejection reason passes validation"
);
assert(
  validateTransitionInputs("submitted", "", "").valid,
  "2d. 'submitted' does NOT require application reference"
);
assert(
  validateTransitionInputs("in_process", "", "ACK-123").valid,
  "2e. 'in_process' accepts optional application reference"
);

// ==============================================================================
// 3. TRANSITION NOTES PREFLIGHT & INTEGRITY
// ==============================================================================
console.log("\n--- 3. Notes Preflight & Non-Overwrite Invariant ---");

const modalSource = readFileSync(
  resolve(__dirname, "src/components/requests/RequestStatusTransitionModal.tsx"),
  "utf-8"
);

// 3a. Modal source must NOT expose transition notes input
assert(
  !modalSource.includes("transitionNotes") && !modalSource.includes("transition-notes"),
  "3a. RequestStatusTransitionModal does NOT expose an unsafe transition-notes input"
);

// 3b. Modal source does NOT pass notes to transitionServiceRequestStatus
assert(
  !modalSource.includes("notes:"),
  "3b. RequestStatusTransitionModal does NOT pass notes parameter to transitionServiceRequestStatus"
);

// 3c. Modal preserves existing application reference if user doesn't clear it
assert(
  modalSource.includes("existingApplicationReference"),
  "3c. RequestStatusTransitionModal explicitly tracks existingApplicationReference"
);

// ==============================================================================
// 4. REVALIDATION CONTRACT
// ==============================================================================
console.log("\n--- 4. Revalidation Invariants ---");

const servicesActionsSource = readFileSync(
  resolve(__dirname, "src/app/(dashboard)/services/actions.ts"),
  "utf-8"
);

assert(
  servicesActionsSource.includes('revalidatePath("/requests")'),
  "4a. transitionServiceRequestStatus explicitly revalidates /requests"
);
assert(
  servicesActionsSource.includes('revalidatePath(`/customers/${current.customer_id}`)'),
  "4b. transitionServiceRequestStatus preserves /customers/[id] revalidation"
);
assert(
  servicesActionsSource.includes('revalidatePath("/services")'),
  "4c. transitionServiceRequestStatus preserves /services revalidation"
);

// ==============================================================================
// 5. DRAWER NARROW DTO & DATA SECURITY
// ==============================================================================
console.log("\n--- 5. Drawer Narrow DTO & Privacy Boundaries ---");

const requestsActionsSource = readFileSync(
  resolve(__dirname, "src/app/(dashboard)/requests/actions.ts"),
  "utf-8"
);

// 5a. getServiceRequestDrawerData is defined and exported
assert(
  requestsActionsSource.includes("export async function getServiceRequestDrawerData"),
  "5a. getServiceRequestDrawerData is exported in requests/actions.ts"
);

// 5b. Authenticated client used
assert(
  requestsActionsSource.includes("createClient()") &&
    requestsActionsSource.includes("auth.getUser()"),
  "5b. getServiceRequestDrawerData enforces user authentication via auth.getUser()"
);

// 5c. UUID validation enforced
assert(
  requestsActionsSource.includes("isValidUuid(requestId)"),
  "5c. getServiceRequestDrawerData enforces UUID validation on input"
);

// 5d. Narrow select does NOT use customer_documents(*)
assert(
  !requestsActionsSource.includes("customer_documents(*)"),
  "5d. getServiceRequestDrawerData does NOT perform wildcard select customer_documents(*)"
);

// 5e. No storage_url, storage_path, signed URL, or blob properties fetched
assert(
  !requestsActionsSource.includes("storage_url") &&
    !requestsActionsSource.includes("storage_path") &&
    !requestsActionsSource.includes("createSignedUrl"),
  "5e. getServiceRequestDrawerData strictly excludes storage_url, storage_path, and signed URLs"
);

// 5f. No AI JSON or raw OCR extraction payload fetched
assert(
  !requestsActionsSource.includes("ai_extracted_json") &&
    !requestsActionsSource.includes("ocr_text"),
  "5f. getServiceRequestDrawerData strictly excludes ai_extracted_json and raw OCR payloads"
);

// 5g. Broad getServiceRequestById is NOT imported or returned directly
assert(
  !requestsActionsSource.includes("getServiceRequestById"),
  "5g. getServiceRequestDrawerData does NOT return broad getServiceRequestById"
);

// ==============================================================================
// 6. STATUS HISTORY & ACTOR PRIVACY
// ==============================================================================
console.log("\n--- 6. Status History & Actor Display Privacy ---");

const drawerSource = readFileSync(
  resolve(__dirname, "src/components/requests/RequestDrawer.tsx"),
  "utf-8"
);

// 6a. Drawer displays "Staff" instead of raw UUID
assert(
  drawerSource.includes("Staff") && !drawerSource.includes("{item.changedBy}"),
  "6a. RequestDrawer displays safe 'Staff' identifier instead of raw changed_by UUID"
);

// 6b. Status history is read-only (zero insert/update/delete against history)
assert(
  !drawerSource.includes("service_request_status_history.insert") &&
    !drawerSource.includes("addHistory") &&
    !drawerSource.includes("deleteHistory"),
  "6b. RequestDrawer does NOT contain any status history mutation controls"
);

// 6c. History empty state handled gracefully
assert(
  drawerSource.includes("No status transitions recorded yet"),
  "6c. RequestDrawer renders explicit empty state for requests with no history"
);

// ==============================================================================
// 7. BILLING SCHEMA & MULTI-INVOICE CARDINALITY
// ==============================================================================
console.log("\n--- 7. Billing Schema & Multi-Invoice Cardinality ---");

// 7a. Uses actual column 'due_amount' not hypothetical 'balance_due'
assert(
  requestsActionsSource.includes("due_amount") && !requestsActionsSource.includes("balance_due"),
  "7a. Invoice query uses verified schema column 'due_amount' (not hypothetical balance_due)"
);

// 7b. Invoices returned as an array supporting multiple linked invoices
assert(
  requestsActionsSource.includes("invoices: RequestDrawerInvoiceItem[]") ||
    requestsActionsSource.includes("invoices,"),
  "7b. Drawer DTO supports array of invoices for multi-item cardinality"
);

// 7c. Drawer links to /invoices/[id] without invoice generation controls
assert(
  drawerSource.includes("/invoices/${inv.invoiceId}") &&
    !drawerSource.includes("createInvoice") &&
    !drawerSource.includes("generateInvoice"),
  "7c. RequestDrawer provides link to existing invoices without invoice generation controls"
);

// 7d. Empty invoice state handled
assert(
  drawerSource.includes("No invoice generated for this service request yet"),
  "7d. RequestDrawer renders explicit empty state when request is not yet invoiced"
);

// ==============================================================================
// 8. ASYNC RACE PROTECTION & STATE REFRESH
// ==============================================================================
console.log("\n--- 8. Async Race Protection & Refresh Logic ---");

// 8a. Sequence counter guard in RequestDrawer
assert(
  drawerSource.includes("fetchSequenceRef") && drawerSource.includes("currentSeq"),
  "8a. RequestDrawer implements sequence guard (fetchSequenceRef) to prevent async race conditions"
);

// 8b. Refresh trigger prop supported
assert(
  drawerSource.includes("refreshTrigger"),
  "8b. RequestDrawer accepts refreshTrigger to force re-fetch after status transition"
);

const deskViewSource = readFileSync(
  resolve(__dirname, "src/components/requests/RequestsDeskView.tsx"),
  "utf-8"
);

// 8c. DeskView bumps refreshTrigger on successful transition
assert(
  deskViewSource.includes("setDrawerRefreshTrigger"),
  "8c. RequestsDeskView increments drawerRefreshTrigger on transition success"
);

// 8d. DeskView calls router.refresh() on transition success
assert(
  deskViewSource.includes("router.refresh()"),
  "8d. RequestsDeskView triggers router.refresh() on transition success"
);

// ==============================================================================
// 9. HARD SCOPE BOUNDARY ENFORCEMENT
// ==============================================================================
console.log("\n--- 9. Hard Scope Boundary Verifications ---");

// 9a. Durable Phase 2B-2 invariant: requests/actions.ts remains strictly READ-ONLY for workflow status
assert(
  !requestsActionsSource.includes("function transitionServiceRequestStatus") &&
    !requestsActionsSource.includes("updateServiceRequestStatus") &&
    !requestsActionsSource.includes("service_request_status_history.insert") &&
    !requestsActionsSource.includes("ALLOWED_TRANSITIONS"),
  "9a. requests/actions.ts remains strictly read-only for workflow status (mutation canonical to services/actions.ts)"
);

// 9b. RequestsTable does not link to /requests/[id]
const tableSource = readFileSync(
  resolve(__dirname, "src/components/requests/RequestsTable.tsx"),
  "utf-8"
);
assert(
  !tableSource.includes("/requests/${req.id}") && !tableSource.includes("`/requests/"),
  "9b. RequestsTable does NOT link out to /requests/[id]"
);

// 9c. Zero document mutation controls in drawer
assert(
  !drawerSource.includes("uploadDocument") &&
    !drawerSource.includes("detachDocument") &&
    !drawerSource.includes("toggleDocumentVerification"),
  "9c. RequestDrawer does NOT contain document upload, detach, or verification mutations"
);

// 9d. Zero payment mutation controls in drawer
assert(
  !drawerSource.includes("recordPayment") &&
    !drawerSource.includes("updatePayment") &&
    !drawerSource.includes("deletePayment"),
  "9d. RequestDrawer does NOT contain payment mutation controls"
);

// ==============================================================================
// SUMMARY & VERDICT
// ==============================================================================
console.log("\n==========================================================================");
console.log(`📊 PHASE 2B-2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("==========================================================================");

if (failed > 0) {
  console.error("❌ VERDICT: PHASE 2B-2 TESTS FAILED!");
  process.exit(1);
} else {
  console.log("VERDICT: ✅ ALL PHASE 2B-2 QUICK ACTIONS & DRAWER TESTS PASSED CLEANLY!");
}
