-- Phase 8: Services Module Migration - HARDENED FOR EXISTING DBS

-- =========================================================================
-- 1. TABLE CREATION (For Fresh Installs)
-- =========================================================================

-- Create services table (bare minimum to satisfy IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT NOT NULL
);

-- Create customer_services table (bare minimum)
CREATE TABLE IF NOT EXISTS public.customer_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE RESTRICT
);

-- =========================================================================
-- 2. ALTER TABLES TO ADD MISSING COLUMNS
-- =========================================================================

ALTER TABLE public.services 
    ADD COLUMN IF NOT EXISTS service_code TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS default_price NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.customer_services 
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
    ADD COLUMN IF NOT EXISTS service_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS due_date DATE,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- =========================================================================
-- 3. LEGACY DATA MIGRATION (PRICE -> DEFAULT_PRICE)
-- =========================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='services' AND column_name='price'
    ) THEN
        EXECUTE 'UPDATE public.services SET default_price = price WHERE (default_price IS NULL OR default_price = 0) AND price IS NOT NULL';
    END IF;
END $$;

-- Fix nulls in service_code if any, to avoid constraint issues
UPDATE public.services SET service_code = 'GEN-' || substr(md5(random()::text), 1, 6) WHERE service_code IS NULL;

-- =========================================================================
-- 4. CONSTRAINTS
-- =========================================================================

DO $$
BEGIN
    -- Drop existing constraints to be idempotent
    ALTER TABLE public.services DROP CONSTRAINT IF EXISTS check_services_default_price;
    ALTER TABLE public.services DROP CONSTRAINT IF EXISTS check_services_status;
    ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_service_code_key;
    
    ALTER TABLE public.customer_services DROP CONSTRAINT IF EXISTS check_customer_services_amount;
    ALTER TABLE public.customer_services DROP CONSTRAINT IF EXISTS check_customer_services_status;
    ALTER TABLE public.customer_services DROP CONSTRAINT IF EXISTS check_customer_services_payment_status;

    -- Add Check Constraints
    ALTER TABLE public.services ADD CONSTRAINT check_services_default_price CHECK (default_price >= 0);
    ALTER TABLE public.services ADD CONSTRAINT check_services_status CHECK (status IN ('active', 'inactive'));
    
    ALTER TABLE public.customer_services ADD CONSTRAINT check_customer_services_amount CHECK (amount >= 0);
    ALTER TABLE public.customer_services ADD CONSTRAINT check_customer_services_status CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'archived'));
    ALTER TABLE public.customer_services ADD CONSTRAINT check_customer_services_payment_status CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'waived'));

    -- Add Unique Constraint for service_code
    BEGIN
        ALTER TABLE public.services ADD CONSTRAINT services_service_code_key UNIQUE (service_code);
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'Skipping UNIQUE constraint on service_code due to existing duplicates. Please resolve manually.';
    END;
END $$;


-- =========================================================================
-- 5. TRIGGERS FOR UPDATED_AT
-- =========================================================================

CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_services_updated_at ON public.services;
CREATE TRIGGER trg_services_updated_at
BEFORE UPDATE ON public.services
FOR EACH ROW
EXECUTE FUNCTION update_services_updated_at();

CREATE OR REPLACE FUNCTION update_customer_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_services_updated_at ON public.customer_services;
CREATE TRIGGER trg_customer_services_updated_at
BEFORE UPDATE ON public.customer_services
FOR EACH ROW
EXECUTE FUNCTION update_customer_services_updated_at();

-- =========================================================================
-- 6. INDEXES
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_customer_services_customer_id ON public.customer_services(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_services_status ON public.customer_services(status);
CREATE INDEX IF NOT EXISTS idx_services_status ON public.services(status);

-- =========================================================================
-- 7. RLS POLICIES
-- =========================================================================

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view services" ON public.services;
CREATE POLICY "Authenticated users can view services"
ON public.services FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert services" ON public.services;
CREATE POLICY "Authenticated users can insert services"
ON public.services FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update services" ON public.services;
CREATE POLICY "Authenticated users can update services"
ON public.services FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);


ALTER TABLE public.customer_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view customer_services" ON public.customer_services;
CREATE POLICY "Authenticated users can view customer_services"
ON public.customer_services FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert customer_services" ON public.customer_services;
CREATE POLICY "Authenticated users can insert customer_services"
ON public.customer_services FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update customer_services" ON public.customer_services;
CREATE POLICY "Authenticated users can update customer_services"
ON public.customer_services FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
