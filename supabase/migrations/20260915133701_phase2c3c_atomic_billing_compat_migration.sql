-- ==============================================================================
-- GCDS — MILESTONE 10 PHASE 2C-3C (PART 1 OF 2: COMPAT MIGRATION)
-- ATOMIC BILLING, IDEMPOTENCY & RPC FOUNDATION (BACKWARD-COMPATIBLE)
-- File: phase2c3c_atomic_billing_compat_migration.sql
-- ==============================================================================

-- 1. SCHEMA EXTENSIONS: IDEMPOTENCY & LINE POSITION

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_customer_idempotency
  ON public.invoices(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_customer_idempotency
  ON public.payments(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS line_position INTEGER;

CREATE INDEX IF NOT EXISTS idx_invoice_items_line_position
  ON public.invoice_items(invoice_id, line_position);

-- 2. CANONICAL RECALCULATION FUNCTION: CUSTOMER_SERVICES PAYMENT_STATUS

CREATE OR REPLACE FUNCTION public.recalculate_customer_service_payment_status(p_customer_service_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status TEXT;
  v_active_count INTEGER;
  v_total_paid NUMERIC(12,2);
  v_balance_due NUMERIC(12,2);
  v_new_status TEXT;
BEGIN
  IF p_customer_service_id IS NULL THEN
    RETURN;
  END IF;

  SELECT payment_status INTO v_current_status
  FROM public.customer_services
  WHERE id = p_customer_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT 
    COUNT(DISTINCT i.id),
    COALESCE(SUM(i.paid_amount), 0),
    COALESCE(SUM(i.due_amount), 0)
  INTO v_active_count, v_total_paid, v_balance_due
  FROM public.invoice_items ii
  JOIN public.invoices i ON ii.invoice_id = i.id
  WHERE ii.customer_service_id = p_customer_service_id
    AND i.status IN ('issued', 'partially_paid', 'paid');

  IF v_current_status = 'waived' AND v_active_count = 0 THEN
    v_new_status := 'waived';
  ELSIF v_active_count = 0 THEN
    v_new_status := 'unpaid';
  ELSIF v_total_paid = 0 THEN
    v_new_status := 'unpaid';
  ELSIF v_balance_due = 0 AND v_total_paid > 0 THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  IF v_new_status IS DISTINCT FROM v_current_status THEN
    PERFORM set_config('app.internal_request_payment_status_change', 'true', true);
    UPDATE public.customer_services
    SET payment_status = v_new_status,
        updated_at = NOW()
    WHERE id = p_customer_service_id;
    PERFORM set_config('app.internal_request_payment_status_change', 'false', true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_customer_service_payment_status(UUID) FROM PUBLIC, anon, authenticated;

-- 3. SYNCHRONIZATION TRIGGERS

CREATE OR REPLACE FUNCTION public.trg_func_sync_request_payment_status_on_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.customer_service_id IS NOT NULL THEN
      PERFORM public.recalculate_customer_service_payment_status(NEW.customer_service_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.customer_service_id IS NOT NULL THEN
      PERFORM public.recalculate_customer_service_payment_status(OLD.customer_service_id);
    END IF;
    IF NEW.customer_service_id IS NOT NULL AND NEW.customer_service_id IS DISTINCT FROM OLD.customer_service_id THEN
      PERFORM public.recalculate_customer_service_payment_status(NEW.customer_service_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.customer_service_id IS NOT NULL THEN
      PERFORM public.recalculate_customer_service_payment_status(OLD.customer_service_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_sync_request_payment_status_on_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_request_payment_status_on_item ON public.invoice_items;
CREATE TRIGGER trg_sync_request_payment_status_on_item
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_sync_request_payment_status_on_item();

CREATE OR REPLACE FUNCTION public.trg_func_sync_request_payment_status_on_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status) OR
     (NEW.paid_amount IS DISTINCT FROM OLD.paid_amount) OR
     (NEW.due_amount IS DISTINCT FROM OLD.due_amount) OR
     (NEW.total_amount IS DISTINCT FROM OLD.total_amount) THEN
    FOR r IN 
      SELECT DISTINCT customer_service_id 
      FROM public.invoice_items 
      WHERE invoice_id = NEW.id AND customer_service_id IS NOT NULL
    LOOP
      PERFORM public.recalculate_customer_service_payment_status(r.customer_service_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_sync_request_payment_status_on_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_request_payment_status_on_invoice ON public.invoices;
CREATE TRIGGER trg_sync_request_payment_status_on_invoice
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_func_sync_request_payment_status_on_invoice();

-- 4. INTERNAL ALLOCATION HELPER (MINIMUM PRIVILEGE)

CREATE OR REPLACE FUNCTION public.internal_allocate_payment(
  p_payment_id UUID,
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than 0';
  END IF;

  SELECT customer_id, amount, status
  INTO v_payment_customer_id, v_payment_amount, v_payment_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment_status != 'recorded' THEN
    RAISE EXCEPTION 'Cannot allocate from a voided or refunded payment';
  END IF;

  SELECT customer_id, total_amount, status
  INTO v_invoice_customer_id, v_invoice_total, v_invoice_status
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice_status = 'draft' THEN
    RAISE EXCEPTION 'Cannot allocate payment to a draft invoice. Invoice must be issued first';
  ELSIF v_invoice_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot allocate payment to a cancelled invoice';
  ELSIF v_invoice_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot allocate payment to an already fully paid invoice';
  ELSIF v_invoice_status NOT IN ('issued', 'partially_paid') THEN
    RAISE EXCEPTION 'Cannot allocate payment to invoice with status: %', v_invoice_status;
  END IF;

  IF v_payment_customer_id != v_invoice_customer_id THEN
    RAISE EXCEPTION 'Cross-customer payment allocation blocked by database rules';
  END IF;

  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = v_payment_customer_id
      AND bm.user_id = p_user_id
      AND bm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not an active member of this business';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_existing_pay_allocated
  FROM public.payment_allocations
  WHERE payment_id = p_payment_id AND invoice_id != p_invoice_id;

  v_remaining_pay_balance := v_payment_amount - v_existing_pay_allocated;
  IF p_amount > v_remaining_pay_balance THEN
    RAISE EXCEPTION 'Allocation amount (%) exceeds remaining payment balance (%)', p_amount, v_remaining_pay_balance;
  END IF;

  SELECT COALESCE(SUM(pa.amount), 0) INTO v_existing_inv_allocated
  FROM public.payment_allocations pa
  JOIN public.payments p ON pa.payment_id = p.id
  WHERE pa.invoice_id = p_invoice_id AND pa.payment_id != p_payment_id AND p.status = 'recorded';

  v_remaining_inv_due := GREATEST(0, v_invoice_total - v_existing_inv_allocated);
  IF p_amount > v_remaining_inv_due THEN
    RAISE EXCEPTION 'Allocation amount (%) exceeds remaining invoice due (%)', p_amount, v_remaining_inv_due;
  END IF;

  INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
  VALUES (p_payment_id, p_invoice_id, p_amount)
  ON CONFLICT (payment_id, invoice_id)
  DO UPDATE SET amount = EXCLUDED.amount
  RETURNING id INTO v_alloc_id;

  RETURN v_alloc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_allocate_payment(UUID, UUID, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;

-- 5. PUBLIC RPC: allocate_payment_atomic

CREATE OR REPLACE FUNCTION public.allocate_payment_atomic(
  p_payment_id UUID,
  p_invoice_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_alloc_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  BEGIN
    v_alloc_id := public.internal_allocate_payment(p_payment_id, p_invoice_id, p_amount, v_user_id);
    RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_payment_atomic(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_payment_atomic(UUID, UUID, NUMERIC) TO authenticated, service_role;

-- 6. PUBLIC RPC: unallocate_payment_atomic

CREATE OR REPLACE FUNCTION public.unallocate_payment_atomic(
  p_payment_id UUID,
  p_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_payment_customer_id UUID;
  v_invoice_customer_id UUID;
  v_existing_alloc_id UUID;
  v_alloc_amount NUMERIC(12,2);
  v_req RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_payment_id IS NULL OR p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Both payment_id and invoice_id are required');
  END IF;

  SELECT customer_id INTO v_payment_customer_id
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  SELECT customer_id INTO v_invoice_customer_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_payment_customer_id != v_invoice_customer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-customer payment allocation unallocation blocked by database rules');
  END IF;

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = v_payment_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  SELECT id, amount INTO v_existing_alloc_id, v_alloc_amount
  FROM public.payment_allocations
  WHERE payment_id = p_payment_id AND invoice_id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment allocation does not exist');
  END IF;

  DELETE FROM public.payment_allocations
  WHERE payment_id = p_payment_id AND invoice_id = p_invoice_id;

  PERFORM public.recalculate_invoice_financials(p_invoice_id);
  FOR v_req IN
    SELECT DISTINCT customer_service_id
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id AND customer_service_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_customer_service_payment_status(v_req.customer_service_id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'unallocated_amount', v_alloc_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unallocate_payment_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unallocate_payment_atomic(UUID, UUID) TO authenticated, service_role;

-- 7. PUBLIC RPC: create_invoice_atomic

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
  p_customer_id UUID,
  p_invoice_date DATE,
  p_due_date DATE,
  p_notes TEXT,
  p_status TEXT,
  p_items JSONB,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_fingerprint TEXT;
  v_item RECORD;
  v_qty NUMERIC(12,2);
  v_unit_price NUMERIC(12,2);
  v_discount NUMERIC(12,2);
  v_tax NUMERIC(12,2);
  v_line_total NUMERIC(12,2);
  v_subtotal NUMERIC(12,2) := 0;
  v_total_discount NUMERIC(12,2) := 0;
  v_total_tax NUMERIC(12,2) := 0;
  v_total_amount NUMERIC(12,2) := 0;
  v_initial_status TEXT;
  v_linked_request_id UUID := NULL;
  v_new_invoice_id UUID;
  v_new_invoice_number TEXT;
  v_existing RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = p_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  v_initial_status := COALESCE(NULLIF(trim(p_status), ''), 'issued');
  IF v_initial_status NOT IN ('draft', 'issued') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Initial invoice status must be draft or issued');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one invoice line item is required');
  END IF;

  v_fingerprint := encode(extensions.digest(
    (p_customer_id::text || '|' ||
     p_invoice_date::text || '|' ||
     COALESCE(p_due_date::text, '') || '|' ||
     v_initial_status || '|' ||
     COALESCE(trim(p_notes), '') || '|' ||
     p_items::text)::bytea,
    'sha256'
  ), 'hex');

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, invoice_number, total_amount, status, idempotency_fingerprint
    INTO v_existing
    FROM public.invoices
    WHERE customer_id = p_customer_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing.idempotency_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
        RETURN jsonb_build_object(
          'success', true,
          'replayed', true,
          'invoice_id', v_existing.id,
          'invoice_number', v_existing.invoice_number,
          'total_amount', v_existing.total_amount,
          'status', v_existing.status
        );
      ELSE
        RETURN jsonb_build_object(
          'success', false,
          'code', 'IDEMPOTENCY_CONFLICT',
          'error', 'Idempotency conflict: Key was already used with a different invoice payload'
        );
      END IF;
    END IF;
  END IF;

  FOR v_item IN
    SELECT
      x.service_id,
      x.customer_service_id,
      x.description,
      x.quantity,
      x.unit_price,
      x.discount_amount,
      x.tax_amount,
      ord.pos::integer AS line_position
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS ord(item_json, pos),
    LATERAL jsonb_to_record(ord.item_json) AS x(
      service_id UUID,
      customer_service_id UUID,
      description TEXT,
      quantity NUMERIC,
      unit_price NUMERIC,
      discount_amount NUMERIC,
      tax_amount NUMERIC
    )
  LOOP
    IF v_item.description IS NULL OR length(trim(v_item.description)) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Line item description is required');
    END IF;

    v_qty := GREATEST(1, COALESCE(v_item.quantity, 1));
    v_unit_price := GREATEST(0, COALESCE(v_item.unit_price, 0));
    v_discount := GREATEST(0, COALESCE(v_item.discount_amount, 0));
    v_tax := GREATEST(0, COALESCE(v_item.tax_amount, 0));
    v_line_total := GREATEST(0, (v_qty * v_unit_price) - v_discount + v_tax);

    v_subtotal := v_subtotal + (v_qty * v_unit_price);
    v_total_discount := v_total_discount + v_discount;
    v_total_tax := v_total_tax + v_tax;
    v_total_amount := v_total_amount + v_line_total;

    IF v_item.customer_service_id IS NOT NULL THEN
      IF v_linked_request_id IS NULL THEN
        v_linked_request_id := v_item.customer_service_id;
      ELSIF v_linked_request_id != v_item.customer_service_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Single-request invoice rule violation: All lines must belong to the same request');
      END IF;
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.invoices (
      customer_id,
      created_by,
      invoice_date,
      due_date,
      status,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      paid_amount,
      due_amount,
      notes,
      idempotency_key,
      idempotency_fingerprint
    ) VALUES (
      p_customer_id,
      COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
      p_invoice_date,
      p_due_date,
      v_initial_status,
      v_subtotal,
      v_total_discount,
      v_total_tax,
      v_total_amount,
      0,
      v_total_amount,
      NULLIF(trim(p_notes), ''),
      p_idempotency_key,
      v_fingerprint
    )
    RETURNING id, invoice_number INTO v_new_invoice_id, v_new_invoice_number;

  EXCEPTION WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id, invoice_number, total_amount, status, idempotency_fingerprint
      INTO v_existing
      FROM public.invoices
      WHERE customer_id = p_customer_id AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF v_existing.idempotency_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
          RETURN jsonb_build_object(
            'success', true,
            'replayed', true,
            'invoice_id', v_existing.id,
            'invoice_number', v_existing.invoice_number,
            'total_amount', v_existing.total_amount,
            'status', v_existing.status
          );
        ELSE
          RETURN jsonb_build_object(
            'success', false,
            'code', 'IDEMPOTENCY_CONFLICT',
            'error', 'Idempotency conflict: Concurrent key reused with different payload'
          );
        END IF;
      END IF;
    END IF;
    RAISE;
  END;

  FOR v_item IN
    SELECT
      x.service_id,
      x.customer_service_id,
      x.description,
      x.quantity,
      x.unit_price,
      x.discount_amount,
      x.tax_amount,
      ord.pos::integer AS line_position
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS ord(item_json, pos),
    LATERAL jsonb_to_record(ord.item_json) AS x(
      service_id UUID,
      customer_service_id UUID,
      description TEXT,
      quantity NUMERIC,
      unit_price NUMERIC,
      discount_amount NUMERIC,
      tax_amount NUMERIC
    )
  LOOP
    v_qty := GREATEST(1, COALESCE(v_item.quantity, 1));
    v_unit_price := GREATEST(0, COALESCE(v_item.unit_price, 0));
    v_discount := GREATEST(0, COALESCE(v_item.discount_amount, 0));
    v_tax := GREATEST(0, COALESCE(v_item.tax_amount, 0));
    v_line_total := GREATEST(0, (v_qty * v_unit_price) - v_discount + v_tax);

    INSERT INTO public.invoice_items (
      invoice_id,
      customer_service_id,
      service_id,
      description,
      quantity,
      unit_price,
      discount_amount,
      tax_amount,
      line_total,
      line_position
    ) VALUES (
      v_new_invoice_id,
      v_item.customer_service_id,
      v_item.service_id,
      trim(v_item.description),
      v_qty,
      v_unit_price,
      v_discount,
      v_tax,
      v_line_total,
      v_item.line_position
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'replayed', false,
    'invoice_id', v_new_invoice_id,
    'invoice_number', v_new_invoice_number,
    'total_amount', v_total_amount,
    'status', v_initial_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(UUID, DATE, DATE, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(UUID, DATE, DATE, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;

-- 8. PUBLIC RPC: record_payment_atomic

CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_reference_number TEXT,
  p_notes TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_fingerprint TEXT;
  v_existing RECORD;
  v_payment_id UUID;
  v_payment_number TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero');
  END IF;

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = p_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  v_fingerprint := encode(extensions.digest(
    (p_customer_id::text || '|' ||
     to_char(p_amount, 'FM999999999990.00') || '|' ||
     p_payment_date::text || '|' ||
     p_payment_method || '|' ||
     COALESCE(trim(p_reference_number), '') || '|' ||
     COALESCE(trim(p_notes), '') || '|NONE|standalone')::bytea,
    'sha256'
  ), 'hex');

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, payment_number, amount, status, idempotency_fingerprint
    INTO v_existing
    FROM public.payments
    WHERE customer_id = p_customer_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing.idempotency_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
        RETURN jsonb_build_object(
          'success', true,
          'replayed', true,
          'payment_id', v_existing.id,
          'payment_number', v_existing.payment_number,
          'amount', v_existing.amount,
          'status', v_existing.status
        );
      ELSE
        RETURN jsonb_build_object(
          'success', false,
          'code', 'IDEMPOTENCY_CONFLICT',
          'error', 'Idempotency conflict: Key was already used with a different payment payload'
        );
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.payments (
      customer_id,
      created_by,
      amount,
      payment_date,
      payment_method,
      reference_number,
      status,
      notes,
      idempotency_key,
      idempotency_fingerprint
    ) VALUES (
      p_customer_id,
      COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
      p_amount,
      p_payment_date,
      p_payment_method,
      NULLIF(trim(p_reference_number), ''),
      'recorded',
      NULLIF(trim(p_notes), ''),
      p_idempotency_key,
      v_fingerprint
    )
    RETURNING id, payment_number INTO v_payment_id, v_payment_number;

  EXCEPTION WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id, payment_number, amount, status, idempotency_fingerprint
      INTO v_existing
      FROM public.payments
      WHERE customer_id = p_customer_id AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF v_existing.idempotency_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
          RETURN jsonb_build_object(
            'success', true,
            'replayed', true,
            'payment_id', v_existing.id,
            'payment_number', v_existing.payment_number,
            'amount', v_existing.amount,
            'status', v_existing.status
          );
        ELSE
          RETURN jsonb_build_object(
            'success', false,
            'code', 'IDEMPOTENCY_CONFLICT',
            'error', 'Idempotency conflict: Concurrent key reused with different payload'
          );
        END IF;
      END IF;
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'replayed', false,
    'payment_id', v_payment_id,
    'payment_number', v_payment_number,
    'amount', p_amount,
    'status', 'recorded'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_atomic(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- 9. PUBLIC RPC: record_payment_and_allocate_atomic

CREATE OR REPLACE FUNCTION public.record_payment_and_allocate_atomic(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_reference_number TEXT,
  p_notes TEXT,
  p_invoice_id UUID,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_fingerprint TEXT;
  v_existing RECORD;
  v_existing_alloc RECORD;
  v_payment_id UUID;
  v_payment_number TEXT;
  v_allocation_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target invoice_id is required for allocated payment');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero');
  END IF;

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = p_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  v_fingerprint := encode(extensions.digest(
    (p_customer_id::text || '|' ||
     to_char(p_amount, 'FM999999999990.00') || '|' ||
     p_payment_date::text || '|' ||
     p_payment_method || '|' ||
     COALESCE(trim(p_reference_number), '') || '|' ||
     COALESCE(trim(p_notes), '') || '|' ||
     p_invoice_id::text || '|allocated')::bytea,
    'sha256'
  ), 'hex');

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, payment_number, amount, status, idempotency_fingerprint
    INTO v_existing
    FROM public.payments
    WHERE customer_id = p_customer_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing.idempotency_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
        SELECT id INTO v_existing_alloc
        FROM public.payment_allocations
        WHERE payment_id = v_existing.id AND invoice_id = p_invoice_id;

        RETURN jsonb_build_object(
          'success', true,
          'replayed', true,
          'payment_id', v_existing.id,
          'payment_number', v_existing.payment_number,
          'allocation_id', v_existing_alloc.id,
          'amount', v_existing.amount,
          'status', v_existing.status
        );
      ELSE
        RETURN jsonb_build_object(
          'success', false,
          'code', 'IDEMPOTENCY_CONFLICT',
          'error', 'Idempotency conflict: Key was already used with a different payment payload'
        );
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.payments (
      customer_id,
      created_by,
      amount,
      payment_date,
      payment_method,
      reference_number,
      status,
      notes,
      idempotency_key,
      idempotency_fingerprint
    ) VALUES (
      p_customer_id,
      COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
      p_amount,
      p_payment_date,
      p_payment_method,
      NULLIF(trim(p_reference_number), ''),
      'recorded',
      NULLIF(trim(p_notes), ''),
      p_idempotency_key,
      v_fingerprint
    )
    RETURNING id, payment_number INTO v_payment_id, v_payment_number;

  EXCEPTION WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id, payment_number, amount, status, idempotency_fingerprint
      INTO v_existing
      FROM public.payments
      WHERE customer_id = p_customer_id AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF v_existing.idempotency_fingerprint IS NOT DISTINCT FROM v_fingerprint THEN
          SELECT id INTO v_existing_alloc
          FROM public.payment_allocations
          WHERE payment_id = v_existing.id AND invoice_id = p_invoice_id;

          RETURN jsonb_build_object(
            'success', true,
            'replayed', true,
            'payment_id', v_existing.id,
            'payment_number', v_existing.payment_number,
            'allocation_id', v_existing_alloc.id,
            'amount', v_existing.amount,
            'status', v_existing.status
          );
        ELSE
          RETURN jsonb_build_object(
            'success', false,
            'code', 'IDEMPOTENCY_CONFLICT',
            'error', 'Idempotency conflict: Concurrent key reused with different payload'
          );
        END IF;
      END IF;
    END IF;
    RAISE;
  END;

  BEGIN
    v_allocation_id := public.internal_allocate_payment(v_payment_id, p_invoice_id, p_amount, v_user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'replayed', false,
    'payment_id', v_payment_id,
    'payment_number', v_payment_number,
    'allocation_id', v_allocation_id,
    'amount', p_amount,
    'status', 'recorded'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_and_allocate_atomic(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_and_allocate_atomic(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;

-- 10. PUBLIC RPC: set_request_payment_waiver

CREATE OR REPLACE FUNCTION public.set_request_payment_waiver(
  p_request_id UUID,
  p_waived BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_customer_id UUID;
  v_active_count INTEGER;
  v_current_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT customer_id, payment_status
  INTO v_customer_id, v_current_status
  FROM public.customer_services
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service request not found');
  END IF;

  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = v_customer_id
      AND bm.user_id = v_user_id
      AND bm.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: User is not an active member of this business');
  END IF;

  IF p_waived THEN
    SELECT COUNT(DISTINCT i.id) INTO v_active_count
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE ii.customer_service_id = p_request_id
      AND i.status IN ('issued', 'partially_paid', 'paid');

    IF v_active_count > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot waive service request with active invoices. Cancel or void invoices first'
      );
    END IF;

    PERFORM set_config('app.internal_request_payment_status_change', 'true', true);
    UPDATE public.customer_services
    SET payment_status = 'waived',
        updated_at = NOW()
    WHERE id = p_request_id;
    PERFORM set_config('app.internal_request_payment_status_change', 'false', true);

    RETURN jsonb_build_object('success', true, 'payment_status', 'waived');
  ELSE
    PERFORM set_config('app.internal_request_payment_status_change', 'true', true);
    UPDATE public.customer_services
    SET payment_status = 'unpaid',
        updated_at = NOW()
    WHERE id = p_request_id;
    PERFORM set_config('app.internal_request_payment_status_change', 'false', true);

    PERFORM public.recalculate_customer_service_payment_status(p_request_id);

    SELECT payment_status INTO v_current_status
    FROM public.customer_services
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'payment_status', v_current_status);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_request_payment_waiver(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_request_payment_waiver(UUID, BOOLEAN) TO authenticated, service_role;
;
