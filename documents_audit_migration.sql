-- Phase 7: Documents Audit Trail Migration

-- 1. Add audit columns to customer_documents table
ALTER TABLE public.customer_documents 
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS side text DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS source_filename text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.customer_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL;

-- Index for fast lookup by customer_id and status
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_status ON public.customer_documents(customer_id, status);

-- 2. Add audit fields to ai_import_history table
ALTER TABLE public.ai_import_history
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cache_hit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_source_type text DEFAULT 'manual';

-- Index for lookup of AI imports by customer_id
CREATE INDEX IF NOT EXISTS idx_ai_import_history_customer_id ON public.ai_import_history(customer_id);

-- 3. RLS Update for customer_documents
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update own customer_documents" ON public.customer_documents;
CREATE POLICY "Users can update own customer_documents"
  ON public.customer_documents
  FOR UPDATE
  USING (auth.uid() = created_by OR created_by IS NULL);
