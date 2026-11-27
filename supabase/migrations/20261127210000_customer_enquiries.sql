-- ==============================================================================
-- CUSTOMER ENQUIRIES & FOLLOW-UP TRACKING
-- File: supabase/migrations/20261127210000_customer_enquiries.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.customer_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  enquiry_number TEXT NOT NULL,
  customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NULL,
  service_id UUID NULL REFERENCES public.services(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  details TEXT NULL,
  source TEXT NOT NULL DEFAULT 'walk_in' CHECK (source IN ('walk_in', 'phone', 'whatsapp', 'referral', 'other')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'follow_up', 'quoted', 'converted', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  quoted_amount NUMERIC(12,2) NULL,
  follow_up_at TIMESTAMPTZ NULL,
  last_update_note TEXT NULL,
  converted_request_id UUID NULL REFERENCES public.customer_services(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enquiry_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.customer_enquiries(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  update_type TEXT NOT NULL CHECK (update_type IN ('created', 'note', 'status_change', 'follow_up', 'whatsapp_sent', 'converted')),
  previous_status TEXT NULL,
  new_status TEXT NULL,
  note TEXT NOT NULL,
  follow_up_at TIMESTAMPTZ NULL,
  whatsapp_sent BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_enquiries_business_id
  ON public.customer_enquiries(business_id);

CREATE INDEX IF NOT EXISTS idx_customer_enquiries_status
  ON public.customer_enquiries(business_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_enquiries_follow_up_at
  ON public.customer_enquiries(business_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_enquiries_created_at
  ON public.customer_enquiries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enquiry_updates_enquiry_id
  ON public.enquiry_updates(enquiry_id, created_at DESC);

-- RLS for customer_enquiries
ALTER TABLE public.customer_enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_enquiries_tenant_select" ON public.customer_enquiries;
CREATE POLICY "customer_enquiries_tenant_select"
  ON public.customer_enquiries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = customer_enquiries.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "customer_enquiries_tenant_insert" ON public.customer_enquiries;
CREATE POLICY "customer_enquiries_tenant_insert"
  ON public.customer_enquiries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = customer_enquiries.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "customer_enquiries_tenant_update" ON public.customer_enquiries;
CREATE POLICY "customer_enquiries_tenant_update"
  ON public.customer_enquiries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = customer_enquiries.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = customer_enquiries.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- RLS for enquiry_updates
ALTER TABLE public.enquiry_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enquiry_updates_tenant_select" ON public.enquiry_updates;
CREATE POLICY "enquiry_updates_tenant_select"
  ON public.enquiry_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = enquiry_updates.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "enquiry_updates_tenant_insert" ON public.enquiry_updates;
CREATE POLICY "enquiry_updates_tenant_insert"
  ON public.enquiry_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = enquiry_updates.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- Least-Privilege Table Grants
REVOKE ALL ON public.customer_enquiries FROM anon;
REVOKE DELETE ON public.customer_enquiries FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_enquiries TO authenticated, service_role;

REVOKE ALL ON public.enquiry_updates FROM anon;
REVOKE DELETE ON public.enquiry_updates FROM authenticated;
GRANT SELECT, INSERT ON public.enquiry_updates TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
