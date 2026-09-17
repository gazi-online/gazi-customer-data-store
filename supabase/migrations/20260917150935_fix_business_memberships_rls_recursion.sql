-- ==============================================================================
-- FIX: business_memberships RLS INFINITE RECURSION
-- File: supabase/migrations/20260917144500_fix_business_memberships_rls_recursion.sql
-- ==============================================================================

-- 1. Create a dedicated private helper schema if not exists
create schema if not exists private;

-- 2. Create security definer function to break RLS recursion on business_memberships
create or replace function private.is_active_business_member(
  p_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

-- 3. Restrict permissions: Keep outside public schema, not exposed as public RPC
revoke all on function private.is_active_business_member(uuid) from public;
revoke all on function private.is_active_business_member(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_business_member(uuid) to authenticated;

-- 4. Replace the recursive policy on public.business_memberships
drop policy if exists "business_memberships_same_business_select" on public.business_memberships;

create policy "business_memberships_same_business_select"
on public.business_memberships
for select
to authenticated
using (
  private.is_active_business_member(business_id)
);

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
