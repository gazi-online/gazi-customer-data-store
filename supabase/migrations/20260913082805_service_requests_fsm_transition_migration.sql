-- ==============================================================================
-- MILESTONE 10 PHASE 2A: SERVICE REQUEST WORKFLOW FSM TRANSITION MIGRATION
-- Establishes the database finite-state machine (FSM) for customer_services.
--
-- Features:
-- 1. Status CHECK constraint evolution (10 operational statuses + 2 legacy).
-- 2. Database-enforced initial status ('pending') and lifecycle timestamp reset
--    (completed_at, delivered_at, archived_at = NULL) on all new inserts.
-- 3. BEFORE UPDATE transition validator with strict canonical matrix,
--    lifecycle timestamp DB-ownership, and same-status lifecycle field protection.
-- 4. Lifecycle metadata invariants (completed_at, delivered_at, archived_at,
--    and mandatory non-empty rejection_reason on rejection).
-- 5. Persistent CHECK constraints guarding lifecycle fields from later corruption.
-- 6. Strict execution ordering before AFTER status-history trigger.
--
-- IMPORTANT:
-- This migration is idempotent and maintains full backward compatibility with
-- existing legacy rows (in_progress, archived).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EVOLVE STATUS CHECK CONSTRAINT ON customer_services
-- ------------------------------------------------------------------------------

ALTER TABLE public.customer_services
  DROP CONSTRAINT IF EXISTS check_customer_services_status;

ALTER TABLE public.customer_services
  DROP CONSTRAINT IF EXISTS customer_services_status_check;

ALTER TABLE public.customer_services
  ADD CONSTRAINT check_customer_services_status CHECK (
    status IN (
      -- Operational Workflow
      'pending',
      'documents_pending',
      'ready_to_submit',
      'submitted',
      'in_process',
      'action_required',
      'completed',
      'delivered',
      -- Terminal Outcomes
      'rejected',
      'cancelled',
      -- Legacy Compatibility
      'in_progress',
      'archived'
    )
  );

-- ------------------------------------------------------------------------------
-- 2. DATABASE-ENFORCED INITIAL STATUS & LIFECYCLE RESET ON INSERT
-- Guarantees all new rows begin as 'pending' with NULL lifecycle timestamps
-- regardless of client input.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_func_enforce_service_request_initial_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Always force status to 'pending' on new record creation
  NEW.status := 'pending';
  -- Disallow client-controlled pre-seeded lifecycle timestamps on insert
  NEW.completed_at := NULL;
  NEW.delivered_at := NULL;
  NEW.archived_at := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_func_enforce_service_request_initial_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_service_request_initial_status ON public.customer_services;
CREATE TRIGGER trg_enforce_service_request_initial_status
BEFORE INSERT ON public.customer_services
FOR EACH ROW
EXECUTE FUNCTION public.trg_func_enforce_service_request_initial_status();

-- ------------------------------------------------------------------------------
-- 3. CANONICAL TRANSITION VALIDATOR & LIFECYCLE INVARIANT FUNCTION
-- Fires BEFORE UPDATE on public.customer_services.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_service_request_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_valid BOOLEAN := FALSE;
BEGIN
  -- A. Always begin by preserving DB-owned lifecycle fields:
  -- This guarantees client-supplied lifecycle timestamp values are ignored
  -- regardless of whether status changed.
  NEW.completed_at := OLD.completed_at;
  NEW.delivered_at := OLD.delivered_at;
  NEW.archived_at := OLD.archived_at;

  -- B. If OLD.status IS NOT DISTINCT FROM NEW.status:
  -- Do not run a transition; preserve all DB-owned timestamps; enforce rejection_reason if rejected.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    IF NEW.status = 'rejected' AND (NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason)) = 0) THEN
      RAISE EXCEPTION 'Rejection reason cannot be blanked while status remains rejected.';
    END IF;

    RETURN NEW;
  END IF;

  -- C. Validate against explicit canonical transition matrix when status changed
  CASE OLD.status
    WHEN 'pending' THEN
      v_is_valid := NEW.status IN ('documents_pending', 'ready_to_submit', 'cancelled', 'archived');
    WHEN 'documents_pending' THEN
      v_is_valid := NEW.status IN ('ready_to_submit', 'cancelled');
    WHEN 'ready_to_submit' THEN
      v_is_valid := NEW.status IN ('documents_pending', 'submitted', 'cancelled');
    WHEN 'submitted' THEN
      v_is_valid := NEW.status IN ('in_process', 'action_required', 'rejected');
    WHEN 'in_process' THEN
      v_is_valid := NEW.status IN ('action_required', 'completed', 'rejected');
    WHEN 'action_required' THEN
      v_is_valid := NEW.status IN ('documents_pending', 'ready_to_submit', 'submitted', 'in_process', 'rejected', 'cancelled');
    WHEN 'completed' THEN
      v_is_valid := NEW.status IN ('delivered', 'archived');
    WHEN 'delivered' THEN
      v_is_valid := NEW.status IN ('archived');
    WHEN 'rejected' THEN
      v_is_valid := NEW.status IN ('archived');
    WHEN 'cancelled' THEN
      v_is_valid := NEW.status IN ('archived');
    WHEN 'in_progress' THEN
      -- Legacy in_progress compatibility and one-way normalization into modern pipeline
      v_is_valid := NEW.status IN ('in_process', 'action_required', 'completed', 'rejected', 'cancelled', 'archived');
    WHEN 'archived' THEN
      -- Archived is strictly terminal: no outward transitions permitted
      v_is_valid := FALSE;
    ELSE
      v_is_valid := FALSE;
  END CASE;

  IF NOT v_is_valid THEN
    RAISE EXCEPTION 'Invalid service request status transition from % to %.', OLD.status, NEW.status;
  END IF;

  -- 3. Enforce lifecycle metadata invariants on valid transition
  IF NEW.status = 'completed' THEN
    -- Transition TO completed: DB assigns completed_at (client cannot override)
    NEW.completed_at := timezone('utc', now());
    NEW.delivered_at := NULL;
    NEW.archived_at := NULL;
  ELSIF NEW.status = 'delivered' THEN
    -- Transition TO delivered: preserve valid completed_at, DB assigns delivered_at
    NEW.completed_at := OLD.completed_at;
    NEW.delivered_at := timezone('utc', now());
    NEW.archived_at := NULL;
  ELSIF NEW.status = 'archived' THEN
    -- Transition TO archived: preserve prior completion/delivery timestamps, DB assigns archived_at
    NEW.completed_at := OLD.completed_at;
    NEW.delivered_at := OLD.delivered_at;
    NEW.archived_at := timezone('utc', now());
  ELSIF NEW.status = 'rejected' THEN
    IF NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason)) = 0 THEN
      RAISE EXCEPTION 'Transition to rejected requires a non-empty rejection_reason.';
    END IF;
    NEW.completed_at := NULL;
    NEW.delivered_at := NULL;
    NEW.archived_at := NULL;
  ELSE
    -- Transition to any other in-flight status resets lifecycle timestamps
    NEW.completed_at := NULL;
    NEW.delivered_at := NULL;
    NEW.archived_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_service_request_status_transition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_service_request_status_transition ON public.customer_services;
CREATE TRIGGER trg_validate_service_request_status_transition
BEFORE UPDATE ON public.customer_services
FOR EACH ROW
EXECUTE FUNCTION public.validate_service_request_status_transition();

-- ------------------------------------------------------------------------------
-- 4. PERSISTENT METADATA INVARIANTS (CHECK CONSTRAINTS)
-- Protects lifecycle metadata from later corruption via ordinary UPDATEs.
-- ------------------------------------------------------------------------------

ALTER TABLE public.customer_services
  DROP CONSTRAINT IF EXISTS check_service_request_rejected_reason;
ALTER TABLE public.customer_services
  ADD CONSTRAINT check_service_request_rejected_reason
  CHECK (status <> 'rejected' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0));

ALTER TABLE public.customer_services
  DROP CONSTRAINT IF EXISTS check_service_request_completed_at;
ALTER TABLE public.customer_services
  ADD CONSTRAINT check_service_request_completed_at
  CHECK (status <> 'completed' OR completed_at IS NOT NULL);

ALTER TABLE public.customer_services
  DROP CONSTRAINT IF EXISTS check_service_request_delivered_at;
ALTER TABLE public.customer_services
  ADD CONSTRAINT check_service_request_delivered_at
  CHECK (status <> 'delivered' OR (delivered_at IS NOT NULL AND completed_at IS NOT NULL));

ALTER TABLE public.customer_services
  DROP CONSTRAINT IF EXISTS check_service_request_archived_at;
ALTER TABLE public.customer_services
  ADD CONSTRAINT check_service_request_archived_at
  CHECK (status <> 'archived' OR archived_at IS NOT NULL);
;
