-- ==============================================================================
-- HOTFIX: FIX INVOICE & PAYMENT NUMBER GENERATION PERMISSIONS
-- Move from column DEFAULT to BEFORE INSERT trigger
-- ==============================================================================

-- 1. Remove DEFAULT expression from columns to prevent permission denied errors
ALTER TABLE public.invoices ALTER COLUMN invoice_number DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN payment_number DROP DEFAULT;

-- 2. Ensure generator functions remain highly secure
REVOKE ALL ON FUNCTION public.generate_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_payment_number() FROM PUBLIC, anon, authenticated;

-- 3. Create Trigger Function for Invoices
CREATE OR REPLACE FUNCTION public.trg_func_assign_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always force generation to ignore client-supplied values
  NEW.invoice_number := public.generate_invoice_number();
  RETURN NEW;
END;
$$;

-- Secure the trigger function
REVOKE ALL ON FUNCTION public.trg_func_assign_invoice_number() FROM PUBLIC, anon, authenticated;

-- Attach Trigger to Invoices
DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_func_assign_invoice_number();


-- 4. Create Trigger Function for Payments
CREATE OR REPLACE FUNCTION public.trg_func_assign_payment_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always force generation to ignore client-supplied values
  NEW.payment_number := public.generate_payment_number();
  RETURN NEW;
END;
$$;

-- Secure the trigger function
REVOKE ALL ON FUNCTION public.trg_func_assign_payment_number() FROM PUBLIC, anon, authenticated;

-- Attach Trigger to Payments
DROP TRIGGER IF EXISTS trg_assign_payment_number ON public.payments;
CREATE TRIGGER trg_assign_payment_number
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_func_assign_payment_number();
