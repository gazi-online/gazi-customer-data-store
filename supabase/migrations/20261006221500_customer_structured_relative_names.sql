-- ==============================================================================
-- Migration: 20261006221500_customer_structured_relative_names.sql
-- Description: Adds explicit structured relative name fields to customers table.
--
-- Form 6 Section C requires:
--   Name    -> Relative First + Middle Name
--   Surname -> Relative Surname
--
-- These columns store explicit, operator-confirmed structured name parts.
-- All columns are strictly NULLABLE with NO default values.
-- Existing customer records remain intact; legacy father_name, mother_name,
-- and spouse_name are preserved.
-- ==============================================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS father_first_middle_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS father_surname TEXT NULL,
  ADD COLUMN IF NOT EXISTS mother_first_middle_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS mother_surname TEXT NULL,
  ADD COLUMN IF NOT EXISTS spouse_first_middle_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS spouse_surname TEXT NULL;

-- Documentation comments
COMMENT ON COLUMN public.customers.father_first_middle_name IS 'Explicit structured first and middle name of father for electoral Form 6 Section C filling';
COMMENT ON COLUMN public.customers.father_surname IS 'Explicit structured surname of father for electoral Form 6 Section C filling';
COMMENT ON COLUMN public.customers.mother_first_middle_name IS 'Explicit structured first and middle name of mother for electoral Form 6 Section C filling';
COMMENT ON COLUMN public.customers.mother_surname IS 'Explicit structured surname of mother for electoral Form 6 Section C filling';
COMMENT ON COLUMN public.customers.spouse_first_middle_name IS 'Explicit structured first and middle name of spouse for electoral Form 6 Section C filling';
COMMENT ON COLUMN public.customers.spouse_surname IS 'Explicit structured surname of spouse for electoral Form 6 Section C filling';

NOTIFY pgrst, 'reload schema';
