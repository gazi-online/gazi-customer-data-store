-- ==============================================================================
-- GCDS — MILESTONE 10 PHASE 2C-3C (PART 2 OF 2: ENFORCEMENT MIGRATION)
-- CANONICAL LEDGER INTEGRITY, BYPASS REVOCATION & LEAST PRIVILEGE
-- File: phase2c3c_atomic_billing_enforcement_migration.sql
--
-- TARGET: Supabase PostgreSQL
-- MODE: STRICT ENFORCEMENT (Apply ONLY AFTER legacy draft allocations are 0)
--
-- Invariants enforced:
-- 1. Preconditions: 0 draft allocations, 0 multi-request invoices, 0 customer mismatches.
-- 2. Direct client INSERT bypasses on invoices, invoice_items, payments are revoked.
-- 3. Live INSERT/UPDATE RLS policies dropped.
-- 4. customer_services.payment_status is ledger-derived or explicit waiver only.
-- 5. customer_services.customer_id is immutable after creation.
-- 6. Invoices financial snapshot (subtotal, discount, tax, total) is immutable after creation.
-- 7. Invoice items snapshot fields are immutable after creation.
-- 8. Payments amount, customer_id, and status lifecycle are strictly protected.
-- 9. An invoice may link to at most one distinct customer_service_id (Strategy A).
-- 10. Authenticated table privileges restricted to least privilege.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. PRODUCTION PRECONDITIONS
-- Fails fast if live data violates structural integrity or preconditions
-- ==============================================================================

DO $$
DECLARE
  v_draft_alloc_count INTEGER;
  v_multi_req_count INTEGER;
  v_cust_mismatch_count INTEGER;
BEGIN
  -- 1.1 Verify NO payment allocations point to draft invoices
  SELECT COUNT(*) INTO v_draft_alloc_count
  FROM public.payment_allocations pa
  JOIN public.invoices i ON pa.invoice_id = i.id
  WHERE i.status = 'draft';

  IF v_draft_alloc_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: % payment allocation(s) point to draft invoices. Run manual reconciliation before applying Phase 3C migration.', v_draft_alloc_count;
  END IF;

  -- 1.2 Verify NO invoices currently link to multiple distinct customer_services
  SELECT COUNT(*) INTO v_multi_req_count
  FROM (
    SELECT invoice_id
    FROM public.invoice_items
    WHERE customer_service_id IS NOT NULL
    GROUP BY invoice_id
    HAVING COUNT(DISTINCT customer_service_id) > 1
  ) m;

  IF v_multi_req_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: % invoice(s) already link to multiple customer services. Resolve before applying Strategy A.', v_multi_req_count;
  END IF;

  -- 1.3 Verify customer identity consistency between invoices and requests
  SELECT COUNT(*) INTO v_cust_mismatch_count
  FROM public.invoice_items ii
  JOIN public.invoices inv ON inv.id = ii.invoice_id
  JOIN public.customer_services cs ON cs.id = ii.customer_service_id
  WHERE ii.customer_service_id IS NOT NULL
    AND inv.customer_id != cs.customer_id;

  IF v_cust_mismatch_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: % invoice item(s) have customer mismatch between invoice and service request.', v_cust_mismatch_count;
  END IF;
END;
$$;

-- ==============================================================================
-- 2. RLS DIRECT MUTATION NARROWING (PREVENT POSTGREST BYPASS)
-- Atomic RPCs (SECURITY DEFINER) become the sole authoritative creation paths
-- ==============================================================================

-- Narrow INVOICES: drop direct tenant INSERT policy
DROP POLICY IF EXISTS "Invoices Tenant INSERT Policy" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON public.invoices;

-- Narrow INVOICE_ITEMS: drop direct tenant INSERT and UPDATE policies
DROP POLICY IF EXISTS "Invoice Items Tenant INSERT Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items Tenant UPDATE Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can update invoice_items" ON public.invoice_items;

-- Narrow PAYMENTS: drop direct tenant INSERT policy
DROP POLICY IF EXISTS "Payments Tenant INSERT Policy" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can insert payments" ON public.payments;

-- Revoke direct table mutation privileges from client roles
REVOKE INSERT ON public.invoices FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoice_items FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.payments FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 3. INTEGRITY TRIGGER: CUSTOMER_SERVICES CUSTOMER_ID IMMUTABILITY
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_protect_customer_service_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'customer_id is immutable after customer_service creation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_protect_customer_service_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_customer_service_identity ON public.customer_services;
CREATE TRIGGER trg_protect_customer_service_identity
  BEFORE UPDATE OF customer_id
  ON public.customer_services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_customer_service_identity();

-- ==============================================================================
-- 4. INTEGRITY TRIGGER: CUSTOMER_SERVICES PAYMENT_STATUS PROTECTION
-- Enforces initial unpaid on insert and prohibits direct updates
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_protect_customer_service_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('app.internal_request_payment_status_change', true) IS DISTINCT FROM 'true' THEN
      NEW.payment_status := 'unpaid';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      IF current_setting('app.internal_request_payment_status_change', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Direct modification of customer_services.payment_status is prohibited. Must be derived from invoice ledger or set via set_request_payment_waiver()';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_protect_customer_service_payment_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_customer_service_payment_status_insert ON public.customer_services;
CREATE TRIGGER trg_protect_customer_service_payment_status_insert
  BEFORE INSERT ON public.customer_services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_customer_service_payment_status();

DROP TRIGGER IF EXISTS trg_protect_customer_service_payment_status_update ON public.customer_services;
CREATE TRIGGER trg_protect_customer_service_payment_status_update
  BEFORE UPDATE OF payment_status ON public.customer_services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_customer_service_payment_status();

-- ==============================================================================
-- 5. INTEGRITY TRIGGER: INVOICES FINANCIAL SNAPSHOT & IDEMPOTENCY IMMUTABILITY
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_protect_invoices_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Absolute immutability of identity fields
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'customer_id is immutable after invoice creation';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable after invoice creation';
  END IF;

  IF OLD.invoice_number IS NOT NULL AND NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
    RAISE EXCEPTION 'invoice_number is immutable after invoice creation';
  END IF;

  -- Idempotency field immutability
  IF (OLD.idempotency_key IS NOT NULL AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key) OR
     (OLD.idempotency_fingerprint IS NOT NULL AND NEW.idempotency_fingerprint IS DISTINCT FROM OLD.idempotency_fingerprint) THEN
    RAISE EXCEPTION 'idempotency_key and idempotency_fingerprint are immutable after invoice creation';
  END IF;

  -- Financial snapshot immutability
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
     NEW.discount_amount IS DISTINCT FROM OLD.discount_amount OR
     NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
     NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION 'Invoice financial snapshot (subtotal, discount, tax, total) is immutable after creation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_protect_invoices_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_invoices_identity ON public.invoices;
CREATE TRIGGER trg_protect_invoices_identity
  BEFORE UPDATE OF customer_id, created_by, invoice_number, idempotency_key, idempotency_fingerprint, subtotal, discount_amount, tax_amount, total_amount
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_invoices_identity();

-- ==============================================================================
-- 6. INTEGRITY TRIGGER: INVOICE_ITEMS SNAPSHOT IMMUTABILITY
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_protect_invoice_item_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR
     NEW.customer_service_id IS DISTINCT FROM OLD.customer_service_id OR
     NEW.service_id IS DISTINCT FROM OLD.service_id OR
     NEW.description IS DISTINCT FROM OLD.description OR
     NEW.quantity IS DISTINCT FROM OLD.quantity OR
     NEW.unit_price IS DISTINCT FROM OLD.unit_price OR
     NEW.discount_amount IS DISTINCT FROM OLD.discount_amount OR
     NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
     NEW.line_total IS DISTINCT FROM OLD.line_total THEN
    RAISE EXCEPTION 'Invoice item snapshot fields are immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_protect_invoice_item_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_invoice_item_snapshot ON public.invoice_items;
CREATE TRIGGER trg_protect_invoice_item_snapshot
  BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_invoice_item_snapshot();

-- ==============================================================================
-- 7. INTEGRITY TRIGGER: PAYMENTS IMMUTABILITY
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_protect_payments_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_internal_change TEXT;
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'customer_id is immutable after payment creation';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable after payment creation';
  END IF;

  IF OLD.payment_number IS NOT NULL AND NEW.payment_number IS DISTINCT FROM OLD.payment_number THEN
    RAISE EXCEPTION 'payment_number is immutable after payment creation';
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'payment amount is immutable after payment creation';
  END IF;

  IF (OLD.idempotency_key IS NOT NULL AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key) OR
     (OLD.idempotency_fingerprint IS NOT NULL AND NEW.idempotency_fingerprint IS DISTINCT FROM OLD.idempotency_fingerprint) THEN
    RAISE EXCEPTION 'idempotency_key and idempotency_fingerprint are immutable after payment creation';
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status) OR (NEW.voided_at IS DISTINCT FROM OLD.voided_at) THEN
    v_is_internal_change := current_setting('app.internal_payment_status_change', true);
    IF v_is_internal_change IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Direct payment status or voided_at mutation blocked: must use canonical payment RPC';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_protect_payments_ledger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_payments_ledger ON public.payments;
CREATE TRIGGER trg_protect_payments_ledger
  BEFORE UPDATE OF customer_id, created_by, payment_number, amount, status, voided_at, idempotency_key, idempotency_fingerprint
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_payments_ledger();

-- ==============================================================================
-- 8. SINGLE-REQUEST INVOICE INTEGRITY TRIGGER (CONCURRENCY-SAFE)
-- Serializes line-item insertion via parent invoice row lock
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_enforce_single_request_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_req UUID;
BEGIN
  IF NEW.customer_service_id IS NOT NULL THEN
    -- Serialize concurrent line-item insertions by locking the parent invoice
    PERFORM id
    FROM public.invoices
    WHERE id = NEW.invoice_id
    FOR UPDATE;

    SELECT customer_service_id INTO v_existing_req
    FROM public.invoice_items
    WHERE invoice_id = NEW.invoice_id
      AND customer_service_id IS NOT NULL
      AND (TG_OP = 'INSERT' OR id != NEW.id)
    LIMIT 1;

    IF v_existing_req IS NOT NULL AND v_existing_req != NEW.customer_service_id THEN
      RAISE EXCEPTION 'Single-request invoice violation: Invoice % is already linked to request %, cannot link to request %',
        NEW.invoice_id, v_existing_req, NEW.customer_service_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_enforce_single_request_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_single_request_invoice ON public.invoice_items;
CREATE TRIGGER trg_enforce_single_request_invoice
  BEFORE INSERT OR UPDATE OF customer_service_id, invoice_id
  ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_enforce_single_request_invoice();

-- ==============================================================================
-- 9. LEAST PRIVILEGE EFFECTIVE SURFACE
-- Ensure authenticated users have only the exact permitted operations
-- ==============================================================================

-- Invoices: SELECT + UPDATE (for status / lifecycle cancel)
GRANT SELECT ON public.invoices TO authenticated;
GRANT UPDATE (status, notes) ON public.invoices TO authenticated;

-- Invoice Items: SELECT only
GRANT SELECT ON public.invoice_items TO authenticated;

-- Payments: SELECT only for ordinary clients
GRANT SELECT ON public.payments TO authenticated;

-- Payment Allocations: SELECT only
GRANT SELECT ON public.payment_allocations TO authenticated;

COMMIT;
;
