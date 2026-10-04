-- ==============================================================================
-- GCDS SECURE EXTENSION API — PAIRING TOKEN MIGRATION
-- File: supabase/migrations/20261003190000_extension_pairing_tokens.sql
-- ==============================================================================

-- 1. Create table for securely storing hashed extension pairing tokens
CREATE TABLE IF NOT EXISTS public.extension_pairing_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{customers:search,customers:form_fill}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_extension_pairing_tokens_scopes CHECK (
    scopes <@ ARRAY['customers:search', 'customers:form_fill']::text[]
    AND array_length(scopes, 1) > 0
  ),
  CONSTRAINT chk_extension_pairing_tokens_expiry CHECK (expires_at > created_at)
);

-- 2. Performance & Security Indexes
CREATE INDEX IF NOT EXISTS idx_extension_pairing_tokens_lookup
  ON public.extension_pairing_tokens (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_extension_pairing_tokens_business
  ON public.extension_pairing_tokens (business_id, user_id);

CREATE INDEX IF NOT EXISTS idx_extension_pairing_tokens_active
  ON public.extension_pairing_tokens (business_id, expires_at)
  WHERE revoked_at IS NULL;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.extension_pairing_tokens ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Strictly scoped to active business membership of the caller

-- SELECT: Users can view pairing tokens for businesses where they are active members
DROP POLICY IF EXISTS "extension_tokens_select_policy" ON public.extension_pairing_tokens;
CREATE POLICY "extension_tokens_select_policy"
  ON public.extension_pairing_tokens
  FOR SELECT
  TO authenticated
  USING (
    business_id IN (
      SELECT bm.business_id
      FROM public.business_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- INSERT: Users can create pairing tokens bound to their active business
DROP POLICY IF EXISTS "extension_tokens_insert_policy" ON public.extension_pairing_tokens;
CREATE POLICY "extension_tokens_insert_policy"
  ON public.extension_pairing_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND business_id IN (
      SELECT bm.business_id
      FROM public.business_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- UPDATE: Users can revoke/update pairing tokens for their active business
DROP POLICY IF EXISTS "extension_tokens_update_policy" ON public.extension_pairing_tokens;
CREATE POLICY "extension_tokens_update_policy"
  ON public.extension_pairing_tokens
  FOR UPDATE
  TO authenticated
  USING (
    business_id IN (
      SELECT bm.business_id
      FROM public.business_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT bm.business_id
      FROM public.business_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
