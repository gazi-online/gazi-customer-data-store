-- ==============================================================================
-- PHASE 2D: FOLLOW-UP, DUE-DATE & RENEWAL OPERATIONS MIGRATION
-- File: phase2d_followup_operations_migration.sql
-- Description:
--   1. Creates public.service_request_followups table with audit history.
--   2. Enforces partial unique index for single open follow-up per request.
--   3. Adds deferred FK for superseded_by with ON DELETE RESTRICT.
--   4. Adds BEFORE INSERT guard (status = 'open', null resolution fields).
--   5. Adds BEFORE UPDATE guard (immutability of origin & schedule, terminal lock, DB completed_at).
--   6. Implements canonical reschedule_service_request_followup RPC with GUC protection.
--   7. Configures strict multi-tenant RLS policies.
-- ==============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.service_request_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_service_id UUID NOT NULL REFERENCES public.customer_services(id) ON DELETE CASCADE,
  follow_up_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  completed_at TIMESTAMPTZ,
  superseded_by UUID NULL REFERENCES public.service_request_followups(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Status check constraints
ALTER TABLE public.service_request_followups
  DROP CONSTRAINT IF EXISTS check_service_request_followups_status;
ALTER TABLE public.service_request_followups
  ADD CONSTRAINT check_service_request_followups_status
  CHECK (status IN ('open', 'completed', 'cancelled', 'rescheduled'));

ALTER TABLE public.service_request_followups
  DROP CONSTRAINT IF EXISTS check_service_request_followups_completed_at;
ALTER TABLE public.service_request_followups
  ADD CONSTRAINT check_service_request_followups_completed_at
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL));

ALTER TABLE public.service_request_followups
  DROP CONSTRAINT IF EXISTS check_service_request_followups_rescheduled;
ALTER TABLE public.service_request_followups
  ADD CONSTRAINT check_service_request_followups_rescheduled
  CHECK (status <> 'rescheduled' OR superseded_by IS NOT NULL);

-- 3. Indexes
-- Single active open follow-up per request
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_request_followups_single_open
  ON public.service_request_followups(customer_service_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_service_request_followups_req_id
  ON public.service_request_followups(customer_service_id);

CREATE INDEX IF NOT EXISTS idx_service_request_followups_follow_up_at
  ON public.service_request_followups(follow_up_at);

CREATE INDEX IF NOT EXISTS idx_service_request_followups_status
  ON public.service_request_followups(status);

CREATE INDEX IF NOT EXISTS idx_service_request_followups_open_due
  ON public.service_request_followups(status, follow_up_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_service_request_followups_superseded_by
  ON public.service_request_followups(superseded_by)
  WHERE superseded_by IS NOT NULL;

-- 4. Lifecycle Trigger: Insert Guard
CREATE OR REPLACE FUNCTION public.check_service_request_followup_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'open' THEN
    RAISE EXCEPTION 'New follow-ups must be inserted with status open' USING ERRCODE = '23514';
  END IF;
  IF NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'New follow-ups cannot have completed_at set on insert' USING ERRCODE = '23514';
  END IF;
  IF NEW.resolution_note IS NOT NULL THEN
    RAISE EXCEPTION 'New follow-ups cannot have resolution_note set on insert' USING ERRCODE = '23514';
  END IF;
  IF NEW.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'New follow-ups cannot have superseded_by set on insert' USING ERRCODE = '23514';
  END IF;
  NEW.created_at = now();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_request_followups_insert_guard ON public.service_request_followups;
CREATE TRIGGER trg_service_request_followups_insert_guard
  BEFORE INSERT ON public.service_request_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.check_service_request_followup_insert_guard();

-- 5. Lifecycle Trigger: Update Guard & Immutability
CREATE OR REPLACE FUNCTION public.check_service_request_followup_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Immutability of origin & creator
  IF NEW.customer_service_id <> OLD.customer_service_id THEN
    RAISE EXCEPTION 'customer_service_id is strictly immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'created_by is strictly immutable' USING ERRCODE = '42501';
  END IF;

  -- Terminal rows cannot be modified or reopened
  IF OLD.status IN ('completed', 'cancelled', 'rescheduled') THEN
    RAISE EXCEPTION 'Terminal follow-up records cannot be updated or reopened' USING ERRCODE = '42501';
  END IF;

  -- Lifecycle rules from OLD.status = 'open'
  IF OLD.status = 'open' THEN
    -- A) Remaining in 'open' status
    IF NEW.status = 'open' THEN
      IF NEW.follow_up_at <> OLD.follow_up_at THEN
        RAISE EXCEPTION 'follow_up_at is immutable; rescheduling must use canonical reschedule function' USING ERRCODE = '42501';
      END IF;
      IF (NEW.note IS DISTINCT FROM OLD.note) THEN
        RAISE EXCEPTION 'note is immutable; rescheduling or resolution must use designated fields' USING ERRCODE = '42501';
      END IF;
      IF (NEW.resolution_note IS DISTINCT FROM OLD.resolution_note) THEN
        RAISE EXCEPTION 'resolution_note cannot be modified while status remains open' USING ERRCODE = '42501';
      END IF;
      IF (NEW.superseded_by IS DISTINCT FROM OLD.superseded_by) THEN
        RAISE EXCEPTION 'superseded_by cannot be modified while status remains open' USING ERRCODE = '42501';
      END IF;
      IF NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'completed_at must be NULL while status remains open' USING ERRCODE = '42501';
      END IF;
      NEW.completed_at = NULL;

    -- B) Transition to 'completed'
    ELSIF NEW.status = 'completed' THEN
      IF NEW.follow_up_at <> OLD.follow_up_at THEN
        RAISE EXCEPTION 'follow_up_at is immutable' USING ERRCODE = '42501';
      END IF;
      IF (NEW.note IS DISTINCT FROM OLD.note) THEN
        RAISE EXCEPTION 'note is immutable' USING ERRCODE = '42501';
      END IF;
      IF NEW.superseded_by IS NOT NULL THEN
        RAISE EXCEPTION 'superseded_by must be NULL when completing a follow-up' USING ERRCODE = '42501';
      END IF;
      NEW.completed_at = now();

    -- C) Transition to 'cancelled'
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.follow_up_at <> OLD.follow_up_at THEN
        RAISE EXCEPTION 'follow_up_at is immutable' USING ERRCODE = '42501';
      END IF;
      IF (NEW.note IS DISTINCT FROM OLD.note) THEN
        RAISE EXCEPTION 'note is immutable' USING ERRCODE = '42501';
      END IF;
      IF NEW.superseded_by IS NOT NULL THEN
        RAISE EXCEPTION 'superseded_by must be NULL when cancelling a follow-up' USING ERRCODE = '42501';
      END IF;
      NEW.completed_at = NULL;

    -- D) Transition to 'rescheduled'
    ELSIF NEW.status = 'rescheduled' THEN
      IF current_setting('app.canonical_reschedule', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Status rescheduled is only permitted through canonical reschedule_service_request_followup RPC' USING ERRCODE = '42501';
      END IF;
      IF NEW.superseded_by IS NULL THEN
        RAISE EXCEPTION 'superseded_by is required when status is rescheduled' USING ERRCODE = '42501';
      END IF;
      IF NEW.follow_up_at <> OLD.follow_up_at THEN
        RAISE EXCEPTION 'Original follow_up_at cannot be modified during reschedule' USING ERRCODE = '42501';
      END IF;
      IF (NEW.note IS DISTINCT FROM OLD.note) THEN
        RAISE EXCEPTION 'Original note cannot be modified during reschedule' USING ERRCODE = '42501';
      END IF;
      NEW.completed_at = NULL;

    ELSE
      RAISE EXCEPTION 'Invalid follow-up status transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_request_followups_update_guard ON public.service_request_followups;
CREATE TRIGGER trg_service_request_followups_update_guard
  BEFORE UPDATE ON public.service_request_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.check_service_request_followup_update_guard();

-- 6. Canonical Reschedule RPC
CREATE OR REPLACE FUNCTION public.reschedule_service_request_followup(
  p_old_followup_id UUID,
  p_new_follow_up_at TIMESTAMPTZ,
  p_new_note TEXT DEFAULT NULL,
  p_resolution_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old RECORD;
  v_new_id UUID := gen_random_uuid();
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Lock existing open follow-up
  SELECT * INTO v_old
  FROM public.service_request_followups
  WHERE id = p_old_followup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Follow-up not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old.status <> 'open' THEN
    RAISE EXCEPTION 'Only open follow-ups can be rescheduled' USING ERRCODE = 'P0001';
  END IF;

  -- Validate tenant authorization
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_services cs
    JOIN public.customers c ON c.id = cs.customer_id
    JOIN public.business_memberships bm ON bm.business_id = c.business_id
    WHERE cs.id = v_old.customer_service_id
      AND bm.user_id = v_caller_id
      AND bm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Unauthorized tenant access' USING ERRCODE = '42501';
  END IF;

  -- Set transaction-local GUC guard
  PERFORM set_config('app.canonical_reschedule', 'true', true);

  -- Update old row to rescheduled (vacates partial unique open index)
  UPDATE public.service_request_followups
  SET
    status = 'rescheduled',
    resolution_note = p_resolution_note,
    superseded_by = v_new_id
  WHERE id = v_old.id;

  -- Insert replacement row in open status (shares customer_service_id)
  INSERT INTO public.service_request_followups (
    id,
    customer_service_id,
    follow_up_at,
    note,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    v_old.customer_service_id,
    p_new_follow_up_at,
    p_new_note,
    'open',
    v_caller_id,
    now(),
    now()
  );

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_service_request_followup(UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_service_request_followup(UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;

-- 7. Multi-Tenant RLS Policies
ALTER TABLE public.service_request_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_request_followups_tenant_select" ON public.service_request_followups;
CREATE POLICY "service_request_followups_tenant_select"
  ON public.service_request_followups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_followups.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "service_request_followups_tenant_insert" ON public.service_request_followups;
CREATE POLICY "service_request_followups_tenant_insert"
  ON public.service_request_followups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (created_by = auth.uid())
    AND (status = 'open')
    AND (completed_at IS NULL)
    AND (resolution_note IS NULL)
    AND (superseded_by IS NULL)
    AND EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_followups.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "service_request_followups_tenant_update" ON public.service_request_followups;
CREATE POLICY "service_request_followups_tenant_update"
  ON public.service_request_followups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_followups.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.customer_services cs
      JOIN public.customers c ON c.id = cs.customer_id
      JOIN public.business_memberships bm ON bm.business_id = c.business_id
      WHERE cs.id = service_request_followups.customer_service_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

-- No DELETE policy (hard deletions prohibited)
DROP POLICY IF EXISTS "service_request_followups_tenant_delete" ON public.service_request_followups;

-- 8. Least-Privilege Table Grants
REVOKE ALL ON public.service_request_followups FROM anon;
REVOKE DELETE ON public.service_request_followups FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.service_request_followups TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
