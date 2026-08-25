-- ==============================================================================
-- PHASE 5: DOCUMENTS MODULE COMPLETE IDEMPOTENT MIGRATION
-- Database schema, RLS policies, and private Supabase storage policies
-- ==============================================================================

-- 1. EXTEND customer_documents METADATA TABLE
CREATE TABLE IF NOT EXISTS public.customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- Add all production metadata columns safely
ALTER TABLE public.customer_documents
  ADD COLUMN IF NOT EXISTS document_name TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS side TEXT DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS source_filename TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.customer_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_processed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc', now());

-- 2. STATUS INTEGRITY CONSTRAINT
DO $$
BEGIN
  ALTER TABLE public.customer_documents DROP CONSTRAINT IF EXISTS check_customer_documents_status;
  ALTER TABLE public.customer_documents ADD CONSTRAINT check_customer_documents_status 
    CHECK (status IN ('active', 'superseded', 'archived'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.update_customer_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_documents_updated_at ON public.customer_documents;
CREATE TRIGGER trg_customer_documents_updated_at
BEFORE UPDATE ON public.customer_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_customer_documents_updated_at();

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON public.customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_status ON public.customer_documents(status);
CREATE INDEX IF NOT EXISTS idx_customer_documents_document_type ON public.customer_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_customer_documents_uploaded_at ON public.customer_documents(uploaded_at DESC);

-- 5. RLS POLICIES FOR customer_documents TABLE
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view customer_documents" ON public.customer_documents;
CREATE POLICY "Authenticated users can view customer_documents"
  ON public.customer_documents
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert customer_documents" ON public.customer_documents;
CREATE POLICY "Authenticated users can insert customer_documents"
  ON public.customer_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update customer_documents" ON public.customer_documents;
CREATE POLICY "Authenticated users can update customer_documents"
  ON public.customer_documents
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete customer_documents" ON public.customer_documents;
CREATE POLICY "Authenticated users can delete customer_documents"
  ON public.customer_documents
  FOR DELETE
  TO authenticated
  USING (true);

-- 6. PRIVATE STORAGE BUCKET: customer_documents
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

-- 7. STORAGE POLICIES FOR customer_documents BUCKET
DROP POLICY IF EXISTS "Authenticated users can upload to customer_documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload to customer_documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'customer_documents');

DROP POLICY IF EXISTS "Authenticated users can read customer_documents" ON storage.objects;
CREATE POLICY "Authenticated users can read customer_documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'customer_documents');

DROP POLICY IF EXISTS "Authenticated users can update customer_documents" ON storage.objects;
CREATE POLICY "Authenticated users can update customer_documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'customer_documents')
  WITH CHECK (bucket_id = 'customer_documents');

DROP POLICY IF EXISTS "Authenticated users can delete customer_documents" ON storage.objects;
CREATE POLICY "Authenticated users can delete customer_documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'customer_documents');
