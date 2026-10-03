-- ==============================================================================
-- GCDS ELECTORAL DETAILS V3 — PART & SERIAL NUMBER MIGRATION
-- File: supabase/migrations/20261003150000_customer_electoral_part_serial.sql
-- ==============================================================================

-- Add additive nullable TEXT columns for electoral roll Part Number and Serial Number in Part
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS electoral_part_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS electoral_serial_number TEXT NULL;

-- Backward-compatibility guarantee:
-- parliamentary_constituency and parliamentary_constituency_number are intentionally NOT dropped.

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
