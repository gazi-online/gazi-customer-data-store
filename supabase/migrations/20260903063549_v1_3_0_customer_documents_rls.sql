BEGIN;

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_documents FROM anon;
REVOKE ALL ON public.customer_documents FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_customer_document_created_by_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'customer_documents.created_by is immutable and cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_documents_created_by_immutable ON public.customer_documents;

CREATE TRIGGER customer_documents_created_by_immutable
BEFORE UPDATE ON public.customer_documents
FOR EACH ROW
EXECUTE FUNCTION public.enforce_customer_document_created_by_immutable();

DROP POLICY IF EXISTS customer_documents_tenant_select ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_tenant_insert ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_tenant_update ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_tenant_delete ON public.customer_documents;

CREATE POLICY customer_documents_tenant_select
ON public.customer_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = customer_documents.customer_id
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
);

CREATE POLICY customer_documents_tenant_insert
ON public.customer_documents
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = customer_documents.customer_id
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
);

CREATE POLICY customer_documents_tenant_update
ON public.customer_documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = customer_documents.customer_id
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = customer_documents.customer_id
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
);

CREATE POLICY customer_documents_tenant_delete
ON public.customer_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE c.id = customer_documents.customer_id
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
);

COMMIT;;
