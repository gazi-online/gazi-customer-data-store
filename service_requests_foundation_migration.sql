-- ==============================================================================
-- MILESTONE 10 PHASE 1: SERVICE REQUEST FOUNDATION MIGRATION
-- Evolutionary, upgrade-safe schema extending public.customer_services into the
-- canonical Customer Service Request / Order tracking record.
-- DO NOT EXECUTE AUTOMATICALLY - Awaiting user SQL review.
-- ==============================================================================

-- ==============================================================================
-- 1. CONCURRENCY-SAFE SERVICE REQUEST NUMBER GENERATOR
-- ==============================================================================

CREATE SEQUENCE IF NOT EXISTS public.service_request_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION public.generate_service_request_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN 'SR-' || TO_CHAR(timezone('utc', now()), 'YYYY') || '-' || LPAD(nextval('public.service_request_number_seq')::text, 6, '0');
END;
$$;

-- Disallow arbitrary direct invocation by client roles; only DB triggers/functions execute this
REVOKE ALL ON FUNCTION public.generate_service_request_number() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 2. EXTEND public.customer_services WITH REQUEST TRACKING FIELDS
-- ==============================================================================

ALTER TABLE public.customer_services
  ADD COLUMN IF NOT EXISTS request_number TEXT,
  ADD COLUMN IF NOT EXISTS application_reference TEXT,
  ADD COLUMN IF NOT EXISTS portal_name TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Trigger to manage request_number:
-- 1. On INSERT: ALWAYS assigns DB-generated request number (client cannot override).
-- 2. On UPDATE: Prevents mutating an already assigned request_number (immutable).
-- 3. Historical rows with NULL request_number remain untouched until Phase 2 backfill.
CREATE OR REPLACE FUNCTION public.trg_func_manage_service_request_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- DB-generated for every new row; client cannot forge or override
    NEW.request_number := public.generate_service_request_number();
  ELSIF TG_OP = 'UPDATE' THEN
    -- Immutable once assigned
    IF OLD.request_number IS NOT NULL AND NEW.request_number IS DISTINCT FROM OLD.request_number THEN
      RAISE EXCEPTION 'request_number is immutable once assigned (attempted change from % to %)',
        OLD.request_number, NEW.request_number;
    END IF;
    -- If legacy row had NULL request_number, preserve NULL
    IF OLD.request_number IS NULL AND NEW.request_number IS NOT NULL THEN
      NEW.request_number := OLD.request_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_manage_service_request_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_service_request_number ON public.customer_services;
DROP TRIGGER IF EXISTS trg_manage_service_request_number ON public.customer_services;
CREATE TRIGGER trg_manage_service_request_number
BEFORE INSERT OR UPDATE ON public.customer_services
FOR EACH ROW
EXECUTE FUNCTION public.trg_func_manage_service_request_number();

-- ==============================================================================
-- 3. CHECK CONSTRAINTS (IDEMPOTENT & BACKWARD-COMPATIBLE)
-- ==============================================================================

DO $$
BEGIN
  -- 3.1 Priority Constraint
  ALTER TABLE public.customer_services DROP CONSTRAINT IF EXISTS check_customer_services_priority;
  ALTER TABLE public.customer_services ADD CONSTRAINT check_customer_services_priority
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

  -- 3.2 Request Number Uniqueness (Unique Constraint)
  BEGIN
    ALTER TABLE public.customer_services DROP CONSTRAINT IF EXISTS customer_services_request_number_key;
    ALTER TABLE public.customer_services ADD CONSTRAINT customer_services_request_number_key UNIQUE (request_number);
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Skipping UNIQUE constraint on request_number due to duplicate values.';
  END;

  -- 3.3 Status Constraint:
  -- The existing customer_services status check constraint remains completely UNTOUCHED
  -- in Phase 1 (retaining 'pending', 'in_progress', 'completed', 'cancelled', 'archived').
  -- Expanded request workflow states and DB-level transition validation will be introduced
  -- together in Phase 2 alongside the full transition matrix.
END $$;

-- ==============================================================================
-- 4. SERVICE REQUEST DOCUMENTS JUNCTION TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.service_request_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_service_id UUID NOT NULL REFERENCES public.customer_services(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.customer_documents(id) ON DELETE RESTRICT,
  requirement_tag TEXT NOT NULL DEFAULT 'general',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT unq_service_request_document_tag UNIQUE(customer_service_id, document_id, requirement_tag)
);

-- Database-level check enforcing:
-- 1. Document belongs to the SAME customer as the service request (cross-customer rejected).
-- 2. Document is NOT archived / soft-deleted (status <> 'archived' AND archived_at IS NULL).
-- Historical links remain valid if document is later archived because check fires on INSERT/UPDATE of attachment.
CREATE OR REPLACE FUNCTION public.check_service_request_document_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req_customer_id UUID;
  v_doc_customer_id UUID;
  v_doc_status TEXT;
  v_doc_archived_at TIMESTAMPTZ;
BEGIN
  -- 1. Validate service request exists and retrieve customer_id
  SELECT customer_id INTO v_req_customer_id
  FROM public.customer_services
  WHERE id = NEW.customer_service_id;

  IF NOT FOUND OR v_req_customer_id IS NULL THEN
    RAISE EXCEPTION 'Referenced customer_service (id: %) does not exist.', NEW.customer_service_id;
  END IF;

  -- 2. Validate customer document exists and retrieve metadata
  SELECT customer_id, status, archived_at
  INTO v_doc_customer_id, v_doc_status, v_doc_archived_at
  FROM public.customer_documents
  WHERE id = NEW.document_id;

  IF NOT FOUND OR v_doc_customer_id IS NULL THEN
    RAISE EXCEPTION 'Referenced customer_document (id: %) does not exist.', NEW.document_id;
  END IF;

  -- 3. Reject archived/soft-deleted documents (status = 'archived' OR archived_at IS NOT NULL)
  IF v_doc_status = 'archived' OR v_doc_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot attach archived document (id: %): document status is %, archived_at is %.',
      NEW.document_id, v_doc_status, v_doc_archived_at;
  END IF;

  -- 4. Enforce same-customer ownership
  IF v_req_customer_id != v_doc_customer_id THEN
    RAISE EXCEPTION 'Customer integrity mismatch: Document customer (%) does not match service request customer (%). Cross-customer document attachment is forbidden.',
      v_doc_customer_id, v_req_customer_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_service_request_document_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_verify_service_request_doc_customer ON public.service_request_documents;
DROP TRIGGER IF EXISTS trg_verify_service_request_doc_integrity ON public.service_request_documents;
CREATE TRIGGER trg_verify_service_request_doc_integrity
BEFORE INSERT OR UPDATE ON public.service_request_documents
FOR EACH ROW
EXECUTE FUNCTION public.check_service_request_document_integrity();

-- ==============================================================================
-- 5. SERVICE REQUEST STATUS HISTORY (ATOMIC TRIGGER-OWNED AUDIT)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.service_request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_service_id UUID NOT NULL REFERENCES public.customer_services(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- Database-level trigger automatically recording status transitions atomically.
-- Guarantees from_status = OLD.status, to_status = NEW.status in the same transaction.
-- Clients cannot forge history records.
CREATE OR REPLACE FUNCTION public.trg_func_record_service_request_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed_by UUID;
BEGIN
  -- Record history only when status actually changes
  IF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      v_changed_by := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      v_changed_by := NULL;
    END;

    INSERT INTO public.service_request_status_history (
      customer_service_id,
      from_status,
      to_status,
      notes,
      changed_by,
      created_at
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NULL,
      v_changed_by,
      timezone('utc', now())
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_record_service_request_status_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_service_request_status_history ON public.customer_services;
CREATE TRIGGER trg_record_service_request_status_history
AFTER UPDATE OF status ON public.customer_services
FOR EACH ROW
EXECUTE FUNCTION public.trg_func_record_service_request_status_history();

-- ==============================================================================
-- 6. INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_customer_services_request_number ON public.customer_services(request_number);
CREATE INDEX IF NOT EXISTS idx_customer_services_app_ref ON public.customer_services(application_reference);
CREATE INDEX IF NOT EXISTS idx_customer_services_priority ON public.customer_services(priority);

CREATE INDEX IF NOT EXISTS idx_srd_customer_service_id ON public.service_request_documents(customer_service_id);
CREATE INDEX IF NOT EXISTS idx_srd_document_id ON public.service_request_documents(document_id);

CREATE INDEX IF NOT EXISTS idx_srsh_customer_service_id ON public.service_request_status_history(customer_service_id);
CREATE INDEX IF NOT EXISTS idx_srsh_created_at ON public.service_request_status_history(created_at DESC);

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.service_request_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_status_history ENABLE ROW LEVEL SECURITY;

-- service_request_documents: Authenticated staff operations (idempotent policy definitions)
DROP POLICY IF EXISTS "Authenticated users can view service_request_documents" ON public.service_request_documents;
CREATE POLICY "Authenticated users can view service_request_documents"
  ON public.service_request_documents FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert service_request_documents" ON public.service_request_documents;
CREATE POLICY "Authenticated users can insert service_request_documents"
  ON public.service_request_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update service_request_documents" ON public.service_request_documents;
CREATE POLICY "Authenticated users can update service_request_documents"
  ON public.service_request_documents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete service_request_documents" ON public.service_request_documents;
CREATE POLICY "Authenticated users can delete service_request_documents"
  ON public.service_request_documents FOR DELETE
  TO authenticated
  USING (true);

-- service_request_status_history: Read-only for authenticated users.
-- Direct INSERT, UPDATE, DELETE by clients is NOT permitted.
-- Only the database trigger trg_record_service_request_status_history (SECURITY DEFINER) writes history.
DROP POLICY IF EXISTS "Authenticated users can view service_request_status_history" ON public.service_request_status_history;
CREATE POLICY "Authenticated users can view service_request_status_history"
  ON public.service_request_status_history FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert service_request_status_history" ON public.service_request_status_history;
DROP POLICY IF EXISTS "Authenticated users can update service_request_status_history" ON public.service_request_status_history;
DROP POLICY IF EXISTS "Authenticated users can delete service_request_status_history" ON public.service_request_status_history;
