-- ==============================================================================
-- PHASE 9: PAYMENTS & BILLING FOUNDATION MIGRATION (HARDENED FINANCIAL INTEGRITY)
-- Fully Idempotent, Upgrade-Safe Database Schema with DB-Level Financial Integrity
-- ==============================================================================

-- ==============================================================================
-- 1. CONCURRENCY-SAFE SEQUENCES & NUMBER GENERATORS
-- ==============================================================================

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.invoice_number_seq')::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_payment_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PAY-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.payment_number_seq')::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_payment_number() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 2. TABLES CREATION
-- ==============================================================================

-- 2.1 INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  cancelled_at TIMESTAMPTZ
);

-- 2.2 INVOICE ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_service_id UUID REFERENCES public.customer_services(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- 2.3 PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  payment_number TEXT UNIQUE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  voided_at TIMESTAMPTZ
);

-- 2.4 PAYMENT ALLOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT payment_allocations_payment_invoice_key UNIQUE (payment_id, invoice_id)
);

-- Remove sequence defaults from existing columns if updated (migrating to triggers)
ALTER TABLE public.invoices ALTER COLUMN invoice_number DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN payment_number DROP DEFAULT;

-- Attach Triggers for Number Generation
CREATE OR REPLACE FUNCTION public.trg_func_assign_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.invoice_number := public.generate_invoice_number();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_assign_invoice_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_func_assign_invoice_number();


CREATE OR REPLACE FUNCTION public.trg_func_assign_payment_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.payment_number := public.generate_payment_number();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_assign_payment_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_payment_number ON public.payments;
CREATE TRIGGER trg_assign_payment_number
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_func_assign_payment_number();

-- ==============================================================================
-- 3. CHECK CONSTRAINTS (IDEMPOTENT & STRICT)
-- ==============================================================================

DO $$
BEGIN
  -- Invoices Constraints
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_status;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_subtotal;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_discount;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_tax;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_total;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_paid;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_due;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_paid_le_total;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_invoices_due_le_total;

  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_status CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled'));
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_subtotal CHECK (subtotal >= 0);
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_discount CHECK (discount_amount >= 0);
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_tax CHECK (tax_amount >= 0);
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_total CHECK (total_amount >= 0);
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_paid CHECK (paid_amount >= 0);
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_due CHECK (due_amount >= 0);
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_paid_le_total CHECK (paid_amount <= total_amount);
  ALTER TABLE public.invoices ADD CONSTRAINT check_invoices_due_le_total CHECK (due_amount <= total_amount);

  -- Invoice Items Constraints
  ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS check_invoice_items_quantity;
  ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS check_invoice_items_unit_price;
  ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS check_invoice_items_discount;
  ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS check_invoice_items_tax;
  ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS check_invoice_items_line_total;

  ALTER TABLE public.invoice_items ADD CONSTRAINT check_invoice_items_quantity CHECK (quantity > 0);
  ALTER TABLE public.invoice_items ADD CONSTRAINT check_invoice_items_unit_price CHECK (unit_price >= 0);
  ALTER TABLE public.invoice_items ADD CONSTRAINT check_invoice_items_discount CHECK (discount_amount >= 0);
  ALTER TABLE public.invoice_items ADD CONSTRAINT check_invoice_items_tax CHECK (tax_amount >= 0);
  ALTER TABLE public.invoice_items ADD CONSTRAINT check_invoice_items_line_total CHECK (line_total >= 0);

  -- Payments Constraints
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS check_payments_status;
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS check_payments_method;
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS check_payments_amount;

  ALTER TABLE public.payments ADD CONSTRAINT check_payments_status CHECK (status IN ('recorded', 'voided', 'refunded'));
  ALTER TABLE public.payments ADD CONSTRAINT check_payments_method CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other'));
  ALTER TABLE public.payments ADD CONSTRAINT check_payments_amount CHECK (amount > 0);

  -- Payment Allocations Constraints
  ALTER TABLE public.payment_allocations DROP CONSTRAINT IF EXISTS check_payment_allocations_amount;
  ALTER TABLE public.payment_allocations ADD CONSTRAINT check_payment_allocations_amount CHECK (amount > 0);
END $$;

-- ==============================================================================
-- 4. HARDEN INVOICE TOTAL & DERIVED FINANCIAL INTEGRITY
-- ==============================================================================

-- 4.1 Validate Invoice Mathematical Total Integrity Before Write
CREATE OR REPLACE FUNCTION public.trg_func_validate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF ROUND(NEW.subtotal - NEW.discount_amount + NEW.tax_amount, 2) != NEW.total_amount THEN
    RAISE EXCEPTION 'Invoice total_amount (%) does not equal subtotal (%) - discount (%) + tax (%)',
      NEW.total_amount, NEW.subtotal, NEW.discount_amount, NEW.tax_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.trg_func_validate_invoice_totals() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_invoice_totals ON public.invoices;
CREATE TRIGGER trg_validate_invoice_totals
BEFORE INSERT OR UPDATE OF subtotal, discount_amount, tax_amount, total_amount ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_func_validate_invoice_totals();

-- 4.2 Prevent Direct Financial Field & Status Tampering by Client/Browser
CREATE OR REPLACE FUNCTION public.trg_func_protect_invoice_derived_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If modification is performed outside the trusted recalculation function, block tampering
  IF current_setting('app.internal_financial_recalc', true) IS DISTINCT FROM 'true' THEN
    -- 1. Block direct alteration of paid_amount or due_amount
    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR NEW.due_amount IS DISTINCT FROM OLD.due_amount THEN
      RAISE EXCEPTION 'Direct modification of derived financial fields (paid_amount, due_amount) is blocked by database rules';
    END IF;

    -- 2. Block direct transition TO payment-derived states ('partially_paid', 'paid')
    IF (NEW.status IN ('partially_paid', 'paid')) AND (OLD.status NOT IN ('partially_paid', 'paid')) THEN
      RAISE EXCEPTION 'Direct transition TO payment-derived status (%) is blocked. Use payment allocation RPCs', NEW.status;
    END IF;

    -- 3. Block direct transition FROM payment-derived states ('partially_paid', 'paid') to any other status
    IF (OLD.status IN ('partially_paid', 'paid')) AND (NEW.status NOT IN ('partially_paid', 'paid')) THEN
      RAISE EXCEPTION 'Direct transition FROM payment-derived status (%) to % is blocked. Void/refund payments to recalculate status', OLD.status, NEW.status;
    END IF;

    -- 4. Validate Legitimate Client Lifecycle Transitions: draft -> issued, draft/issued -> cancelled
    IF OLD.status = 'draft' AND NEW.status = 'issued' THEN
      -- Legitimate issuance of a draft invoice
      NULL;
    ELSIF (OLD.status IN ('draft', 'issued')) AND NEW.status = 'cancelled' THEN
      -- Legitimate cancellation of unpaid invoice
      IF NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := NOW();
      END IF;
      NEW.due_amount := 0;
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'Invalid direct invoice status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.trg_func_protect_invoice_derived_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_invoice_derived_fields ON public.invoices;
CREATE TRIGGER trg_protect_invoice_derived_fields
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_func_protect_invoice_derived_fields();

-- ==============================================================================
-- 5. DATABASE SAME-CUSTOMER ALLOCATION PROTECTION TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_func_enforce_allocation_same_customer()
RETURNS TRIGGER AS $$
DECLARE
  v_pay_cust UUID;
  v_inv_cust UUID;
BEGIN
  SELECT customer_id INTO v_pay_cust FROM public.payments WHERE id = NEW.payment_id;
  SELECT customer_id INTO v_inv_cust FROM public.invoices WHERE id = NEW.invoice_id;

  IF v_pay_cust IS NULL OR v_inv_cust IS NULL THEN
    RAISE EXCEPTION 'Payment or Invoice not found for allocation';
  END IF;

  IF v_pay_cust != v_inv_cust THEN
    RAISE EXCEPTION 'Cross-customer payment allocation blocked by database rules: Payment customer (%) != Invoice customer (%)',
      v_pay_cust, v_inv_cust;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.trg_func_enforce_allocation_same_customer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_allocation_same_customer ON public.payment_allocations;
CREATE TRIGGER trg_enforce_allocation_same_customer
BEFORE INSERT OR UPDATE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.trg_func_enforce_allocation_same_customer();

-- ==============================================================================
-- 6. CENTRALIZED RECALCULATION & AUTOMATIC RECALCULATION TRIGGERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_invoice_financials(target_invoice_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_amount NUMERIC(12,2);
  v_status TEXT;
  v_valid_paid NUMERIC(12,2);
  v_new_due NUMERIC(12,2);
  v_new_status TEXT;
BEGIN
  -- Set session flag to bypass direct financial field update guard
  PERFORM set_config('app.internal_financial_recalc', 'true', true);

  -- Row lock invoice for atomic update
  SELECT total_amount, status INTO v_total_amount, v_status
  FROM public.invoices
  WHERE id = target_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM set_config('app.internal_financial_recalc', 'false', true);
    RETURN;
  END IF;

  -- Calculate sum of valid allocations from active ('recorded') payments
  SELECT COALESCE(SUM(pa.amount), 0) INTO v_valid_paid
  FROM public.payment_allocations pa
  JOIN public.payments p ON pa.payment_id = p.id
  WHERE pa.invoice_id = target_invoice_id
    AND p.status = 'recorded';

  v_valid_paid := LEAST(v_valid_paid, v_total_amount);
  v_new_due := GREATEST(0, v_total_amount - v_valid_paid);

  -- Derive status preserving draft/cancelled states
  IF v_status = 'cancelled' THEN
    v_new_status := 'cancelled';
    v_new_due := 0;
  ELSIF v_status = 'draft' THEN
    v_new_status := 'draft';
  ELSIF v_valid_paid <= 0 THEN
    v_new_status := 'issued';
  ELSIF v_valid_paid >= v_total_amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE public.invoices
  SET paid_amount = v_valid_paid,
      due_amount = v_new_due,
      status = v_new_status,
      updated_at = NOW()
  WHERE id = target_invoice_id;

  PERFORM set_config('app.internal_financial_recalc', 'false', true);
END;
$$;

-- Internal function: Revoke execution from all client roles
REVOKE ALL ON FUNCTION public.recalculate_invoice_financials(UUID) FROM PUBLIC, anon, authenticated;

-- 6.1 Trigger on payment_allocations changes
CREATE OR REPLACE FUNCTION public.trg_func_recalc_on_allocation_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM public.recalculate_invoice_financials(NEW.invoice_id);
  END IF;

  IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.invoice_id != NEW.invoice_id)) THEN
    PERFORM public.recalculate_invoice_financials(OLD.invoice_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.trg_func_recalc_on_allocation_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recalc_on_allocation_change ON public.payment_allocations;
CREATE TRIGGER trg_recalc_on_allocation_change
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.trg_func_recalc_on_allocation_change();

-- 6.2 Trigger on payment status changes (void/refund)
CREATE OR REPLACE FUNCTION public.trg_func_recalc_on_payment_status_change()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    FOR r IN SELECT DISTINCT invoice_id FROM public.payment_allocations WHERE payment_id = NEW.id LOOP
      PERFORM public.recalculate_invoice_financials(r.invoice_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.trg_func_recalc_on_payment_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recalc_on_payment_status_change ON public.payments;
CREATE TRIGGER trg_recalc_on_payment_status_change
AFTER UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_func_recalc_on_payment_status_change();

-- ==============================================================================
-- 7. ATOMIC TRANSACTION RPCs FOR ALLOCATION, VOID & REFUND
-- ==============================================================================

-- 7.1 Allocate Payment Atomic RPC
CREATE OR REPLACE FUNCTION public.allocate_payment_atomic(
  p_payment_id UUID,
  p_invoice_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_customer_id UUID;
  v_payment_created_by UUID;
  v_payment_amount NUMERIC(12,2);
  v_payment_status TEXT;
  v_invoice_customer_id UUID;
  v_invoice_created_by UUID;
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

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Allocation amount must be greater than 0');
  END IF;

  -- Lock payment row
  SELECT customer_id, amount, status, created_by INTO v_payment_customer_id, v_payment_amount, v_payment_status, v_payment_created_by
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Ownership verification if authenticated context
  IF v_user_id IS NOT NULL AND v_payment_created_by IS NOT NULL AND v_payment_created_by != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: Payment ownership mismatch');
  END IF;

  IF v_payment_status != 'recorded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot allocate from a voided or refunded payment');
  END IF;

  -- Lock invoice row
  SELECT customer_id, total_amount, status, created_by INTO v_invoice_customer_id, v_invoice_total, v_invoice_status, v_invoice_created_by
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  -- Ownership verification if authenticated context
  IF v_user_id IS NOT NULL AND v_invoice_created_by IS NOT NULL AND v_invoice_created_by != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: Invoice ownership mismatch');
  END IF;

  -- DB-LEVEL SAME-CUSTOMER INTEGRITY CHECK
  IF v_payment_customer_id != v_invoice_customer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-customer payment allocation blocked by database rules');
  END IF;

  IF v_invoice_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot allocate payment to a cancelled invoice');
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

  -- Trigger automatically calls recalculate_invoice_financials(p_invoice_id)
  RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id);
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_payment_atomic(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_payment_atomic(UUID, UUID, NUMERIC) TO authenticated;

-- 7.2 Void Payment Atomic RPC
CREATE OR REPLACE FUNCTION public.void_payment_atomic(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
  v_status TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT created_by, status INTO v_created_by, v_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF v_user_id IS NOT NULL AND v_created_by IS NOT NULL AND v_created_by != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: Payment ownership mismatch');
  END IF;

  IF v_status = 'voided' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is already voided');
  END IF;

  UPDATE public.payments
  SET status = 'voided',
      voided_at = NOW()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_payment_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_payment_atomic(UUID) TO authenticated;

-- 7.3 Refund Payment Atomic RPC
CREATE OR REPLACE FUNCTION public.refund_payment_atomic(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
  v_status TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT created_by, status INTO v_created_by, v_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF v_user_id IS NOT NULL AND v_created_by IS NOT NULL AND v_created_by != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: Payment ownership mismatch');
  END IF;

  IF v_status != 'recorded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only recorded payments can be refunded');
  END IF;

  UPDATE public.payments
  SET status = 'refunded'
  WHERE id = p_payment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_payment_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_payment_atomic(UUID) TO authenticated;

-- ==============================================================================
-- 8. UPDATED_AT TRIGGERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION update_invoices_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION update_invoices_updated_at();

CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION update_payments_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();

-- ==============================================================================
-- 9. INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_id ON public.payment_allocations(invoice_id);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES & GRANTS
-- ==============================================================================

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

-- 10.1 Invoices RLS Policies
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Invoices SELECT Policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoices INSERT Policy" ON public.invoices;
DROP POLICY IF EXISTS "Invoices UPDATE Policy" ON public.invoices;

CREATE POLICY "Invoices SELECT Policy" ON public.invoices
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Invoices INSERT Policy" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Invoices UPDATE Policy" ON public.invoices
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- 10.2 Invoice Items RLS Policies
DROP POLICY IF EXISTS "Authenticated users can view invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can update invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items SELECT Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items INSERT Policy" ON public.invoice_items;
DROP POLICY IF EXISTS "Invoice Items UPDATE Policy" ON public.invoice_items;

CREATE POLICY "Invoice Items SELECT Policy" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = invoice_items.invoice_id AND inv.created_by = auth.uid()));

CREATE POLICY "Invoice Items INSERT Policy" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = invoice_items.invoice_id AND inv.created_by = auth.uid()));

CREATE POLICY "Invoice Items UPDATE Policy" ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = invoice_items.invoice_id AND inv.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = invoice_items.invoice_id AND inv.created_by = auth.uid()));

-- 10.3 Payments RLS Policies
DROP POLICY IF EXISTS "Authenticated users can view payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can update payments" ON public.payments;
DROP POLICY IF EXISTS "Payments SELECT Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments INSERT Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments UPDATE Policy" ON public.payments;

CREATE POLICY "Payments SELECT Policy" ON public.payments
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Payments INSERT Policy" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Payments UPDATE Policy" ON public.payments
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- 10.4 Payment Allocations RLS Policies & Strict Write Privilege Revocation
DROP POLICY IF EXISTS "Authenticated users can view payment_allocations" ON public.payment_allocations;
DROP POLICY IF EXISTS "Authenticated users can insert payment_allocations" ON public.payment_allocations;
DROP POLICY IF EXISTS "Authenticated users can update payment_allocations" ON public.payment_allocations;
DROP POLICY IF EXISTS "Payment Allocations SELECT Policy" ON public.payment_allocations;

-- Dual-Ownership SELECT Policy: Requires BOTH Payment AND Invoice ownership
CREATE POLICY "Payment Allocations SELECT Policy" ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_allocations.payment_id AND p.created_by = auth.uid())
    AND
    EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = payment_allocations.invoice_id AND inv.created_by = auth.uid())
  );

-- REVOKE direct table write privileges on payment_allocations for clients
REVOKE INSERT, UPDATE, DELETE ON public.payment_allocations FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.payment_allocations TO authenticated;



