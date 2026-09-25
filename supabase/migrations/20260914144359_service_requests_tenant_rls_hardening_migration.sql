-- Migration: Service Requests Tenant RLS Hardening
-- File: service_requests_tenant_rls_hardening_migration.sql
-- Purpose: Harden RLS on customer_services, service_request_documents, and service_request_status_history
--          to enforce strict multi-tenant isolation via business_memberships.

-- ============================================================================
-- 1. public.customer_services
-- ============================================================================
ALTER TABLE public.customer_services ENABLE ROW LEVEL SECURITY;

-- Drop legacy broad policies
DROP POLICY IF EXISTS "Authenticated users can view customer_services" ON public.customer_services;
DROP POLICY IF EXISTS "Authenticated users can insert customer_services" ON public.customer_services;
DROP POLICY IF EXISTS "Authenticated users can update customer_services" ON public.customer_services;
DROP POLICY IF EXISTS "customer_services_tenant_select" ON public.customer_services;
DROP POLICY IF EXISTS "customer_services_tenant_insert" ON public.customer_services;
DROP POLICY IF EXISTS "customer_services_tenant_update" ON public.customer_services;

-- Canonical tenant-isolated policies (access derived via customer's business membership)
CREATE POLICY "customer_services_tenant_select"
  ON public.customer_services
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_services.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "customer_services_tenant_insert"
  ON public.customer_services
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_services.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "customer_services_tenant_update"
  ON public.customer_services
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_services.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE c.id = customer_services.customer_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- NOTE: NO DELETE policy is created for customer_services (preserves existing design - deletion is not permitted).


-- ============================================================================
-- 2. public.service_request_documents
-- ============================================================================
ALTER TABLE public.service_request_documents ENABLE ROW LEVEL SECURITY;

-- Drop legacy broad policies
DROP POLICY IF EXISTS "Authenticated users can view service_request_documents" ON public.service_request_documents;
DROP POLICY IF EXISTS "Authenticated users can insert service_request_documents" ON public.service_request_documents;
DROP POLICY IF EXISTS "Authenticated users can update service_request_documents" ON public.service_request_documents;
DROP POLICY IF EXISTS "Authenticated users can delete service_request_documents" ON public.service_request_documents;
DROP POLICY IF EXISTS "service_request_documents_tenant_select" ON public.service_request_documents;
DROP POLICY IF EXISTS "service_request_documents_tenant_insert" ON public.service_request_documents;
DROP POLICY IF EXISTS "service_request_documents_tenant_update" ON public.service_request_documents;
DROP POLICY IF EXISTS "service_request_documents_tenant_delete" ON public.service_request_documents;

-- Canonical tenant-isolated policies (access derived via service request -> customer -> business_memberships)
CREATE POLICY "service_request_documents_tenant_select"
  ON public.service_request_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_documents.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "service_request_documents_tenant_insert"
  ON public.service_request_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (created_by = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_documents.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "service_request_documents_tenant_update"
  ON public.service_request_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_documents.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_documents.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "service_request_documents_tenant_delete"
  ON public.service_request_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_documents.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );


-- ============================================================================
-- 3. public.service_request_status_history
-- ============================================================================
ALTER TABLE public.service_request_status_history ENABLE ROW LEVEL SECURITY;

-- Drop legacy broad policy
DROP POLICY IF EXISTS "Authenticated users can view service_request_status_history" ON public.service_request_status_history;
DROP POLICY IF EXISTS "service_request_status_history_tenant_select" ON public.service_request_status_history;

-- Canonical tenant-isolated select policy (mutations are trigger-owned only)
CREATE POLICY "service_request_status_history_tenant_select"
  ON public.service_request_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_status_history.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );


-- ============================================================================
-- 4. Reload PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';
;
