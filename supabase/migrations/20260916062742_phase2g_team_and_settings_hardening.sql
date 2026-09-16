-- ==============================================================================
-- PHASE 2G: TEAM & BUSINESS SETTINGS RLS HARDENING
-- File: supabase/migrations/20260916064500_phase2g_team_and_settings_hardening.sql
-- ==============================================================================

-- Allow active business members to see other members of their same business
DROP POLICY IF EXISTS "business_memberships_same_business_select" ON public.business_memberships;
CREATE POLICY "business_memberships_same_business_select"
  ON public.business_memberships
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_memberships self
      WHERE self.business_id = business_memberships.business_id
        AND self.user_id = auth.uid()
        AND self.status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';
