-- ==============================================================================
-- MILESTONE 10 PHASE 1: SERVICE REQUEST DOCUMENT INTEGRITY HOTFIX
-- Hotfix for public.check_service_request_document_integrity()
-- Aligns document archival check with live customer_documents schema (status, archived_at)
-- and hardens missing-row handling.
-- ==============================================================================

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

-- Ensure execute privilege is restricted (triggers execute with definer permissions)
REVOKE ALL ON FUNCTION public.check_service_request_document_integrity() FROM PUBLIC, anon, authenticated;
