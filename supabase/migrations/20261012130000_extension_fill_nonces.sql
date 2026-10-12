-- ==============================================================================
-- GCDS SECURE EXTENSION API — PERSISTENT SINGLE-USE NONCE TRACKING
-- File: supabase/migrations/20261012130000_extension_fill_nonces.sql
--
-- DRAFT MIGRATION: Prepared for production deployment upon explicit operator approval.
-- Note: The application logic contains a zero-migration fallback that utilizes
-- the unique constraint on extension_pairing_tokens until this migration is applied.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.extension_fill_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce_hash TEXT NOT NULL UNIQUE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extension_fill_nonces_hash
  ON public.extension_fill_nonces (nonce_hash);

CREATE INDEX IF NOT EXISTS idx_extension_fill_nonces_expiry
  ON public.extension_fill_nonces (expires_at);

ALTER TABLE public.extension_fill_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extension_fill_nonces_tenant_policy" ON public.extension_fill_nonces;
CREATE POLICY "extension_fill_nonces_tenant_policy"
  ON public.extension_fill_nonces
  FOR ALL
  TO authenticated
  USING (
    business_id IN (
      SELECT bm.business_id
      FROM public.business_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );
