-- =========================================================================
-- CUSTOMER DOCUMENTS HARDENING MIGRATION
-- Adds missing lifecycle and AI processing columns expected by the frontend
-- =========================================================================

-- 1. ADD MISSING COLUMNS TO customer_documents
ALTER TABLE public.customer_documents
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.customer_documents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS ai_processed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- 2. ENFORCE DOCUMENT STATUS INTEGRITY
DO $$
BEGIN
    ALTER TABLE public.customer_documents DROP CONSTRAINT IF EXISTS check_customer_documents_status;
    ALTER TABLE public.customer_documents ADD CONSTRAINT check_customer_documents_status 
        CHECK (status IN ('active', 'superseded', 'archived'));
END $$;

-- 3. TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_customer_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_documents_updated_at ON public.customer_documents;
CREATE TRIGGER trg_customer_documents_updated_at
BEFORE UPDATE ON public.customer_documents
FOR EACH ROW
EXECUTE FUNCTION update_customer_documents_updated_at();

-- 4. CREATE HELPFUL INDEXES
CREATE INDEX IF NOT EXISTS idx_customer_documents_status ON public.customer_documents(status);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON public.customer_documents(customer_id);
