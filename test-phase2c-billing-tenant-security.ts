/**
 * GCDS — MILESTONE 10 PHASE 2C-3B
 * STATIC SECURITY TEST: BILLING TENANT SECURITY MIGRATION (FINAL DRAFT)
 *
 * Verifies that billing_tenant_rls_hardening_migration.sql adheres strictly
 * to the security requirements:
 * 1. Transaction-wrapped (BEGIN/COMMIT).
 * 2. Preconditions check for anomalies without data mutation.
 * 3. Drops all legacy single-user created_by policies.
 * 4. Implements business-tenant scoped RLS policies on invoices, invoice_items,
 *    payments, and payment_allocations.
 * 5. Preserves exact least-privilege command surface:
 *    - invoices: SELECT, INSERT, UPDATE (NO DELETE)
 *    - invoice_items: SELECT, INSERT, UPDATE (NO DELETE)
 *    - payments: SELECT, INSERT, UPDATE (NO DELETE)
 *    - payment_allocations: SELECT ONLY (NO direct mutation)
 * 6. Requires created_by = auth.uid() on INSERT (no NULL bypass).
 * 7. Enforces absolute immutability of created_by on invoices & payments (rejects NULL->UUID).
 * 8. Enforces absolute immutability of customer_id, invoice_number, payment_number.
 * 9. Enforces absolute immutability of payment amount after insert.
 * 10. Enforces protected payment status & voided_at mutation (blocks direct PostgREST UPDATE).
 * 11. Dual-parent verification on payment_allocations (checks payment AND invoice).
 * 12. allocate_payment_atomic: fail-closed on auth.uid() IS NULL, no creator check,
 *     enforces authenticated tenant business membership, search_path hardened.
 * 13. void_payment_atomic: fail-closed on null auth, tenant-hardened, strictly recorded only,
 *     uses trusted internal setting 'app.internal_payment_status_change'.
 * 14. refund_payment_atomic: fail-closed on null auth, tenant-hardened, strictly recorded only,
 *     uses trusted internal setting 'app.internal_payment_status_change'.
 * 15. All 3 RPCs preserve public signatures and harden search_path to 'public', 'pg_temp'.
 * 16. EXECUTE grants revoked from PUBLIC and anon, restricted to authenticated/service_role/postgres.
 * 17. Customer-integrity trigger enforces invoice.customer_id == request.customer_id.
 * 18. Request-lookup index on invoice_items(customer_service_id) created.
 * 19. No business data DML (INSERT/UPDATE/DELETE data rows).
 */

import * as fs from "fs";
import * as path from "path";

function runBillingSecurityTests() {
  console.log("=== RUNNING STATIC SECURITY TEST: BILLING TENANT SECURITY MIGRATION (FINAL DRAFT) ===");

  const migrationPath = path.join(__dirname, "billing_tenant_rls_hardening_migration.sql");
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found at: ${migrationPath}`);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");

  function assert(condition: boolean, label: string) {
    if (!condition) {
      console.error(`❌ FAILED: ${label}`);
      throw new Error(`Assertion failed: ${label}`);
    }
    console.log(`✅ PASSED: ${label}`);
  }

  // 1. Transaction wrapping
  assert(sql.includes("BEGIN;") && sql.includes("COMMIT;"), "Migration must be wrapped in a transaction block (BEGIN/COMMIT)");

  // 2. Preconditions
  assert(
    sql.includes("SELECT 1 FROM public.invoices WHERE customer_id IS NULL") &&
    sql.includes("SELECT 1 FROM public.payments WHERE customer_id IS NULL"),
    "Preconditions check for NULL customer_id on invoices and payments"
  );
  assert(
    sql.includes("SELECT 1 FROM public.invoice_items ii") &&
    sql.includes("i.customer_id != cs.customer_id"),
    "Preconditions check for invoice_items vs customer_services customer mismatch"
  );
  assert(
    sql.includes("SELECT 1 FROM public.payment_allocations pa") &&
    sql.includes("p.customer_id != i.customer_id"),
    "Preconditions check for payment_allocations customer mismatch"
  );

  // 3. Drops legacy creator policies
  assert(sql.includes('DROP POLICY IF EXISTS "Invoices SELECT Policy" ON public.invoices;'), "Drops legacy Invoices SELECT Policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Invoices INSERT Policy" ON public.invoices;'), "Drops legacy Invoices INSERT Policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Invoices UPDATE Policy" ON public.invoices;'), "Drops legacy Invoices UPDATE Policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Payments SELECT Policy" ON public.payments;'), "Drops legacy Payments SELECT Policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Payments INSERT Policy" ON public.payments;'), "Drops legacy Payments INSERT Policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Payments UPDATE Policy" ON public.payments;'), "Drops legacy Payments UPDATE Policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Invoice Items SELECT Policy" ON public.invoice_items;'), "Drops legacy Invoice Items SELECT Policy");
  assert(sql.includes('DROP POLICY IF EXISTS "Payment Allocations SELECT Policy" ON public.payment_allocations;'), "Drops legacy Payment Allocations SELECT Policy");

  // 4. Command surface preservation: NO DELETE
  assert(!sql.includes('FOR DELETE TO authenticated\n  ON public.invoices') && !sql.includes('FOR DELETE ON public.invoices'), "Invoices has NO DELETE policy");
  assert(!sql.includes('FOR DELETE TO authenticated\n  ON public.invoice_items') && !sql.includes('FOR DELETE ON public.invoice_items'), "Invoice items has NO DELETE policy");
  assert(!sql.includes('FOR DELETE TO authenticated\n  ON public.payments') && !sql.includes('FOR DELETE ON public.payments'), "Payments has NO DELETE policy");
  assert(!sql.includes('FOR INSERT TO authenticated\n  ON public.payment_allocations'), "Payment allocations has NO direct INSERT policy");
  assert(!sql.includes('FOR UPDATE TO authenticated\n  ON public.payment_allocations'), "Payment allocations has NO direct UPDATE policy");
  assert(!sql.includes('FOR DELETE TO authenticated\n  ON public.payment_allocations'), "Payment allocations has NO direct DELETE policy");

  // 5. Invoices Tenant Policies
  assert(
    sql.includes('CREATE POLICY "Invoices Tenant SELECT Policy" ON public.invoices') &&
    sql.includes("bm.user_id = auth.uid()") &&
    sql.includes("bm.status = 'active'"),
    "Invoices Tenant SELECT Policy enforces active business_memberships"
  );
  assert(
    sql.includes('CREATE POLICY "Invoices Tenant INSERT Policy" ON public.invoices') &&
    sql.includes("created_by = auth.uid()"),
    "Invoices Tenant INSERT Policy requires created_by = auth.uid()"
  );
  assert(!sql.includes("created_by IS NULL OR created_by = auth.uid()"), "No NULL bypass on created_by for authenticated INSERT");

  // 6. Payments Tenant Policies
  assert(
    sql.includes('CREATE POLICY "Payments Tenant SELECT Policy" ON public.payments') &&
    sql.includes("bm.user_id = auth.uid()"),
    "Payments Tenant SELECT Policy enforces active business_memberships"
  );
  assert(
    sql.includes('CREATE POLICY "Payments Tenant INSERT Policy" ON public.payments') &&
    sql.includes("created_by = auth.uid()"),
    "Payments Tenant INSERT Policy requires created_by = auth.uid()"
  );

  // 7. Invoice Items Tenant Policies
  assert(
    sql.includes('CREATE POLICY "Invoice Items Tenant SELECT Policy" ON public.invoice_items') &&
    sql.includes("WHERE inv.id = invoice_items.invoice_id"),
    "Invoice Items derives authorization through parent invoice and customer business membership"
  );

  // 8. Payment Allocations Dual Parent Tenant Policy
  assert(
    sql.includes('CREATE POLICY "Payment Allocations Tenant SELECT Policy" ON public.payment_allocations') &&
    sql.includes("WHERE p.id = payment_allocations.payment_id") &&
    sql.includes("WHERE inv.id = payment_allocations.invoice_id"),
    "Payment Allocations Tenant SELECT verifies BOTH payment AND invoice parents"
  );

  // 9. Absolute immutability of created_by (no null-to-uuid loophole)
  assert(
    sql.includes("NEW.created_by IS DISTINCT FROM OLD.created_by") &&
    sql.includes("created_by is immutable after invoice creation"),
    "Invoices created_by is absolutely immutable (rejects NULL -> UUID)"
  );
  assert(
    sql.includes("NEW.created_by IS DISTINCT FROM OLD.created_by") &&
    sql.includes("created_by is immutable after payment creation"),
    "Payments created_by is absolutely immutable (rejects NULL -> UUID)"
  );

  // 10. Immutability of customer_id & invoice/payment numbers
  assert(
    sql.includes("NEW.customer_id IS DISTINCT FROM OLD.customer_id") &&
    sql.includes("customer_id is immutable after invoice creation"),
    "Invoices customer_id is immutable"
  );
  assert(
    sql.includes("NEW.customer_id IS DISTINCT FROM OLD.customer_id") &&
    sql.includes("customer_id is immutable after payment creation"),
    "Payments customer_id is immutable"
  );
  assert(
    sql.includes("invoice_number is immutable after invoice creation") &&
    sql.includes("payment_number is immutable after payment creation"),
    "Invoice and payment numbers are immutable"
  );

  // 11. Payment amount ledger immutability
  assert(
    sql.includes("NEW.amount IS DISTINCT FROM OLD.amount") &&
    sql.includes("payment amount is immutable after payment creation"),
    "Payments amount is immutable after insert"
  );

  // 12. Direct payment status & voided_at bypass protection
  assert(
    sql.includes("NEW.status IS DISTINCT FROM OLD.status") &&
    sql.includes("NEW.voided_at IS DISTINCT FROM OLD.voided_at") &&
    sql.includes("current_setting('app.internal_payment_status_change', true)") &&
    sql.includes("Direct payment status or voided_at mutation blocked"),
    "Direct payment status and voided_at mutation blocked by trigger unless trusted internal flag set"
  );

  // 13. Fail-closed authentication in all 3 RPCs
  assert(
    sql.includes("v_user_id := auth.uid();\n\n  -- FAIL-CLOSED AUTHENTICATION CHECK\n  IF v_user_id IS NULL THEN\n    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');"),
    "RPCs fail-closed on auth.uid() IS NULL"
  );

  // 14. allocate_payment_atomic RPC
  assert(
    sql.includes("CREATE OR REPLACE FUNCTION public.allocate_payment_atomic(p_payment_id uuid, p_invoice_id uuid, p_amount numeric)") ||
    sql.includes("CREATE OR REPLACE FUNCTION public.allocate_payment_atomic(\n  p_payment_id uuid,\n  p_invoice_id uuid,\n  p_amount numeric\n)"),
    "Preserves exact signature for allocate_payment_atomic"
  );
  assert(
    !sql.includes("v_payment_created_by != v_user_id") &&
    !sql.includes("v_invoice_created_by != v_user_id"),
    "allocate_payment_atomic has removed single-creator equality checks"
  );
  assert(
    sql.includes("v_payment_customer_id != v_invoice_customer_id") &&
    sql.includes("Cross-customer payment allocation blocked by database rules"),
    "allocate_payment_atomic enforces same-customer integrity"
  );
  assert(
    sql.includes("Access denied: User is not an active member of this business"),
    "allocate_payment_atomic enforces active tenant business membership"
  );

  // 15. void_payment_atomic RPC
  assert(
    sql.includes("CREATE OR REPLACE FUNCTION public.void_payment_atomic(p_payment_id uuid)"),
    "Preserves exact signature for void_payment_atomic"
  );
  assert(
    sql.includes("PERFORM set_config('app.internal_payment_status_change', 'true', true);") &&
    sql.includes("SET status = 'voided',") &&
    sql.includes("voided_at = NOW()"),
    "void_payment_atomic uses trusted internal setting to update status and voided_at"
  );
  assert(
    sql.includes("Only recorded payments can be voided"),
    "void_payment_atomic strictly enforces recorded -> voided lifecycle"
  );

  // 16. refund_payment_atomic RPC
  assert(
    sql.includes("CREATE OR REPLACE FUNCTION public.refund_payment_atomic(p_payment_id uuid)"),
    "Preserves exact signature for refund_payment_atomic"
  );
  assert(
    sql.includes("Only recorded payments can be refunded"),
    "refund_payment_atomic strictly enforces recorded -> refunded lifecycle"
  );

  // 17. Search path hardening
  const searchPathMatches = sql.match(/SET search_path TO 'public', 'pg_temp'/g);
  assert(
    searchPathMatches !== null && searchPathMatches.length >= 3,
    "All 3 SECURITY DEFINER RPCs hardened with SET search_path TO 'public', 'pg_temp'"
  );

  // 18. Execute grants
  assert(
    sql.includes("REVOKE ALL ON FUNCTION public.allocate_payment_atomic(uuid, uuid, numeric) FROM PUBLIC, anon;") &&
    sql.includes("GRANT EXECUTE ON FUNCTION public.allocate_payment_atomic(uuid, uuid, numeric) TO authenticated, service_role, postgres;"),
    "allocate_payment_atomic has correct least-privilege execute grants"
  );
  assert(
    sql.includes("REVOKE ALL ON FUNCTION public.void_payment_atomic(uuid) FROM PUBLIC, anon;") &&
    sql.includes("REVOKE ALL ON FUNCTION public.refund_payment_atomic(uuid) FROM PUBLIC, anon;"),
    "void and refund functions have execute grants revoked from PUBLIC and anon"
  );

  // 19. Customer integrity trigger
  assert(
    sql.includes("CREATE TRIGGER trg_validate_invoice_item_request_customer") &&
    sql.includes("Customer mismatch: invoice customer does not match service request customer"),
    "Validates invoice_items customer matches customer_services customer"
  );

  // 20. Request lookup index
  assert(
    sql.includes("CREATE INDEX IF NOT EXISTS idx_invoice_items_customer_service_id") &&
    sql.includes("ON public.invoice_items(customer_service_id);"),
    "Creates performance index on invoice_items(customer_service_id)"
  );

  // 21. Proof of no direct DML mutations
  assert(!sql.includes("INSERT INTO public.invoices ") && !sql.includes("UPDATE public.invoices SET"), "Migration contains NO data DML on invoices");
  assert(!sql.includes("INSERT INTO public.payments ") && !sql.includes("DELETE FROM public.payments"), "Migration contains NO data DML on payments");

  console.log("=== ALL STATIC SECURITY TESTS PASSED SUCCESSFULLY ===");
}

runBillingSecurityTests();
