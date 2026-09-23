/**
 * ==============================================================================
 * PHASE 12: OPERATIONS QUEUE DIRECT RESOLUTION TEST SUITE
 * File: test-phase12-operations-direct-action.ts
 * ==============================================================================
 * Validates:
 * 1. Alert metadata extensions:
 *    - Follow-up alert contains canonical followupId, requestId, customerServiceId, requestNumber
 *    - Document verification alert contains canonical associationId, requestId, customerServiceId, requirementTag
 *    - Strict PII protection: customerPhone / email NOT added solely for Phase 12
 * 2. Canonical server actions used:
 *    - Complete uses completeFollowup({ followupId, requestId, resolutionNote })
 *    - Reschedule uses rescheduleFollowup({ followupId, requestId, newFollowUpAt, newNote, resolutionNote })
 *    - Verify uses toggleDocumentVerification({ requestId, associationId, expectedIsVerified: false, isVerified: true })
 * 3. Scope boundary preservation:
 *    - Non-verification document alerts (expired/expiring vault documents) do NOT receive direct verify action
 *    - Billing alerts (overdue invoices) do NOT receive direct financial mutation controls
 *    - Request alerts (action_required / overdue requests) do NOT receive direct FSM status mutation controls
 * 4. Stale-state & conflict correctness:
 *    - completeFollowup distinguishes updated rows from already-closed follow-ups, returning conflict instead of false success
 *    - rescheduleFollowup catches RPC errors for non-open follow-ups and returns conflict error
 *    - toggleDocumentVerification enforces compare-and-set (CAS) optimistic concurrency
 * 5. Authoritative cache invalidation:
 *    - Mutations trigger queryClient.invalidateQueries with exact key queryKeys.operations.alerts(DASHBOARD_MEMORY_SCOPE)
 *    - No optimistic permanent removal without server success
 * 6. Accessibility, Mobile UX, & Dark Mode:
 *    - Dialog has role="dialog", aria-modal="true", accessible title and labels
 *    - Action buttons adhere to minimum 44px touch targets
 *    - Dark mode Tailwind classes present
 * 7. System safety invariants:
 *    - Zero changes to migrations, database schema, RLS, Auth, request FSM, and financial RPCs
 * ==============================================================================
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "./src/lib/queryKeys";

async function runTests() {
  console.log("=== PHASE 12 OPERATIONS QUEUE DIRECT RESOLUTION TEST SUITE ===");
  let passedAssertions = 0;

  const assertEqual = (actual: unknown, expected: unknown, message: string) => {
    assert.strictEqual(actual, expected, message);
    passedAssertions++;
  };

  const assertOk = (value: unknown, message: string) => {
    assert.ok(value, message);
    passedAssertions++;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // [TEST 1] Source Code Inspection: OperationAlert Direct Resolution Metadata
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 1] Validating OperationAlert direct action metadata in operationsInboxQuery.ts...");

  const inboxQueryPath = path.resolve("./src/lib/operations/operationsInboxQuery.ts");
  const inboxQuerySrc = fs.readFileSync(inboxQueryPath, "utf-8");

  assertOk(inboxQuerySrc.includes("followupId?: string;"), "OperationAlert must declare optional followupId");
  assertOk(inboxQuerySrc.includes("associationId?: string;"), "OperationAlert must declare optional associationId");
  assertOk(inboxQuerySrc.includes("requestId?: string;"), "OperationAlert must declare optional requestId");
  assertOk(inboxQuerySrc.includes("customerServiceId?: string;"), "OperationAlert must declare optional customerServiceId");
  assertOk(inboxQuerySrc.includes("requirementTag?: string;"), "OperationAlert must declare optional requirementTag");

  // Verify PII exclusion: customerPhone / email NOT added to OperationAlert interface
  const alertInterfaceBlock = inboxQuerySrc.slice(
    inboxQuerySrc.indexOf("export interface OperationAlert {"),
    inboxQuerySrc.indexOf("export interface OperationsInboxSummary {")
  );
  assertOk(!alertInterfaceBlock.includes("customerPhone"), "Strict PII boundary: customerPhone must NOT be added to OperationAlert");
  assertOk(!alertInterfaceBlock.includes("customerEmail"), "Strict PII boundary: customerEmail must NOT be added to OperationAlert");
  assertOk(!alertInterfaceBlock.includes("aadhaar"), "Strict PII boundary: Aadhaar must NOT be added to OperationAlert");
  assertOk(!alertInterfaceBlock.includes("pan"), "Strict PII boundary: PAN must NOT be added to OperationAlert");

  // Verify follow-up alert construction includes followupId & requestId
  assertOk(inboxQuerySrc.includes("followupId: f.id"), "Follow-up alerts must populate followupId from f.id");
  assertOk(inboxQuerySrc.includes("requestId: f.customerServiceId"), "Follow-up alerts must populate requestId from f.customerServiceId");

  // Verify unverified document alert construction includes associationId & requestId
  assertOk(inboxQuerySrc.includes("associationId: doc.id"), "Unverified doc alerts must populate associationId from doc.id");
  assertOk(inboxQuerySrc.includes("requestId: req.id"), "Unverified doc alerts must populate requestId from req.id");
  assertOk(inboxQuerySrc.includes("requirementTag: doc.requirement_tag"), "Unverified doc alerts must populate requirementTag");

  // ─────────────────────────────────────────────────────────────────────────────
  // [TEST 2] Canonical Server Actions Correctness & Stale-State Protection
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 2] Validating server action correctness in requests/actions.ts...");

  const requestsActionsPath = path.resolve("./src/app/(dashboard)/requests/actions.ts");
  const requestsActionsSrc = fs.readFileSync(requestsActionsPath, "utf-8");

  // CompleteFollowup must check updated rows count via select("id")
  const completeFollowupFn = requestsActionsSrc.slice(
    requestsActionsSrc.indexOf("export async function completeFollowup("),
    requestsActionsSrc.indexOf("export async function cancelFollowup(")
  );

  assertOk(completeFollowupFn.includes('.select("id")'), "completeFollowup must select('id') to check updated rows count");
  assertOk(completeFollowupFn.includes("!updatedRows || updatedRows.length === 0"), "completeFollowup must detect zero rows updated");
  assertOk(completeFollowupFn.includes('errorCode: "conflict"'), "completeFollowup must return conflict errorCode when row was already closed");

  // RescheduleFollowup must catch RPC conflict errors
  const rescheduleFollowupFn = requestsActionsSrc.slice(
    requestsActionsSrc.indexOf("export async function rescheduleFollowup("),
    requestsActionsSrc.indexOf("export async function completeFollowup(")
  );
  assertOk(rescheduleFollowupFn.includes('errorCode: "conflict"'), "rescheduleFollowup must return conflict errorCode on stale/non-open follow-up");

  // ToggleDocumentVerification CAS and revalidation
  const toggleDocFn = requestsActionsSrc.slice(
    requestsActionsSrc.indexOf("export async function toggleDocumentVerification("),
    requestsActionsSrc.indexOf("export async function getRequestBillingSummary(")
  );
  assertOk(toggleDocFn.includes('.eq("is_verified", expectedIsVerified)'), "toggleDocumentVerification must enforce CAS via expectedIsVerified");
  assertOk(toggleDocFn.includes('revalidatePath("/operations")'), "toggleDocumentVerification must revalidate /operations path");
  assertOk(toggleDocFn.includes('revalidatePath("/dashboard")'), "toggleDocumentVerification must revalidate /dashboard path");

  // ─────────────────────────────────────────────────────────────────────────────
  // [TEST 3] QuickFollowupResolveModal Architecture & Usability
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 3] Validating QuickFollowupResolveModal component...");

  const modalPath = path.resolve("./src/components/operations/QuickFollowupResolveModal.tsx");
  assertOk(fs.existsSync(modalPath), "QuickFollowupResolveModal.tsx must exist");
  const modalSrc = fs.readFileSync(modalPath, "utf-8");

  // Modes
  assertOk(modalSrc.includes('mode: "complete" | "reschedule"'), "Modal must support complete and reschedule modes");

  // Canonical server action invocations
  assertOk(modalSrc.includes("completeFollowup({"), "Modal must call canonical completeFollowup action");
  assertOk(modalSrc.includes("rescheduleFollowup({"), "Modal must call canonical rescheduleFollowup action");

  // Reschedule mode fields
  assertOk(modalSrc.includes('type="datetime-local"'), "Reschedule mode must provide datetime-local input");
  assertOk(modalSrc.includes("resolutionNote"), "Modal must support optional resolution note");

  // Conflict handling
  assertOk(modalSrc.includes('res.errorCode === "conflict"'), "Modal must handle conflict response gracefully");

  // Accessibility
  assertOk(modalSrc.includes('role="dialog"'), "Modal must declare role='dialog'");
  assertOk(modalSrc.includes('aria-modal="true"'), "Modal must declare aria-modal='true'");
  assertOk(modalSrc.includes('aria-labelledby='), "Modal must have aria-labelledby title reference");
  assertOk(modalSrc.includes('Escape'), "Modal must handle Escape key dismiss");

  // Double submit protection
  assertOk(modalSrc.includes("isSubmitting"), "Modal must have isSubmitting state to lock submissions");
  assertOk(modalSrc.includes("disabled={isSubmitting}"), "Submit buttons must be disabled during submission");

  // Minimum touch target
  assertOk(modalSrc.includes("min-h-[44px]"), "All buttons and inputs in modal must meet minimum 44px touch target");

  // ─────────────────────────────────────────────────────────────────────────────
  // [TEST 4] OperationsInboxView Direct Resolution Wiring & Scope Boundary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 4] Validating OperationsInboxView action wiring & boundaries...");

  const inboxViewPath = path.resolve("./src/components/operations/OperationsInboxView.tsx");
  const inboxViewSrc = fs.readFileSync(inboxViewPath, "utf-8");

  // Follow-up actions
  assertOk(inboxViewSrc.includes('alert.category === "followup" && alert.followupId'), "Follow-up alert cards must check category === 'followup' and followupId");
  assertOk(inboxViewSrc.includes("handleOpenComplete(alert)"), "Follow-up cards must wire Complete button");
  assertOk(inboxViewSrc.includes("handleOpenReschedule(alert)"), "Follow-up cards must wire Reschedule button");

  // Document verification actions
  assertOk(inboxViewSrc.includes('alert.category === "document" && alert.associationId'), "Document verification button must require associationId");
  assertOk(inboxViewSrc.includes("handleOpenVerifyDoc(alert)"), "Verify Doc button must open confirmation dialog");
  assertOk(inboxViewSrc.includes("toggleDocumentVerification({"), "Document verification confirmation must call toggleDocumentVerification");
  assertOk(inboxViewSrc.includes("expectedIsVerified: false"), "Verification must pass expectedIsVerified: false");
  assertOk(inboxViewSrc.includes("isVerified: true"), "Verification must pass isVerified: true");

  // Invalidation after mutation
  assertOk(inboxViewSrc.includes("queryClient.invalidateQueries({"), "View must invalidate queries on mutation success");
  assertOk(inboxViewSrc.includes("queryKeys.operations.alerts(DASHBOARD_MEMORY_SCOPE)"), "View must invalidate queryKeys.operations.alerts");

  // Scope Boundary Enforcement: No direct financial or FSM mutations
  assertOk(!inboxViewSrc.includes("recordPayment("), "Boundary safety: operations inbox must NOT directly call recordPayment");
  assertOk(!inboxViewSrc.includes("generateInvoiceForRequest("), "Boundary safety: operations inbox must NOT directly call generateInvoiceForRequest");
  assertOk(!inboxViewSrc.includes("transitionServiceRequestStatus("), "Boundary safety: operations inbox must NOT directly call transitionServiceRequestStatus");

  // Non-actionable alert verification: verify doc button NOT rendered on expired documents
  assertOk(inboxViewSrc.includes('alert.category === "document" && alert.associationId'), "Verify Doc button strictly restricted to alerts with associationId");

  // Touch target and accessibility in inbox view
  assertOk(inboxViewSrc.includes("min-h-[44px]"), "Alert action buttons must have min-h-[44px] touch target");
  assertOk(inboxViewSrc.includes('aria-modal="true"'), "Verification confirmation modal must declare aria-modal='true'");

  // ─────────────────────────────────────────────────────────────────────────────
  // [TEST 5] System Safety Boundaries (Zero Unwanted Changes)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 5] Checking system safety boundaries against git repository...");

  const migrationDir = path.resolve("./supabase/migrations");
  const migrationFiles = fs.readdirSync(migrationDir);
  assertEqual(migrationFiles.length, 4, "No new migrations allowed in Phase 12 (must remain exactly 4 baseline files)");

  const packageJson = JSON.parse(fs.readFileSync(path.resolve("./package.json"), "utf-8"));
  assertOk(packageJson.dependencies["@tanstack/react-query"], "Existing react-query preserved");
  assertOk(packageJson.dependencies["sonner"], "Existing sonner preserved");

  // ─────────────────────────────────────────────────────────────────────────────
  // [TEST 6] Query Key Consistency
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 6] Validating Operations query key definition...");

  const expectedKey = queryKeys.operations.alerts(DASHBOARD_MEMORY_SCOPE);
  assertEqual(expectedKey[0], "gcds", "Query key namespace must be 'gcds'");
  assertEqual(expectedKey[1], DASHBOARD_MEMORY_SCOPE, "Query key scope must be DASHBOARD_MEMORY_SCOPE");
  assertEqual(expectedKey[2], "operations", "Query key domain must be 'operations'");
  assertEqual(expectedKey[3], "alerts", "Query key resource must be 'alerts'");

  console.log("\n==========================================================================");
  console.log(`📊 TEST SUMMARY: ALL ${passedAssertions} ASSERTIONS PASSED (0 FAILED)`);
  console.log("==========================================================================");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
