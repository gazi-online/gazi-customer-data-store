-- ==============================================================================
-- PHASE 2E: CUSTOMER COMMUNICATIONS & REMINDER CENTER
-- File: supabase/migrations/20260916063000_phase2e_customer_communications.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.customer_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_service_id UUID NULL REFERENCES public.customer_services(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'phone', 'sms', 'email', 'in_person', 'other')),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  template_key TEXT NULL,
  message_snapshot TEXT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('contacted', 'no_answer', 'will_visit', 'docs_awaited', 'resolved', 'note_added', 'other')),
  notes TEXT NULL,
  communicated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_comm_customer_id
  ON public.customer_communications(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_comm_service_id
  ON public.customer_communications(customer_service_id)
  WHERE customer_service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_comm_communicated_at
  ON public.customer_communications(communicated_at DESC);

-- Integrity trigger
CREATE OR REPLACE FUNCTION public.check_customer_communication_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_service_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_services
      WHERE id = NEW.customer_service_id AND customer_id = NEW.customer_id
    ) THEN
      RAISE EXCEPTION 'customer_service_id does not belong to specified customer' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_communication_integrity ON public.customer_communications;
CREATE TRIGGER trg_customer_communication_integrity
  BEFORE INSERT OR UPDATE ON public.customer_communications
  FOR EACH ROW
  EXECUTE FUNCTION public.check_customer_communication_integrity();

-- RLS
ALTER TABLE public.customer_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_communications_tenant_select" ON public.customer_communications;
CREATE POLICY "customer_communications_tenant_select"
  ON public.customer_communications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_communications.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "customer_communications_tenant_insert" ON public.customer_communications;
CREATE POLICY "customer_communications_tenant_insert"
  ON public.customer_communications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_communications.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "customer_communications_tenant_update" ON public.customer_communications;
CREATE POLICY "customer_communications_tenant_update"
  ON public.customer_communications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_communications.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_communications.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- No DELETE policy (hard deletions prohibited)
DROP POLICY IF EXISTS "customer_communications_tenant_delete" ON public.customer_communications;

-- Least-Privilege Table Grants
REVOKE ALL ON public.customer_communications FROM anon;
REVOKE DELETE ON public.customer_communications FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_communications TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
