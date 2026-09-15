/**
 * GCDS — MILESTONE 10 PHASE 2C-3C
 * TEST SUITE: REQUEST PAYMENT-STATUS LEDGER FORMULA & DRAFT SEMANTICS
 * File: test-phase2c-3c-payment-status-ledger.ts
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Canonical Formula Evaluator
function evaluateCanonicalPaymentStatus(params: {
  currentStatus: 'unpaid' | 'partial' | 'paid' | 'waived';
  invoices: Array<{
    status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';
    total_amount: number;
    paid_amount: number;
    due_amount: number;
  }>;
}): 'unpaid' | 'partial' | 'paid' | 'waived' {
  const { currentStatus, invoices } = params;

  // Financially active invoices only: draft and cancelled are strictly excluded
  const activeInvoices = invoices.filter(i => ['issued', 'partially_paid', 'paid'].includes(i.status));
  const activeCount = activeInvoices.length;
  const totalPaid = activeInvoices.reduce((sum, i) => sum + i.paid_amount, 0);
  const balanceDue = activeInvoices.reduce((sum, i) => sum + i.due_amount, 0);

  if (currentStatus === 'waived' && activeCount === 0) {
    return 'waived';
  } else if (activeCount === 0) {
    return 'unpaid';
  } else if (totalPaid === 0) {
    return 'unpaid';
  } else if (balanceDue === 0 && totalPaid > 0) {
    return 'paid';
  } else {
    return 'partial';
  }
}

function runLedgerTests() {
  console.log("=== RUNNING PHASE 2C-3C PAYMENT-STATUS LEDGER FORMULA TESTS ===");

  // 1. Zero invoices -> unpaid
  assert(
    evaluateCanonicalPaymentStatus({ currentStatus: 'unpaid', invoices: [] }) === 'unpaid',
    "Zero invoices should be unpaid"
  );
  console.log("  [PASS] 1. Zero invoices -> unpaid");

  // 2. Draft invoices do NOT establish debt
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'unpaid',
      invoices: [{ status: 'draft', total_amount: 500, paid_amount: 0, due_amount: 500 }]
    }) === 'unpaid',
    "Draft invoice must not change status"
  );
  console.log("  [PASS] 2. Draft invoices do NOT establish request debt");

  // 3. Draft invoice does NOT clear waived status
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'waived',
      invoices: [{ status: 'draft', total_amount: 500, paid_amount: 0, due_amount: 500 }]
    }) === 'waived',
    "Draft invoice must not clear waiver"
  );
  console.log("  [PASS] 3. Draft invoice preserves waived status");

  // 4. Issued draft clears waiver and becomes unpaid
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'waived',
      invoices: [{ status: 'issued', total_amount: 500, paid_amount: 0, due_amount: 500 }]
    }) === 'unpaid',
    "Issued invoice clears waiver and becomes unpaid"
  );
  console.log("  [PASS] 4. Issued invoice clears waiver and establishes debt");

  // 5. Partial payment on issued invoice -> partial
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'unpaid',
      invoices: [{ status: 'partially_paid', total_amount: 500, paid_amount: 200, due_amount: 300 }]
    }) === 'partial',
    "Partially paid invoice -> partial"
  );
  console.log("  [PASS] 5. Partial payment yields partial status");

  // 6. Full payment on issued invoice -> paid
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'partial',
      invoices: [{ status: 'paid', total_amount: 500, paid_amount: 500, due_amount: 0 }]
    }) === 'paid',
    "Full payment -> paid"
  );
  console.log("  [PASS] 6. Fully paid invoice yields paid status");

  // 7. Supplemental draft on paid request does NOT change paid status
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'paid',
      invoices: [
        { status: 'paid', total_amount: 500, paid_amount: 500, due_amount: 0 },
        { status: 'draft', total_amount: 200, paid_amount: 0, due_amount: 200 }
      ]
    }) === 'paid',
    "Draft supplemental invoice must not change paid status"
  );
  console.log("  [PASS] 7. Draft supplemental does not disrupt paid status");

  // 8. Supplemental issued invoice changes paid -> partial
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'paid',
      invoices: [
        { status: 'paid', total_amount: 500, paid_amount: 500, due_amount: 0 },
        { status: 'issued', total_amount: 200, paid_amount: 0, due_amount: 200 }
      ]
    }) === 'partial',
    "Issued supplemental invoice with due balance changes status to partial"
  );
  console.log("  [PASS] 8. Issued supplemental with balance due yields partial");

  // 9. Cancelled invoice is excluded
  assert(
    evaluateCanonicalPaymentStatus({
      currentStatus: 'unpaid',
      invoices: [{ status: 'cancelled', total_amount: 500, paid_amount: 0, due_amount: 0 }]
    }) === 'unpaid',
    "Cancelled invoice has zero active effect"
  );
  console.log("  [PASS] 9. Cancelled invoice is excluded from totals");

  // 10. Check compat migration SQL sync triggers structure
  const migrationPath = path.join(__dirname, "phase2c3c_atomic_billing_compat_migration.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");
  assert(
    sql.includes("trg_sync_request_payment_status_on_item") &&
    sql.includes("trg_sync_request_payment_status_on_invoice"),
    "Compat migration must include synchronization triggers on invoice_items and invoices"
  );
  console.log("  [PASS] 10. SQL synchronization triggers verified");

  console.log("=== ALL PAYMENT-STATUS LEDGER FORMULA TESTS PASSED ===");
}

runLedgerTests();
