-- ==============================================================================
-- AI EXTRACTION CACHE HARDENING MIGRATION
-- Migration to harden cache uniqueness from global request_hash to per-user (created_by, request_hash)
-- ==============================================================================

-- 1. Create table with per-user composite unique constraint if not exists
CREATE TABLE IF NOT EXISTS public.ai_extraction_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model_name text NOT NULL,
  prompt_version text NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  expires_at timestamptz,
  hit_count integer DEFAULT 0 NOT NULL,
  last_used_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT ai_extraction_cache_user_request_hash_key UNIQUE (created_by, request_hash)
);

-- 2. Safely drop legacy global request_hash UNIQUE constraints if present on existing installations
ALTER TABLE public.ai_extraction_cache DROP CONSTRAINT IF EXISTS ai_extraction_cache_request_hash_key;
ALTER TABLE public.ai_extraction_cache DROP CONSTRAINT IF EXISTS ai_extraction_cache_request_hash_unique;

-- 3. Safely drop redundant standalone index on request_hash if present
DROP INDEX IF EXISTS public.idx_ai_extraction_cache_request_hash;

-- 4. Ensure Composite Unique Constraint on (created_by, request_hash) is applied idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ai_extraction_cache_user_request_hash_key' 
      AND conrelid = 'public.ai_extraction_cache'::regclass
  ) THEN
    ALTER TABLE public.ai_extraction_cache 
      ADD CONSTRAINT ai_extraction_cache_user_request_hash_key 
      UNIQUE (created_by, request_hash);
  END IF;
END $$;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.ai_extraction_cache ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (Strict privacy & user isolation matching ai_import_history)
DROP POLICY IF EXISTS "Users can insert own cache" ON public.ai_extraction_cache;
DROP POLICY IF EXISTS "Users can view own cache" ON public.ai_extraction_cache;
DROP POLICY IF EXISTS "Users can update own cache" ON public.ai_extraction_cache;
DROP POLICY IF EXISTS "Users can delete own cache" ON public.ai_extraction_cache;

CREATE POLICY "Users can insert own cache"
  ON public.ai_extraction_cache
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view own cache"
  ON public.ai_extraction_cache
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can update own cache"
  ON public.ai_extraction_cache
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own cache"
  ON public.ai_extraction_cache
  FOR DELETE
  USING (auth.uid() = created_by);

-- 7. Security Hardened Cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_ai_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_rows integer;
BEGIN
  DELETE FROM public.ai_extraction_cache
  WHERE expires_at IS NOT NULL
    AND expires_at < timezone('utc', now());

  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$;

-- Revoke public execution rights for SECURITY DEFINER safety
REVOKE ALL ON FUNCTION public.cleanup_expired_ai_cache() FROM PUBLIC;
