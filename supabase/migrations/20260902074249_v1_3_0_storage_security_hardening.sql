-- ==============================================================================
-- GCDS v1.3.0 STORAGE SECURITY HARDENING MIGRATION
-- File: v1_3_0_storage_security_hardening.sql
-- Description:
--   1. Prerequisite Guard: Verifies shared-business tenancy is present.
--   2. Leaves customer-profiles untouched as quarantined legacy customer-photo storage.
--   3. Ensures private 'customer_documents' bucket exists with strict size/mime limits.
--   4. Ensures private 'customer_photos' bucket exists with strict size/mime limits.
--   5. Drops ALL legacy permissive bucket-wide policies.
--   6. Installs strict shared-business policies:
--      - customer_documents: Enforces path 'customers/{customerId}/...' and active
--        business membership. storage.owner/owner_id are audit metadata, not a tenant boundary.
--      - customer_photos: Shared-business customer storage at customers/{customerId}/...
--      - customer-profiles: Legacy quarantined customer-photo storage.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. PREREQUISITE GUARD: CUSTOMER OWNERSHIP FOUNDATION
-- Must verify the business tenancy columns/tables exist before configuring policies.
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'customers' 
      AND column_name = 'business_id'
  ) THEN
    RAISE EXCEPTION 'Storage hardening aborted: customers.business_id is required.';
  END IF;
END $$;

-- ==============================================================================
-- 2. LEGACY QUARANTINE
-- The 39 unreferenced customer-profiles objects have no cleanup authorization.
-- This migration neither modifies nor deletes legacy objects.
-- ==============================================================================
-- Intentionally no mutation of storage.objects WHERE bucket_id = 'customer-profiles'.

-- ==============================================================================
-- 3. CANONICAL BUCKET: customer_documents (10MB, Private, Restricted MIME)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer_documents',
  'customer_documents',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- ==============================================================================
-- 4. CUSTOMER PHOTO BUCKET: customer_photos (5MiB, private, images only)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer_photos',
  'customer_photos',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ==============================================================================
-- 5. LEGACY POLICY TEARDOWN (ELIMINATES PERMISSIVE OR-BYPASS RISKS)
-- ==============================================================================

-- Drop legacy / broad policies on customer-profiles
DROP POLICY IF EXISTS "Allow authenticated users to read profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to insert profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to modify profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete profile photos" ON storage.objects;
DROP POLICY IF EXISTS "customer_profiles_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "customer_profiles_tenant_select" ON storage.objects;
DROP POLICY IF EXISTS "customer_profiles_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "customer_profiles_tenant_delete" ON storage.objects;

-- Drop legacy / broad policies on customer_documents
DROP POLICY IF EXISTS "Authenticated users can upload to customer_documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read customer_documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update customer_documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete customer_documents" ON storage.objects;
DROP POLICY IF EXISTS "customer_documents_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "customer_documents_tenant_select" ON storage.objects;
DROP POLICY IF EXISTS "customer_documents_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "customer_documents_tenant_delete" ON storage.objects;

-- ==============================================================================
-- 6. TENANT-ISOLATED POLICIES: customer_documents (SHARED BUSINESS MEMBERSHIP)
-- Path Contract: customers/{customerId}/{uuid}-{sanitizedOriginalFilename}
-- ==============================================================================

-- INSERT: Authenticated member of the customer's business uploading to an active customer
CREATE POLICY "customer_documents_tenant_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'customer_documents'
    AND (storage.foldername(name))[1] = 'customers'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships m ON m.business_id = c.business_id
      WHERE c.id::text = (storage.foldername(name))[2]
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND c.deleted_at IS NULL
    )
  );

-- SELECT: Authenticated member of the customer's business reading customer documents (allows coworker access)
CREATE POLICY "customer_documents_tenant_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'customer_documents'
    AND (storage.foldername(name))[1] = 'customers'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships m ON m.business_id = c.business_id
      WHERE c.id::text = (storage.foldername(name))[2]
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- UPDATE: Protects against cross-tenant update and relocation
CREATE POLICY "customer_documents_tenant_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'customer_documents'
    AND (storage.foldername(name))[1] = 'customers'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships m ON m.business_id = c.business_id
      WHERE c.id::text = (storage.foldername(name))[2]
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    bucket_id = 'customer_documents'
    AND (storage.foldername(name))[1] = 'customers'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships m ON m.business_id = c.business_id
      WHERE c.id::text = (storage.foldername(name))[2]
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND c.deleted_at IS NULL
    )
  );

-- DELETE: Authenticated active business member deleting an object of a business customer
CREATE POLICY "customer_documents_tenant_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'customer_documents'
    AND (storage.foldername(name))[1] = 'customers'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships m ON m.business_id = c.business_id
      WHERE c.id::text = (storage.foldername(name))[2]
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- ==============================================================================
-- 7. NARROW LEGACY READ COMPATIBILITY
-- Only a path already persisted on an authorized customer may be signed/read.
-- No INSERT/UPDATE/DELETE policy is restored for customer-profiles.
CREATE POLICY "customer_profiles_legacy_customer_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-profiles'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.business_memberships m ON m.business_id = c.business_id
      WHERE c.photo_source = storage.objects.name
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- 8. BUSINESS-MEMBERSHIP POLICIES: customer_photos
-- Path Contract: customers/{customerId}/{randomUuid}.{validatedExtension}
-- ==============================================================================

CREATE POLICY "customer_photos_business_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'customer_photos'
    AND (storage.foldername(name))[1] = 'customers'
    AND array_length(storage.foldername(name), 1) = 2
    AND EXISTS (SELECT 1 FROM public.customers c JOIN public.business_memberships m ON m.business_id=c.business_id
      WHERE c.id::text=(storage.foldername(name))[2] AND c.deleted_at IS NULL AND m.user_id=auth.uid() AND m.status='active')
  );

CREATE POLICY "customer_photos_business_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'customer_photos'
    AND (storage.foldername(name))[1] = 'customers'
    AND array_length(storage.foldername(name), 1) = 2
    AND EXISTS (SELECT 1 FROM public.customers c JOIN public.business_memberships m ON m.business_id=c.business_id
      WHERE c.id::text=(storage.foldername(name))[2] AND m.user_id=auth.uid() AND m.status='active')
  );

CREATE POLICY "customer_photos_business_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'customer_photos' AND (storage.foldername(name))[1] = 'customers'
    AND array_length(storage.foldername(name), 1) = 2
    AND EXISTS (SELECT 1 FROM public.customers c JOIN public.business_memberships m ON m.business_id=c.business_id
      WHERE c.id::text=(storage.foldername(name))[2] AND m.user_id=auth.uid() AND m.status='active')
  )
  WITH CHECK (
    bucket_id = 'customer_photos' AND (storage.foldername(name))[1] = 'customers'
    AND array_length(storage.foldername(name), 1) = 2
    AND EXISTS (SELECT 1 FROM public.customers c JOIN public.business_memberships m ON m.business_id=c.business_id
      WHERE c.id::text=(storage.foldername(name))[2] AND c.deleted_at IS NULL AND m.user_id=auth.uid() AND m.status='active')
  );

CREATE POLICY "customer_photos_business_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'customer_photos' AND (storage.foldername(name))[1] = 'customers'
    AND array_length(storage.foldername(name), 1) = 2
    AND EXISTS (SELECT 1 FROM public.customers c JOIN public.business_memberships m ON m.business_id=c.business_id
      WHERE c.id::text=(storage.foldername(name))[2] AND m.user_id=auth.uid() AND m.status='active')
  );

COMMIT;
;
