-- ==============================================================================
-- GCDS ELECTORAL DETAILS FOUNDATION MIGRATION
-- File: supabase/migrations/20261002224500_customer_electoral_details.sql
-- ==============================================================================

-- 1. Add electoral columns to public.customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS assembly_constituency TEXT NULL,
  ADD COLUMN IF NOT EXISTS assembly_constituency_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS parliamentary_constituency TEXT NULL,
  ADD COLUMN IF NOT EXISTS parliamentary_constituency_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS electoral_verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS electoral_verified_at TIMESTAMPTZ NULL;

-- 2. Add validation constraint for verification status (idempotent drop & add)
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS chk_customers_electoral_verification_status;

ALTER TABLE public.customers
  ADD CONSTRAINT chk_customers_electoral_verification_status
  CHECK (electoral_verification_status IN ('unverified', 'customer_confirmed', 'officially_verified'));

-- 3. Add strengthened constraint ensuring verified_at consistency:
--    unverified -> verified_at MUST be NULL
--    customer_confirmed | officially_verified -> verified_at MUST NOT be NULL
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS chk_customers_electoral_verified_at_consistency;

ALTER TABLE public.customers
  ADD CONSTRAINT chk_customers_electoral_verified_at_consistency
  CHECK (
    (electoral_verification_status = 'unverified' AND electoral_verified_at IS NULL)
    OR
    (electoral_verification_status IN ('customer_confirmed', 'officially_verified') AND electoral_verified_at IS NOT NULL)
  );

-- 4. Database-owned lifecycle trigger to guarantee verified_at consistency
CREATE OR REPLACE FUNCTION public.check_customer_electoral_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Reverting to unverified strictly nulls verified_at
  IF NEW.electoral_verification_status = 'unverified' THEN
    NEW.electoral_verified_at := NULL;
  -- If confirmed or officially verified, electoral_verified_at must be populated
  ELSIF NEW.electoral_verification_status IN ('customer_confirmed', 'officially_verified') THEN
    IF NEW.electoral_verified_at IS NULL THEN
      NEW.electoral_verified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_electoral_lifecycle ON public.customers;
CREATE TRIGGER trg_customer_electoral_lifecycle
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.check_customer_electoral_lifecycle();

-- 5. Tenant-scoped indexes for electoral lookups
CREATE INDEX IF NOT EXISTS idx_customers_business_assembly_constituency
  ON public.customers(business_id, assembly_constituency)
  WHERE assembly_constituency IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_business_parliamentary_constituency
  ON public.customers(business_id, parliamentary_constituency)
  WHERE parliamentary_constituency IS NOT NULL;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
