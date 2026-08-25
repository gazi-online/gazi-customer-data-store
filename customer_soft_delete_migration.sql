-- ==============================================================================
-- PHASE 12: CUSTOMER SOFT DELETE MIGRATION
-- Idempotent, non-destructive migration
-- ==============================================================================

-- 1. Add deleted_at column to customers table if not exists
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add index for active customers query performance
CREATE INDEX IF NOT EXISTS idx_customers_active_deleted_at
ON public.customers (deleted_at)
WHERE deleted_at IS NULL;

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
