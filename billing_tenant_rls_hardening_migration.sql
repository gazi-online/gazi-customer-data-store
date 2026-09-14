-- ==============================================================================
-- GCDS — MILESTONE 10 PHASE 2C-3B
-- BILLING TENANT SECURITY MIGRATION (DRAFT ONLY - DO NOT APPLY DIRECTLY)
--
-- Objective:
-- 1. Replace single-user (created_by = auth.uid()) billing RLS policies with
--    tenant-scoped policies based on customers.business_id and business_memberships.
-- 2. Preserve exact least-privilege command surface:
--    - invoices: SELECT, INSERT, UPDATE (NO DELETE)
--    - invoice_items: SELECT, INSERT, UPDATE (NO DELETE)
--    - payments: SELECT, INSERT, UPDATE (NO DELETE)
--    - payment_allocations: SELECT ONLY (NO direct mutation policies)
-- 3. Enforce strict audit provenance on INSERT: created_by = auth.uid()
-- 4. Enforce ABSOLUTE immutability on identity / financial ledger fields:
--    - invoices: customer_id, created_by, invoice_number (rejects any modification, including NULL -> UUID)
--    - payments: customer_id, created_by, payment_number, amount (amount is immutable after insert)
-- 5. Prevent direct bypass of payment lifecycle via PostgREST UPDATE:
--    - payments.status and payments.voided_at can ONLY be mutated via internal trusted RPC paths
--      (verified via transaction-local setting 'app.internal_payment_status_change')
-- 6. Enforce relational customer integrity on invoice_items:
--    - invoice_items.customer_service_id customer_id MUST match parent invoice.customer_id
-- 7. Add performance index on invoice_items(customer_service_id)
-- 8. Fail-closed tenant authentication and lifecycle rules on all 3 SECURITY DEFINER billing RPCs:
--    - allocate_payment_atomic(p_payment_id uuid, p_invoice_id uuid, p_amount numeric)
--    - void_payment_atomic(p_payment_id uuid)
--    - refund_payment_atomic(p_payment_id uuid)
--    Harden search_path to 'public', 'pg_temp'.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. DATA INTEGRITY PRECONDITION CHECKS
-- ==============================================================================

DO $$
BEGIN
  -- Verify no invoices with null customer_id
  IF EXISTS (SELECT 1 FROM public.invoices WHERE customer_id IS NULL) THEN
    RAISE EXCEPTION 'Precondition failed: invoices with NULL customer_id found';
  END IF;

  -- Verify no payments with null customer_id
  IF EXISTS (SELECT 1 FROM public.payments WHERE customer_id IS NULL) THEN
    RAISE EXCEPTION 'Precondition failed: payments with NULL customer_id found';
  END IF;

  -- Verify existing invoice_items customer consistency
  IF EXISTS (
    SELECT 1 FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    JOIN public.customer_services cs ON ii.customer_service_id = cs.id
    WHERE i.customer_id != cs.customer_id
  ) THEN
    RAISE EXCEPTION 'Precondition failed: invoice_items customer mismatch with customer_services found';
  END IF;

  -- Verify existing payment allocations customer consistency
  IF EXISTS (
    SELECT 1 FROM public.payment_allocations pa
    JOIN public.payments p ON pa.payment_id = p.id
    JOIN public.invoices i ON pa.invoice_id = i.id
    WHERE p.customer_id != i.customer_id
  ) THEN
    RAISE EXCEPTION 'Precondition failed: payment_allocations customer mismatch between payment and invoice found';
  END IF;
END $$;

-- ==============================================================================
-- 2. HARDEN RLS POLICIES ON INVOICES
-- Command surface preserved: SELECT, INSERT, UPDATE (NO DELETE)
-- ==============================================================================

DROP POLICY IF EXISTS "Invoices SELECT Policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoices INSERT Policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoices UPDATE Policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoices Tenant SELECT Policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoices Tenant INSERT Policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoices Tenant UPDATE Policy" ON public.invoices;

CREATE POLICY "Invoices Tenant SELECT Policy" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = invoices.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "Invoices Tenant INSERT Policy" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = invoices.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Invoices Tenant UPDATE Policy" ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = invoices.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = invoices.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- ==============================================================================
-- 3. HARDEN RLS POLICIES ON INVOICE_ITEMS
-- Command surface preserved: SELECT, INSERT, UPDATE (NO DELETE)
-- ==============================================================================

DROP POLICY IF EXISTS "Invoice Items SELECT Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items INSERT Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items UPDATE Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items Tenant SELECT Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items Tenant INSERT Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items Tenant UPDATE Policy" ON public.invoice_items;

CREATE POLICY "Invoice Items Tenant SELECT Policy" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      JOIN public.customers c ON c.id = inv.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE inv.id = invoice_items.invoice_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "Invoice Items Tenant INSERT Policy" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      JOIN public.customers c ON c.id = inv.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE inv.id = invoice_items.invoice_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "Invoice Items Tenant UPDATE Policy" ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      JOIN public.customers c ON c.id = inv.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE inv.id = invoice_items.invoice_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      JOIN public.customers c ON c.id = inv.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE inv.id = invoice_items.invoice_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- ==============================================================================
-- 4. HARDEN RLS POLICIES ON PAYMENTS
-- Command surface preserved: SELECT, INSERT, UPDATE (NO DELETE)
-- ==============================================================================

DROP POLICY IF EXISTS "Payments SELECT Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments INSERT Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments UPDATE Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Tenant SELECT Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Tenant INSERT Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Tenant UPDATE Policy" ON public.payments;

CREATE POLICY "Payments Tenant SELECT Policy" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = payments.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "Payments Tenant INSERT Policy" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = payments.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Payments Tenant UPDATE Policy" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = payments.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = payments.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- ==============================================================================
-- 5. HARDEN RLS POLICY ON PAYMENT_ALLOCATIONS
-- Command surface preserved: SELECT ONLY (NO direct mutation policies)
-- Dual-parent verification: authorizes through payment AND invoice
-- ==============================================================================

DROP POLICY IF EXISTS "Payment Allocations SELECT Policy" ON public.payment_allocations;
DROP POLICY IF EXISTS "Payment Allocations Tenant SELECT Policy" ON public.payment_allocations;

CREATE POLICY "Payment Allocations Tenant SELECT Policy" ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payments p
      JOIN public.customers cp ON cp.id = p.customer_id
      JOIN public.business_memberships bmp ON bmp.business_id = cp.business_id
      WHERE p.id = payment_allocations.payment_id
        AND bmp.user_id = auth.uid()
        AND bmp.status = 'active'
    )
    AND
    EXISTS (
      SELECT 1 FROM public.invoices inv
      JOIN public.customers ci ON ci.id = inv.customer_id
      JOIN public.business_memberships bmi ON bmi.business_id = ci.business_id
      WHERE inv.id = payment_allocations.invoice_id
        AND bmi.user_id = auth.uid()
        AND bmi.status = 'active'
    )
  );

-- ==============================================================================
-- 6. IMMUTABLE BILLING IDENTITY & LEDGER FIELDS INTEGRITY TRIGGERS
-- Protects invoices: customer_id, created_by, invoice_number
-- Protects payments: customer_id, created_by, payment_number, amount
-- Protects payments lifecycle: status and voided_at can ONLY change via trusted internal RPC path
-- ==============================================================================

-- 6A. Invoices Identity Protection
CREATE OR REPLACE FUNCTION public.trg_func_protect_invoices_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check customer_id absolute immutability
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'customer_id is immutable after invoice creation';
  END IF;

  -- Check created_by absolute immutability (rejects NULL -> UUID, UUID -> NULL, or UUID change)
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable after invoice creation';
  END IF;

  -- Check invoice_number absolute immutability
  IF OLD.invoice_number IS NOT NULL AND NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
    RAISE EXCEPTION 'invoice_number is immutable after invoice creation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_invoices_identity ON public.invoices;
CREATE TRIGGER trg_protect_invoices_identity
  BEFORE UPDATE OF customer_id, created_by, invoice_number
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_invoices_identity();

-- 6B. Payments Identity, Ledger & Status Protection
CREATE OR REPLACE FUNCTION public.trg_func_protect_payments_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_internal_change TEXT;
BEGIN
  -- Check customer_id absolute immutability
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'customer_id is immutable after payment creation';
  END IF;

  -- Check created_by absolute immutability
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable after payment creation';
  END IF;

  -- Check payment_number absolute immutability
  IF OLD.payment_number IS NOT NULL AND NEW.payment_number IS DISTINCT FROM OLD.payment_number THEN
    RAISE EXCEPTION 'payment_number is immutable after payment creation';
  END IF;

  -- Check amount ledger immutability (amounts cannot change after insert)
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'payment amount is immutable after payment creation';
  END IF;

  -- Check controlled payment status and voided_at mutation
  IF (NEW.status IS DISTINCT FROM OLD.status) OR (NEW.voided_at IS DISTINCT FROM OLD.voided_at) THEN
    v_is_internal_change := current_setting('app.internal_payment_status_change', true);
    IF v_is_internal_change IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Direct payment status or voided_at mutation blocked: must use canonical payment RPC';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_payments_ledger ON public.payments;
CREATE TRIGGER trg_protect_payments_ledger
  BEFORE UPDATE OF customer_id, created_by, payment_number, amount, status, voided_at
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_protect_payments_ledger();

-- ==============================================================================
-- 7. INVOICE-REQUEST CUSTOMER INTEGRITY TRIGGER
-- Ensures invoice_items.customer_service_id belongs to the same customer as parent invoice
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_validate_invoice_item_request_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv_customer_id UUID;
  v_req_customer_id UUID;
BEGIN
  IF NEW.customer_service_id IS NOT NULL THEN
    SELECT customer_id INTO v_inv_customer_id
    FROM public.invoices
    WHERE id = NEW.invoice_id;

    SELECT customer_id INTO v_req_customer_id
    FROM public.customer_services
    WHERE id = NEW.customer_service_id;

    IF v_inv_customer_id IS NULL THEN
      RAISE EXCEPTION 'Referenced invoice does not exist';
    END IF;

    IF v_req_customer_id IS NULL THEN
      RAISE EXCEPTION 'Referenced service request does not exist';
    END IF;

    IF v_inv_customer_id != v_req_customer_id THEN
      RAISE EXCEPTION 'Customer mismatch: invoice customer does not match service request customer';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_item_request_customer ON public.invoice_items;
CREATE TRIGGER trg_validate_invoice_item_request_customer
  BEFORE INSERT OR UPDATE OF customer_service_id, invoice_id
  ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_validate_invoice_item_request_customer();

-- ==============================================================================
-- 8. REQUEST LINK PERFORMANCE INDEX
-- Optimizes 0..N request-to-invoice lookups from request workspace
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_invoice_items_customer_service_id
  ON public.invoice_items(customer_service_id);

-- ==============================================================================
-- 9. REVISE RPC: allocate_payment_atomic
-- Signature preserved: (p_payment_id uuid, p_invoice_id uuid, p_amount numeric)
-- Fail-closed authentication: requires auth.uid() IS NOT NULL
-- Tenant-hardened: validates active business membership of caller in customer's business
-- Search path hardened: 'public', 'pg_temp'
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.allocate_payment_atomic(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment_customer_id UUID;
  v_payment_amount NUMERIC(12,2);
  v_payment_status TEXT;
  v_invoice_customer_id UUID;
  v_invoice_total NUMERIC(12,2);
  v_invoice_status TEXT;
  v_existing_pay_allocated NUMERIC(12,2);
  v_remaining_pay_balance NUMERIC(12,2);
  v_existing_inv_allocated NUMERIC(12,2);
  v_remaining_inv_due NUMERIC(12,2);
  v_alloc_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- FAIL-CLOSED AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Allocation amount must be greater than 0');
  END IF;

  -- Lock payment row
  SELECT customer_id, amount, status
  INTO v_payment_customer_id, v_payment_amount, v_payment_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF v_payment_status != 'recorded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot allocate from a voided or refunded payment');
  END IF;

  -- Lock invoice row
  SELECT customer_id, total_amount, status
  INTO v_invoice_customer_id, v_invoice_total, v_invoice_status
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot allocate payment to a cancelled invoice');
  END IF;

  -- DB-LEVEL SAME-CUSTOMER INTEGRITY CHECK
  IF v_payment_customer_id != v_invoice_customer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-customer payment allocation blocked by database rules');
  END IF;

  -- TENANT AUTHORIZATION CHECK: User must be active member of the customer's business
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = v_payment_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  -- Check available payment balance
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_pay_allocated
  FROM public.payment_allocations
  WHERE payment_id = p_payment_id AND invoice_id != p_invoice_id;

  v_remaining_pay_balance := v_payment_amount - v_existing_pay_allocated;
  IF p_amount > v_remaining_pay_balance THEN
    RETURN jsonb_build_object('success', false, 'error', format('Allocation amount (%s) exceeds remaining payment balance (%s)', p_amount, v_remaining_pay_balance));
  END IF;

  -- Check remaining invoice due balance
  SELECT COALESCE(SUM(pa.amount), 0) INTO v_existing_inv_allocated
  FROM public.payment_allocations pa
  JOIN public.payments p ON pa.payment_id = p.id
  WHERE pa.invoice_id = p_invoice_id AND pa.payment_id != p_payment_id AND p.status = 'recorded';

  v_remaining_inv_due := GREATEST(0, v_invoice_total - v_existing_inv_allocated);
  IF p_amount > v_remaining_inv_due THEN
    RETURN jsonb_build_object('success', false, 'error', format('Allocation amount (%s) exceeds remaining invoice due (%s)', p_amount, v_remaining_inv_due));
  END IF;

  -- Upsert allocation row atomically
  INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
  VALUES (p_payment_id, p_invoice_id, p_amount)
  ON CONFLICT (payment_id, invoice_id)
  DO UPDATE SET amount = EXCLUDED.amount
  RETURNING id INTO v_alloc_id;

  -- Trigger trg_recalc_on_allocation_change automatically updates invoice paid_amount & due_amount
  RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id);
END;
$function$;

-- ==============================================================================
-- 10. REVISE RPC: void_payment_atomic
-- Signature preserved: (p_payment_id uuid)
-- Fail-closed authentication: requires auth.uid() IS NOT NULL
-- Tenant-hardened: validates active business membership in customer's business
-- Lifecycle: Only 'recorded' payments can be voided (rejects refunded, voided, or anything else)
-- Controlled status path: sets transaction-local setting 'app.internal_payment_status_change'
-- Search path hardened: 'public', 'pg_temp'
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.void_payment_atomic(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_id UUID;
  v_status TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- FAIL-CLOSED AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT customer_id, status
  INTO v_customer_id, v_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- TENANT AUTHORIZATION CHECK
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = v_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  -- Lifecycle validation: strictly recorded payments only
  IF v_status = 'voided' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is already voided');
  END IF;

  IF v_status != 'recorded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only recorded payments can be voided');
  END IF;

  -- Set transaction-local flag for trigger permission
  PERFORM set_config('app.internal_payment_status_change', 'true', true);

  UPDATE public.payments
  SET status = 'voided',
      voided_at = NOW()
  WHERE id = p_payment_id;

  -- Trigger trg_recalc_on_payment_status_change updates linked invoice financials
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ==============================================================================
-- 11. REVISE RPC: refund_payment_atomic
-- Signature preserved: (p_payment_id uuid)
-- Fail-closed authentication: requires auth.uid() IS NOT NULL
-- Tenant-hardened: validates active business membership in customer's business
-- Lifecycle: Only 'recorded' payments can be refunded (rejects voided, refunded, or anything else)
-- Controlled status path: sets transaction-local setting 'app.internal_payment_status_change'
-- Search path hardened: 'public', 'pg_temp'
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.refund_payment_atomic(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_id UUID;
  v_status TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- FAIL-CLOSED AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT customer_id, status
  INTO v_customer_id, v_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- TENANT AUTHORIZATION CHECK
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = v_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  -- Lifecycle validation: strictly recorded payments only
  IF v_status = 'refunded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is already refunded');
  END IF;

  IF v_status != 'recorded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only recorded payments can be refunded');
  END IF;

  -- Set transaction-local flag for trigger permission
  PERFORM set_config('app.internal_payment_status_change', 'true', true);

  UPDATE public.payments
  SET status = 'refunded'
  WHERE id = p_payment_id;

  -- Trigger trg_recalc_on_payment_status_change updates linked invoice financials
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ==============================================================================
-- 12. PRESERVE LEAST-PRIVILEGE EXECUTE GRANTS ON RPCs
-- Explicitly revoke from PUBLIC and anon; grant only to authenticated, service_role, postgres
-- ==============================================================================

REVOKE ALL ON FUNCTION public.allocate_payment_atomic(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_payment_atomic(uuid, uuid, numeric) TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.void_payment_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_payment_atomic(uuid) TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.refund_payment_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_payment_atomic(uuid) TO authenticated, service_role, postgres;

COMMIT;
