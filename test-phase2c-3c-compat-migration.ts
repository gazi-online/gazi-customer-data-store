/**
 * GCDS — MILESTONE 10 PHASE 2C-3C
 * TEST SUITE: COMPAT MIGRATION STATIC TESTS
 * File: test-phase2c-3c-compat-migration.ts
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runCompatMigrationTests() {
  console.log("=== RUNNING PHASE 2C-3C COMPAT MIGRATION STATIC SUITE ===");

  const compatPath = path.join(__dirname, "phase2c3c_atomic_billing_compat_migration.sql");
  assert(fs.existsSync(compatPath), `Compat migration file not found at ${compatPath}`);
  const sql = fs.readFileSync(compatPath, "utf-8");

  // 1. Transaction wrapping
  assert(sql.includes("BEGIN;"), "COMPAT must include BEGIN;");
  assert(sql.trim().endsWith("COMMIT;"), "COMPAT must end with COMMIT;");
  console.log("  [PASS] 1. COMPAT transaction wrapping verified");

  // 2. Idempotency columns and unique indexes
  assert(sql.includes("ADD COLUMN IF NOT EXISTS idempotency_key UUID"), "Must add idempotency_key to invoices & payments");
  assert(sql.includes("ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT"), "Must add idempotency_fingerprint to invoices & payments");
  assert(sql.includes("idx_invoices_customer_idempotency"), "Must create unique index on invoices(customer_id, idempotency_key)");
  assert(sql.includes("idx_payments_customer_idempotency"), "Must create unique index on payments(customer_id, idempotency_key)");
  console.log("  [PASS] 2. Idempotency columns & indexes verified");

  // 3. Line position column on invoice_items
  assert(sql.includes("ALTER TABLE public.invoice_items"), "Must alter invoice_items");
  assert(sql.includes("ADD COLUMN IF NOT EXISTS line_position INTEGER;"), "Must add line_position column");
  assert(sql.includes("idx_invoice_items_line_position"), "Must index invoice_items(invoice_id, line_position)");
  console.log("  [PASS] 3. line_position column & index verified");

  // 4. Atomic RPCs
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.create_invoice_atomic"), "Must define create_invoice_atomic");
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.record_payment_atomic"), "Must define record_payment_atomic");
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.record_payment_and_allocate_atomic"), "Must define record_payment_and_allocate_atomic");
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.allocate_payment_atomic"), "Must define allocate_payment_atomic");
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.unallocate_payment_atomic"), "Must define unallocate_payment_atomic");
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.set_request_payment_waiver"), "Must define set_request_payment_waiver");
  console.log("  [PASS] 4. All atomic RPCs present");

  // 5. Line order derived from JSON array ordinality in create_invoice_atomic
  assert(
    sql.includes("WITH ORDINALITY AS ord(item_json, pos)") &&
    sql.includes("ord.pos::integer AS line_position") &&
    sql.includes("v_item.line_position"),
    "create_invoice_atomic must derive line_position from jsonb_array_elements WITH ORDINALITY"
  );
  console.log("  [PASS] 5. line_position JSON ordinality derivation verified");

  // 6. Unallocate RPC requirements
  assert(
    sql.includes("CREATE OR REPLACE FUNCTION public.unallocate_payment_atomic") &&
    sql.includes("DELETE FROM public.payment_allocations") &&
    sql.includes("recalculate_invoice_financials") &&
    sql.includes("recalculate_customer_service_payment_status") &&
    sql.includes("GRANT EXECUTE ON FUNCTION public.unallocate_payment_atomic(UUID, UUID) TO authenticated, service_role"),
    "unallocate_payment_atomic must atomically delete allocation, recalculate, and grant to authenticated"
  );
  console.log("  [PASS] 6. unallocate_payment_atomic verified");

  // 7. Preserves old app direct INSERT behavior temporarily (NO table privilege revocations or policy drops)
  assert(!sql.includes("REVOKE INSERT ON public.invoices"), "COMPAT must NOT revoke INSERT on invoices");
  assert(!sql.includes("REVOKE INSERT ON public.payments"), "COMPAT must NOT revoke INSERT on payments");
  assert(!sql.includes("DROP POLICY IF EXISTS \"Invoices Tenant INSERT Policy\""), "COMPAT must NOT drop Invoices Tenant INSERT Policy");
  assert(!sql.includes("DROP POLICY IF EXISTS \"Payments Tenant INSERT Policy\""), "COMPAT must NOT drop Payments Tenant INSERT Policy");
  console.log("  [PASS] 7. Backward compatibility preserved (old INSERT policies intact)");

  console.log("=== ALL COMPAT MIGRATION STATIC TESTS PASSED ===");
}

if (require.main === module) {
  runCompatMigrationTests();
}
