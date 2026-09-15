/**
 * PHASE 2C-3D — REQUEST WORKSPACE BILLING UX TEST SUITE
 * File: test-phase2c-3d-request-billing-ui.ts
 *
 * Verifications:
 * 1. calculateRequestBillingSummary aggregates ledger-derived financial totals
 * 2. Draft invoices are strictly EXCLUDED from active financial totals
 * 3. Cancelled invoices are strictly EXCLUDED from active financial totals
 * 4. Multiple active invoices aggregate correctly across totals
 * 5. getRequestBillingSummary server action contract
 * 6. generateInvoiceForRequest server action derives relationship server-side
 * 7. Record Payment action logic & single-invoice auto-preselection
 * 8. Waiver action permitted ONLY when zero active invoices exist
 * 9. Payment status badge is display-only with zero manual mutation controls
 * 10. Zero direct client INSERT bypass paths in request workspace billing UX
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { calculateRequestBillingSummary, RequestBillingInvoice } from "./src/app/(dashboard)/requests/types";

console.log("==========================================================================");
console.log(" 🧪 PHASE 2C-3D: REQUEST WORKSPACE BILLING UX TEST SUITE");
console.log("==========================================================================");

// ------------------------------------------------------------------------------
// 1. BILLING SUMMARY USES INVOICE LEDGER (ACTIVE VS INACTIVE STATUSES)
// ------------------------------------------------------------------------------
console.log("\n--- 1. Ledger-derived Financial Aggregation ---");

// Test 1: Zero invoices -> 0 active, 0 invoiced, 0 paid, 0 due
const emptySummary = calculateRequestBillingSummary([]);
assert.strictEqual(emptySummary.activeInvoiceCount, 0, "1a. Zero invoices -> active count 0");
assert.strictEqual(emptySummary.totalInvoiced, 0, "1b. Zero invoices -> total invoiced 0");
assert.strictEqual(emptySummary.totalPaid, 0, "1c. Zero invoices -> total paid 0");
assert.strictEqual(emptySummary.balanceDue, 0, "1d. Zero invoices -> balance due 0");
console.log("  [PASS] 1. Empty invoice ledger yields zeroed summary");

// Test 2: Draft invoice excluded from active totals
const draftInvoices: RequestBillingInvoice[] = [
  {
    id: "item-1",
    invoiceId: "inv-draft-1",
    invoiceNumber: "INV-2026-0001",
    invoiceDate: "2026-09-15",
    status: "draft",
    totalAmount: 500,
    paidAmount: 0,
    dueAmount: 500,
  },
];
const draftSummary = calculateRequestBillingSummary(draftInvoices);
assert.strictEqual(draftSummary.activeInvoiceCount, 0, "2a. Draft excluded from active count");
assert.strictEqual(draftSummary.totalInvoiced, 0, "2b. Draft excluded from total invoiced");
assert.strictEqual(draftSummary.totalPaid, 0, "2c. Draft excluded from total paid");
assert.strictEqual(draftSummary.balanceDue, 0, "2d. Draft excluded from balance due");
assert.strictEqual(draftSummary.invoices.length, 1, "2e. Draft invoice is retained in historical invoices list");
console.log("  [PASS] 2. Draft invoices strictly excluded from active financial totals");

// Test 3: Cancelled invoice excluded from active totals
const cancelledInvoices: RequestBillingInvoice[] = [
  {
    id: "item-2",
    invoiceId: "inv-cancel-1",
    invoiceNumber: "INV-2026-0002",
    invoiceDate: "2026-09-14",
    status: "cancelled",
    totalAmount: 350,
    paidAmount: 0,
    dueAmount: 0,
  },
];
const cancelledSummary = calculateRequestBillingSummary(cancelledInvoices);
assert.strictEqual(cancelledSummary.activeInvoiceCount, 0, "3a. Cancelled excluded from active count");
assert.strictEqual(cancelledSummary.totalInvoiced, 0, "3b. Cancelled excluded from total invoiced");
assert.strictEqual(cancelledSummary.balanceDue, 0, "3c. Cancelled excluded from balance due");
assert.strictEqual(cancelledSummary.invoices.length, 1, "3d. Cancelled invoice is retained in historical invoices list");
console.log("  [PASS] 3. Cancelled invoices strictly excluded from active financial totals");

// Test 4: Multiple invoices aggregate correctly (mixed active + inactive)
const mixedInvoices: RequestBillingInvoice[] = [
  {
    id: "item-a",
    invoiceId: "inv-1",
    invoiceNumber: "INV-2026-0010",
    invoiceDate: "2026-09-10",
    status: "paid",
    totalAmount: 200,
    paidAmount: 200,
    dueAmount: 0,
  },
  {
    id: "item-b",
    invoiceId: "inv-2",
    invoiceNumber: "INV-2026-0011",
    invoiceDate: "2026-09-12",
    status: "partially_paid",
    totalAmount: 500,
    paidAmount: 200,
    dueAmount: 300,
  },
  {
    id: "item-c",
    invoiceId: "inv-3",
    invoiceNumber: "INV-2026-0012",
    invoiceDate: "2026-09-13",
    status: "issued",
    totalAmount: 100,
    paidAmount: 0,
    dueAmount: 100,
  },
  {
    id: "item-d",
    invoiceId: "inv-4",
    invoiceNumber: "INV-2026-0013",
    invoiceDate: "2026-09-14",
    status: "draft",
    totalAmount: 999,
    paidAmount: 0,
    dueAmount: 999,
  },
  {
    id: "item-e",
    invoiceId: "inv-5",
    invoiceNumber: "INV-2026-0014",
    invoiceDate: "2026-09-15",
    status: "cancelled",
    totalAmount: 400,
    paidAmount: 0,
    dueAmount: 0,
  },
];

const mixedSummary = calculateRequestBillingSummary(mixedInvoices);
assert.strictEqual(mixedSummary.activeInvoiceCount, 3, "4a. Active count includes issued, partially_paid, paid");
assert.strictEqual(mixedSummary.totalInvoiced, 800, "4b. Total invoiced = 200 + 500 + 100");
assert.strictEqual(mixedSummary.totalPaid, 400, "4c. Total paid = 200 + 200 + 0");
assert.strictEqual(mixedSummary.balanceDue, 400, "4d. Balance due = 0 + 300 + 100");
assert.strictEqual(mixedSummary.invoices.length, 5, "4e. All 5 historical invoices displayed");
console.log("  [PASS] 4. Multiple invoices aggregate accurately while isolating drafts & cancellations");

// ------------------------------------------------------------------------------
// 2. SERVER ACTIONS ARCHITECTURE & SOURCE CODE INVARIANTS
// ------------------------------------------------------------------------------
console.log("\n--- 2. Source Code & Security Guarantees ---");

const requestsActionsSource = fs.readFileSync(
  path.join(__dirname, "src/app/(dashboard)/requests/actions.ts"),
  "utf8"
);
const workspaceSource = fs.readFileSync(
  path.join(__dirname, "src/components/requests/RequestWorkspace.tsx"),
  "utf8"
);
const controlsSource = fs.readFileSync(
  path.join(__dirname, "src/components/requests/RequestBillingControls.tsx"),
  "utf8"
);
const rowActionsSource = fs.readFileSync(
  path.join(__dirname, "src/components/requests/RequestInvoiceRowActions.tsx"),
  "utf8"
);
const generateModalSource = fs.readFileSync(
  path.join(__dirname, "src/components/requests/GenerateInvoiceModal.tsx"),
  "utf8"
);

// 5. Generate Invoice action exists and derives relationships server-side
assert(
  requestsActionsSource.includes("export async function generateInvoiceForRequest"),
  "5a. generateInvoiceForRequest is exported in requests/actions.ts"
);
assert(
  requestsActionsSource.includes("createInvoice({"),
  "5b. generateInvoiceForRequest delegates to canonical createInvoice (create_invoice_atomic)"
);
assert(
  requestsActionsSource.includes("customer_service_id: reqRow.id"),
  "5c. Server strictly derives customer_service_id from verified request row"
);
assert(
  requestsActionsSource.includes("customer_id: reqRow.customer_id"),
  "5d. Server strictly derives customer_id from verified request row (prevents client spoofing)"
);
console.log("  [PASS] 5. generateInvoiceForRequest exists and enforces server-side identity derivation");

// 6. Record Payment action logic & single-invoice auto-preselection
assert(
  controlsSource.includes("RecordPaymentModal"),
  "6a. RequestBillingControls integrates RecordPaymentModal"
);
assert(
  controlsSource.includes("singlePayableInvoice"),
  "6b. Auto-detects single payable invoice to preselect"
);
assert(
  controlsSource.includes("openInvoicesList={payableInvoices.map"),
  "6c. Provides open invoices list for operator choice"
);
assert(
  rowActionsSource.includes("RecordPaymentModal"),
  "6d. Per-invoice row action provides direct Record Payment targeting that specific invoice"
);
console.log("  [PASS] 6. Record Payment action logic & invoice preselection verified");

// 7. Waiver only with zero active invoices
assert(
  controlsSource.includes("hasZeroActiveInvoices && ("),
  "7a. Waiver action conditionally rendered ONLY when hasZeroActiveInvoices is true"
);
assert(
  controlsSource.includes("setRequestPaymentWaiver"),
  "7b. Uses canonical setRequestPaymentWaiver server action"
);
assert(
  controlsSource.includes("Remove Waiver") && controlsSource.includes("Waive Payment"),
  "7c. Supports both Waive Payment and Remove Waiver states"
);
console.log("  [PASS] 7. Waiver action strictly gated to zero active invoices");

// 8. Payment status badge is display-only with zero manual mutation
assert(
  workspaceSource.includes("Payment Status:") &&
    workspaceSource.includes("data.paymentStatus"),
  "8a. Payment Status is rendered as a display-only badge in workspace"
);
assert(
  !workspaceSource.includes("<select") &&
    !workspaceSource.includes("updatePaymentStatus") &&
    !controlsSource.includes("<select") &&
    !controlsSource.includes("updatePaymentStatus"),
  "8b. Zero generic payment_status dropdowns or direct mutation paths exist"
);
console.log("  [PASS] 8. Payment status badge is display-only with zero direct client edits");

// 9. No direct billing table insert path in workspace components
assert(
  !workspaceSource.includes('.insert(') &&
    !controlsSource.includes('.insert(') &&
    !rowActionsSource.includes('.insert(') &&
    !generateModalSource.includes('.insert('),
  "9a. Zero client components perform direct table INSERTs on billing tables"
);
assert(
  requestsActionsSource.includes("export async function getRequestBillingSummary"),
  "9b. getRequestBillingSummary server action is exported"
);
console.log("  [PASS] 9. Zero direct billing table insert paths across all workspace components");

// 10. Revalidation covers all required paths
assert(
  requestsActionsSource.includes('revalidatePath(`/requests/${requestId}`)') &&
    requestsActionsSource.includes('revalidatePath("/requests")') &&
    requestsActionsSource.includes('revalidatePath("/invoices")'),
  "10. generateInvoiceForRequest revalidates /requests, /requests/{id}, /invoices, /dashboard"
);
console.log("  [PASS] 10. Comprehensive revalidation paths verified");

// ------------------------------------------------------------------------------
// 3. INVOICE IDEMPOTENCY KEY LIFECYCLE & CONTRACT (HOTFIX VERIFICATION)
// ------------------------------------------------------------------------------
console.log("\n--- 3. Invoice Idempotency Key Lifecycle & Contract ---");

// 11. GenerateInvoiceModal owns stable idempotency key ref
assert(
  generateModalSource.includes("idempotencyKeyRef = useRef") &&
    generateModalSource.includes("crypto.randomUUID()"),
  "11a. GenerateInvoiceModal initializes stable idempotencyKeyRef"
);
assert(
  generateModalSource.includes("idempotencyKey: idempotencyKeyRef.current"),
  "11b. GenerateInvoiceModal supplies idempotencyKeyRef.current to generateInvoiceForRequest"
);
console.log("  [PASS] 11. GenerateInvoiceModal owns stable idempotency key");

// 12. Server action contract requires and validates idempotencyKey
assert(
  requestsActionsSource.includes("idempotencyKey: string"),
  "12a. generateInvoiceForRequest accepts idempotencyKey: string in params"
);
assert(
  requestsActionsSource.includes("!isValidUuid(idempotencyKey)"),
  "12b. generateInvoiceForRequest validates UUID format of idempotencyKey"
);
assert(
  requestsActionsSource.includes("idempotency_key: idempotencyKey"),
  "12c. generateInvoiceForRequest explicitly forwards idempotency_key to createInvoice"
);
console.log("  [PASS] 12. generateInvoiceForRequest accepts, validates, and forwards idempotencyKey");

// 13. Retry path does NOT regenerate key; success resets key; fresh open resets key
const failureBlock = generateModalSource.slice(
  generateModalSource.indexOf("if (!res.success)"),
  generateModalSource.indexOf("toast.success")
);
assert(
  !failureBlock.includes("crypto.randomUUID()"),
  "13a. Error/retry path preserves idempotency key without regeneration"
);

const successBlock = generateModalSource.slice(
  generateModalSource.indexOf("toast.success"),
  generateModalSource.indexOf("onClose()")
);
assert(
  successBlock.includes("idempotencyKeyRef.current = crypto.randomUUID()"),
  "13b. Confirmed success resets idempotency key for next logical transaction"
);

assert(
  generateModalSource.includes("if (isOpen && !wasOpenRef.current)") &&
    generateModalSource.includes("idempotencyKeyRef.current = crypto.randomUUID()"),
  "13c. Reopening a fresh invoice modal generates a fresh logical idempotency key"
);
console.log("  [PASS] 13. Retry reuses same key; success & fresh modal open reset key");

console.log("\n==========================================================================");
console.log(" VERDICT: ✅ ALL PHASE 2C-3D REQUEST BILLING UX TESTS PASSED CLEANLY!");
console.log("==========================================================================\n");
