-- ==============================================================================
-- PHASE 11: ATOMIC DATABASE-BACKED CUSTOMER CODE GENERATION & COLLISION HARDENING
-- Idempotent, Concurrency-Safe Migration
-- ==============================================================================

-- 1. Create atomic sequence for customer codes
CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq START WITH 1;

-- 2. Create atomic customer code generator function
CREATE OR REPLACE FUNCTION public.generate_customer_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_val BIGINT;
BEGIN
  v_next_val := nextval('public.customer_code_seq');
  RETURN 'CUST-' || LPAD(v_next_val::text, 6, '0');
END;
$$;

-- Secure the generator function permissions
REVOKE ALL ON FUNCTION public.generate_customer_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_customer_code() TO service_role, postgres;

-- 3. Dynamic Sequence Initialization & Backfill of Legacy / Empty Rows
DO $$
DECLARE
  max_val BIGINT := 0;
  rec RECORD;
  num_part BIGINT;
BEGIN
  -- Scan existing customer records to find highest numeric suffix
  FOR rec IN 
    SELECT customer_code 
    FROM public.customers 
    WHERE customer_code IS NOT NULL AND TRIM(customer_code) != ''
  LOOP
    IF rec.customer_code ~ '\d+$' THEN
      num_part := (regexp_match(rec.customer_code, '(\d+)$'))[1]::BIGINT;
      IF num_part > max_val THEN
        max_val := num_part;
      END IF;
    END IF;
  END LOOP;

  -- Initialize sequence so the nextval is strictly greater than all existing numeric suffixes
  -- PostgreSQL setval semantics:
  -- When max_val > 0: setval(..., max_val, true) -> nextval returns max_val + 1
  -- When max_val = 0: setval(..., 1, false) -> nextval returns 1
  IF max_val > 0 THEN
    PERFORM setval('public.customer_code_seq', max_val, true);
  ELSE
    PERFORM setval('public.customer_code_seq', 1, false);
  END IF;

  -- Backfill any existing rows with empty/blank customer_code to ensure zero duplicate "" collisions
  FOR rec IN 
    SELECT id 
    FROM public.customers 
    WHERE customer_code IS NULL OR TRIM(customer_code) = ''
  LOOP
    UPDATE public.customers 
    SET customer_code = public.generate_customer_code()
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 4. Create Trigger Function for Automatic Customer Code Assignment
CREATE OR REPLACE FUNCTION public.trg_func_assign_customer_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If customer_code is missing, null, empty string, or whitespace, generate atomically
  IF NEW.customer_code IS NULL OR TRIM(NEW.customer_code) = '' THEN
    NEW.customer_code := public.generate_customer_code();
  ELSE
    -- Normalize user/admin provided code
    NEW.customer_code := TRIM(NEW.customer_code);
  END IF;
  RETURN NEW;
END;
$$;

-- Secure trigger function permissions
REVOKE ALL ON FUNCTION public.trg_func_assign_customer_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_func_assign_customer_code() TO service_role, postgres;

-- 5. Attach BEFORE INSERT Trigger to customers table
DROP TRIGGER IF EXISTS trg_assign_customer_code ON public.customers;
CREATE TRIGGER trg_assign_customer_code
BEFORE INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.trg_func_assign_customer_code();

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
