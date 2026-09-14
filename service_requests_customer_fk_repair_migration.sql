-- Migration: Service Requests Customer Foreign Key Repair
-- File: service_requests_customer_fk_repair_migration.sql
-- Purpose: Add missing foreign key constraint on public.customer_services(customer_id) referencing public.customers(id) ON DELETE CASCADE

DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    -- 1. Table-scoped idempotency check: exit early if constraint already exists on public.customer_services
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.customer_services'::regclass
          AND conname = 'customer_services_customer_id_fkey'
    ) THEN
        RAISE NOTICE 'Constraint customer_services_customer_id_fkey already exists on public.customer_services. Skipping addition.';
    ELSE
        -- 2. Defensive orphan customer reference check before schema mutation
        SELECT COUNT(*)
        INTO orphan_count
        FROM public.customer_services cs
        LEFT JOIN public.customers c ON c.id = cs.customer_id
        WHERE c.id IS NULL AND cs.customer_id IS NOT NULL;

        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add foreign key customer_services_customer_id_fkey: found % orphan customer reference(s) in public.customer_services', orphan_count;
        END IF;

        -- 3. Add exactly the intended canonical foreign key constraint
        ALTER TABLE public.customer_services
            ADD CONSTRAINT customer_services_customer_id_fkey
            FOREIGN KEY (customer_id)
            REFERENCES public.customers(id)
            ON DELETE CASCADE;

        RAISE NOTICE 'Successfully added constraint customer_services_customer_id_fkey to public.customer_services.';
    END IF;
END $$;

-- 4. Reload PostgREST schema cache to immediately expose relationship
NOTIFY pgrst, 'reload schema';
