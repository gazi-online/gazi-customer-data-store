/**
 * GCDS — MILESTONE 10 PHASE 2C-3C
 * TEST SUITE: ENFORCEMENT MIGRATION STATIC TESTS
 * File: test-phase2c-3c-enforcement-migration.ts
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runEnforcementMigrationTests() {
  console.log("=== RUNNING PHASE 2C-3C ENFORCEMENT MIGRATION STATIC SUITE ===");

  const enfPath = path.join(__dirname, "phase2c3c_atomic_billing_enforcement_migration.sql");
  assert(fs.existsSync(enfPath), `Enforcement migration file not found at ${enfPath}`);
  const sql = fs.readFileSync(enfPath, "utf-8");

  // 1. Transaction wrapping
  assert(sql.includes("BEGIN;"), "ENFORCEMENT must include BEGIN;");
  assert(sql.trim().endsWith("COMMIT;"), "ENFORCEMENT must end with COMMIT;");
  console.log("  [PASS] 1. Transaction wrapping verified");

  // 2. Preconditions: Draft allocations, multi-request, customer mismatch
  assert(
    sql.includes("SELECT COUNT(*) INTO v_draft_alloc_count") &&
    sql.includes("WHERE i.status = 'draft'") &&
    sql.includes("RAISE EXCEPTION 'PRECONDITION FAILED: % payment allocation(s) point to draft invoices"),
    "ENFORCEMENT must assert precondition of 0 draft invoice payment allocations"
  );
  assert(
    sql.includes("HAVING COUNT(DISTINCT customer_service_id) > 1"),
    "ENFORCEMENT must check that no existing invoices link to multiple customer services"
  );
  assert(
    sql.includes("inv.customer_id != cs.customer_id"),
    "ENFORCEMENT must verify customer identity consistency"
  );
  console.log("  [PASS] 2. Preconditions verified (draft allocations, multi-request, customer mismatch)");

  // 3. RLS Direct INSERT Narrowing & Table Privilege Revocations
  assert(sql.includes('DROP POLICY IF EXISTS "Invoices Tenant INSERT Policy" ON public.invoices;'), "Must drop direct invoices INSERT policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Invoice Items Tenant INSERT Policy" ON public.invoice_items;'), "Must drop direct invoice_items INSERT policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Invoice Items Tenant UPDATE Policy" ON public.invoice_items;'), "Must drop direct invoice_items UPDATE policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Payments Tenant INSERT Policy" ON public.payments;'), "Must drop direct payments INSERT policy");
  assert(sql.includes("REVOKE INSERT ON public.invoices FROM PUBLIC, anon, authenticated;"), "Must revoke INSERT on invoices");
  assert(sql.includes("REVOKE INSERT, UPDATE, DELETE ON public.invoice_items FROM PUBLIC, anon, authenticated;"), "Must revoke INSERT, UPDATE, DELETE on invoice_items");
  assert(sql.includes("REVOKE INSERT ON public.payments FROM PUBLIC, anon, authenticated;"), "Must revoke INSERT on payments");
  console.log("  [PASS] 3. Direct client INSERT RLS narrowing & table privilege revocations verified");

  // 4. Concurrency-Safe Single-Request Trigger with Parent Lock
  assert(
    sql.includes("PERFORM id") &&
    sql.includes("FROM public.invoices") &&
    sql.includes("WHERE id = NEW.invoice_id") &&
    sql.includes("FOR UPDATE;"),
    "Single-request trigger must serialize line-item insertion via parent invoice row lock FOR UPDATE"
  );
  assert(
    sql.includes("trg_enforce_single_request_invoice") &&
    sql.includes("Single-request invoice violation"),
    "Single-request trigger must reject multiple requests per invoice"
  );
  console.log("  [PASS] 4. Concurrency-safe single-request trigger verified");

  // 5. Immutability triggers: customer_services.customer_id and payment_status
  assert(sql.includes("trg_protect_customer_service_identity"), "Must protect customer_services.customer_id immutability");
  assert(sql.includes("trg_protect_customer_service_payment_status_insert"), "Must enforce initial unpaid on insert");
  assert(sql.includes("trg_protect_customer_service_payment_status_update"), "Must block direct update of payment_status");
  console.log("  [PASS] 5. customer_services identity & payment_status protection verified");

  // 6. Snapshot immutability: invoices, invoice_items, and payments
  assert(sql.includes("trg_protect_invoices_identity"), "Must protect invoices financial snapshot & idempotency fields");
  assert(sql.includes("trg_protect_invoice_item_snapshot"), "Must protect invoice_items snapshot fields");
  assert(sql.includes("trg_protect_payments_ledger"), "Must protect payments amount, customer, and status");
  console.log("  [PASS] 6. Snapshot immutability verified");

  // 7. Least privilege effective surface
  assert(sql.includes("GRANT SELECT ON public.invoices TO authenticated;"), "Invoices select granted to authenticated");
  assert(sql.includes("GRANT SELECT ON public.invoice_items TO authenticated;"), "Invoice items select granted to authenticated");
  assert(sql.includes("GRANT SELECT ON public.payments TO authenticated;"), "Payments select granted to authenticated");
  assert(sql.includes("GRANT SELECT ON public.payment_allocations TO authenticated;"), "Payment allocations select granted to authenticated");
  console.log("  [PASS] 7. Least privilege surface verified");

  console.log("=== ALL ENFORCEMENT MIGRATION STATIC TESTS PASSED ===");
}

if (require.main === module) {
  runEnforcementMigrationTests();
}
