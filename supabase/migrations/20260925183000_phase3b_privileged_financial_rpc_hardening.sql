-- ==============================================================================
-- PHASE 3B: PRIVILEGED FINANCIAL RPC ROLE HARDENING (AMENDED)
-- File: supabase/migrations/20260925183000_phase3b_privileged_financial_rpc_hardening.sql
--
-- Security Hardening Summary:
-- 1. void_payment_atomic: Enforce owner/admin role and AAL2 assurance at DB level
-- 2. refund_payment_atomic: Enforce owner/admin role and AAL2 assurance at DB level
-- 3. set_request_payment_waiver: Enforce owner/admin role and AAL2 assurance at DB level
-- 4. unallocate_payment_atomic: Enforce owner/admin role and AAL2 assurance at DB level
--
-- Architectural Security Boundaries (Post-Review Amendment):
-- - NO session/system role bypass: Under PostgreSQL SECURITY DEFINER, caller identity
--   must come strictly from auth.uid() and trusted JWT claims, never from database session user functions.
-- - ZERO service_role bypass: No legitimate service_role caller exists for financial RPCs.
--   Revoke execute from PUBLIC, anon, and service_role; grant only to authenticated.
-- - PostgREST callers MUST provide authoritative auth.uid(), trusted AAL2 JWT claim,
--   and active ('owner', 'admin') membership in public.business_memberships.
-- - Hardened search_path: SET search_path = '' per current Supabase guidance;
--   all referenced objects and functions are fully schema-qualified.
-- ==============================================================================

-- ==============================================================================
-- 1. REVISE RPC: void_payment_atomic
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.void_payment_atomic(p_payment_id pg_catalog.uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_user_id pg_catalog.uuid;
  v_caller_role pg_catalog.text;
BEGIN
  v_user_id := auth.uid();

  -- FAIL-CLOSED AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- AUTHORITATIVE AAL2 ASSURANCE CHECK
  IF coalesce(auth.jwt()->>'aal', pg_catalog.current_setting('request.jwt.claim.aal', true)) IS DISTINCT FROM 'aal2' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Elevated security verification required (AAL2)');
  END IF;

  SELECT customer_id, status
  INTO v_customer_id, v_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- AUTHORITATIVE TENANT & ROLE CHECK (owner or admin required)
  SELECT bm.role INTO v_caller_role
  FROM public.customers c
  JOIN public.business_memberships bm ON bm.business_id = c.business_id
  WHERE c.id = v_customer_id
    AND bm.user_id = v_user_id
    AND bm.status = 'active';

  IF v_caller_role IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: Only shop owners or administrators can perform this operation');
  END IF;

  -- Lifecycle validation: strictly recorded payments only
  IF v_status = 'voided' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Payment is already voided');
  END IF;

  IF v_status != 'recorded' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Only recorded payments can be voided');
  END IF;

  -- Set transaction-local flag for trigger permission
  PERFORM pg_catalog.set_config('app.internal_payment_status_change', 'true', true);

  UPDATE public.payments
  SET status = 'voided',
      voided_at = pg_catalog.now()
  WHERE id = p_payment_id;

  -- Trigger trg_recalc_on_payment_status_change updates linked invoice financials
  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$function$;

-- ==============================================================================
-- 2. REVISE RPC: refund_payment_atomic
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.refund_payment_atomic(p_payment_id pg_catalog.uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_user_id pg_catalog.uuid;
  v_caller_role pg_catalog.text;
BEGIN
  v_user_id := auth.uid();

  -- FAIL-CLOSED AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- AUTHORITATIVE AAL2 ASSURANCE CHECK
  IF coalesce(auth.jwt()->>'aal', pg_catalog.current_setting('request.jwt.claim.aal', true)) IS DISTINCT FROM 'aal2' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Elevated security verification required (AAL2)');
  END IF;

  SELECT customer_id, status
  INTO v_customer_id, v_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- AUTHORITATIVE TENANT & ROLE CHECK (owner or admin required)
  SELECT bm.role INTO v_caller_role
  FROM public.customers c
  JOIN public.business_memberships bm ON bm.business_id = c.business_id
  WHERE c.id = v_customer_id
    AND bm.user_id = v_user_id
    AND bm.status = 'active';

  IF v_caller_role IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: Only shop owners or administrators can perform this operation');
  END IF;

  -- Lifecycle validation: strictly recorded payments only
  IF v_status = 'refunded' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Payment is already refunded');
  END IF;

  IF v_status != 'recorded' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Only recorded payments can be refunded');
  END IF;

  -- Set transaction-local flag for trigger permission
  PERFORM pg_catalog.set_config('app.internal_payment_status_change', 'true', true);

  UPDATE public.payments
  SET status = 'refunded'
  WHERE id = p_payment_id;

  -- Trigger trg_recalc_on_payment_status_change updates linked invoice financials
  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$function$;

-- ==============================================================================
-- 3. REVISE RPC: set_request_payment_waiver
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_request_payment_waiver(
  p_request_id pg_catalog.uuid,
  p_waived pg_catalog.bool
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id pg_catalog.uuid;
  v_customer_id pg_catalog.uuid;
  v_active_count pg_catalog.int4;
  v_current_status pg_catalog.text;
  v_caller_role pg_catalog.text;
BEGIN
  v_user_id := auth.uid();

  -- FAIL-CLOSED AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- AUTHORITATIVE AAL2 ASSURANCE CHECK
  IF coalesce(auth.jwt()->>'aal', pg_catalog.current_setting('request.jwt.claim.aal', true)) IS DISTINCT FROM 'aal2' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Elevated security verification required (AAL2)');
  END IF;

  SELECT customer_id, payment_status
  INTO v_customer_id, v_current_status
  FROM public.customer_services
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Service request not found');
  END IF;

  -- AUTHORITATIVE TENANT & ROLE CHECK (owner or admin required)
  SELECT bm.role INTO v_caller_role
  FROM public.customers c
  JOIN public.business_memberships bm ON bm.business_id = c.business_id
  WHERE c.id = v_customer_id
    AND bm.user_id = v_user_id
    AND bm.status = 'active';

  IF v_caller_role IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: Only shop owners or administrators can perform this operation');
  END IF;

  IF p_waived THEN
    -- Waiving allowed only when active invoice count = 0
    SELECT pg_catalog.count(DISTINCT i.id) INTO v_active_count
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE ii.customer_service_id = p_request_id
      AND i.status IN ('issued', 'partially_paid', 'paid');

    IF v_active_count > 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error', 'Cannot waive service request with active invoices. Cancel or void invoices first'
      );
    END IF;

    PERFORM pg_catalog.set_config('app.internal_request_payment_status_change', 'true', true);
    UPDATE public.customer_services
    SET payment_status = 'waived',
        updated_at = pg_catalog.now()
    WHERE id = p_request_id;
    PERFORM pg_catalog.set_config('app.internal_request_payment_status_change', 'false', true);

    RETURN pg_catalog.jsonb_build_object('success', true, 'payment_status', 'waived');
  ELSE
    -- Unwaive clears waiver and recalculates canonical state from ledger
    PERFORM pg_catalog.set_config('app.internal_request_payment_status_change', 'true', true);
    UPDATE public.customer_services
    SET payment_status = 'unpaid',
        updated_at = pg_catalog.now()
    WHERE id = p_request_id;
    PERFORM pg_catalog.set_config('app.internal_request_payment_status_change', 'false', true);

    PERFORM public.recalculate_customer_service_payment_status(p_request_id);

    SELECT payment_status INTO v_current_status
    FROM public.customer_services
    WHERE id = p_request_id;

    RETURN pg_catalog.jsonb_build_object('success', true, 'payment_status', v_current_status);
  END IF;
END;
$$;

-- ==============================================================================
-- 4. REVISE RPC: unallocate_payment_atomic
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.unallocate_payment_atomic(
  p_payment_id pg_catalog.uuid,
  p_invoice_id pg_catalog.uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id pg_catalog.uuid;
  v_payment_customer_id pg_catalog.uuid;
  v_invoice_customer_id pg_catalog.uuid;
  v_existing_alloc_id pg_catalog.uuid;
  v_alloc_amount pg_catalog.numeric;
  v_req RECORD;
  v_caller_role pg_catalog.text;
BEGIN
  v_user_id := auth.uid();

  -- FAIL-CLOSED AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- AUTHORITATIVE AAL2 ASSURANCE CHECK
  IF coalesce(auth.jwt()->>'aal', pg_catalog.current_setting('request.jwt.claim.aal', true)) IS DISTINCT FROM 'aal2' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Elevated security verification required (AAL2)');
  END IF;

  IF p_payment_id IS NULL OR p_invoice_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Both payment_id and invoice_id are required');
  END IF;

  -- Lock payment row
  SELECT customer_id INTO v_payment_customer_id
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Lock invoice row
  SELECT customer_id INTO v_invoice_customer_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  -- Same customer check
  IF v_payment_customer_id != v_invoice_customer_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Cross-customer payment allocation unallocation blocked by database rules');
  END IF;

  -- AUTHORITATIVE TENANT & ROLE CHECK (owner or admin required)
  SELECT bm.role INTO v_caller_role
  FROM public.customers c
  JOIN public.business_memberships bm ON bm.business_id = c.business_id
  WHERE c.id = v_payment_customer_id
    AND bm.user_id = v_user_id
    AND bm.status = 'active';

  IF v_caller_role IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Access denied: Only shop owners or administrators can perform this operation');
  END IF;

  -- Lock allocation row
  SELECT id, amount INTO v_existing_alloc_id, v_alloc_amount
  FROM public.payment_allocations
  WHERE payment_id = p_payment_id AND invoice_id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Payment allocation does not exist');
  END IF;

  -- Delete allocation atomically
  DELETE FROM public.payment_allocations
  WHERE payment_id = p_payment_id AND invoice_id = p_invoice_id;

  -- Explicit recalculation for immediate consistency
  PERFORM public.recalculate_invoice_financials(p_invoice_id);
  FOR v_req IN
    SELECT DISTINCT customer_service_id
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id AND customer_service_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_customer_service_payment_status(v_req.customer_service_id);
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'unallocated_amount', v_alloc_amount
  );
END;
$$;

-- ==============================================================================
-- 5. ACCESS CONTROL & LEAST PRIVILEGE EXECUTION GRANTS
-- ==============================================================================
REVOKE ALL ON FUNCTION public.void_payment_atomic(pg_catalog.uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.void_payment_atomic(pg_catalog.uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.refund_payment_atomic(pg_catalog.uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_payment_atomic(pg_catalog.uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_request_payment_waiver(pg_catalog.uuid, pg_catalog.bool) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_request_payment_waiver(pg_catalog.uuid, pg_catalog.bool) TO authenticated;

REVOKE ALL ON FUNCTION public.unallocate_payment_atomic(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.unallocate_payment_atomic(pg_catalog.uuid, pg_catalog.uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
