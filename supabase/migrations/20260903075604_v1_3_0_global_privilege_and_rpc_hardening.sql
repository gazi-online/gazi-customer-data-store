-- ==============================================================================
-- GCDS v1.3.0 GLOBAL PRIVILEGE & RPC HARDENING MIGRATION
-- File: v1_3_0_global_privilege_and_rpc_hardening.sql
-- Description:
--   1. Revokes dangerous table privileges (TRUNCATE, REFERENCES, TRIGGER) on all
--      public application tables from anon and authenticated roles.
--   2. Preserves existing row-level CRUD permissions (SELECT, INSERT, UPDATE, DELETE)
--      on active application tables.
--   3. Enforces intentional deny-all posture on unused tables (activity_logs, profiles,
--      settings) by revoking ALL privileges from anon and authenticated.
--   4. Hardens PostgreSQL default privileges for role postgres in schema public:
--      - Future tables do NOT receive TRUNCATE, REFERENCES, TRIGGER.
--      - Future functions do NOT receive automatic EXECUTE from PUBLIC, anon, or authenticated.
--   5. Revokes EXECUTE on cleanup_expired_ai_cache() from PUBLIC, anon, and authenticated.
--   6. Hardens trigger functions with fixed search_path = '' as SECURITY INVOKER.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. REVOKE DANGEROUS PRIVILEGES (TRUNCATE, REFERENCES, TRIGGER) FROM CURRENT TABLES
-- ==============================================================================

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customers FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.businesses FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.business_memberships FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customer_services FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.services FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.invoices FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.invoice_items FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payments FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payment_allocations FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_import_history FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_extraction_cache FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.activity_logs FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.settings FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.business_settings FROM anon, authenticated;

-- ==============================================================================
-- 2. ENFORCE INTENTIONAL DENY-ALL POSTURE ON UNUSED TABLES
-- ==============================================================================

REVOKE ALL ON TABLE
  public.activity_logs,
  public.profiles,
  public.settings
FROM anon, authenticated;

-- ==============================================================================
-- 3. HARDEN DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
-- ==============================================================================

-- Ensure future tables created by role postgres do NOT grant TRUNCATE, REFERENCES, TRIGGER
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON TABLES
FROM anon, authenticated;

-- Ensure future functions created by role postgres do NOT grant automatic EXECUTE to public/clients
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 4. REVOKE EXECUTE ON UNUSED RPC (cleanup_expired_ai_cache)
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_ai_cache() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 5. HARDEN MUTABLE SEARCH_PATH TRIGGER FUNCTIONS (SECURITY INVOKER, search_path = '')
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_services_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_customer_services_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_customer_business_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'Customer business_id is immutable and cannot be reassigned.';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
;
