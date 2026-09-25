DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conrelid = 'public.customer_documents'::regclass
          AND c.conname = 'chk_customer_documents_side'
    ) THEN
        ALTER TABLE public.customer_documents
        ADD CONSTRAINT chk_customer_documents_side
        CHECK (
            side IS NULL
            OR side IN ('front', 'back', 'both', 'single', 'na')
        );
    END IF;
END $$;;
