-- Uploading a CCrew month moves from admin-only to the Ops Hours permission.
--
-- can_log_ops_hours (0036) already means "this person runs gym operations,
-- not just coaching" — today only Lauren has it, and it is settable per
-- coach in Settings > Team. Scoring the month and putting names on the wall
-- is exactly that kind of work, so it rides on the same flag rather than
-- inventing a second one nobody would remember to set.
--
-- READS are unchanged: every coach can still view CCrew (core.is_staff()).
-- Only the write side moves.
--
-- Same shape as core.can_access_spc() and friends from 0015: security
-- definer, because a policy on an RLS-protected table can't read core.users
-- from inside itself without recursing. Admin always passes.
create or replace function core.can_manage_ccrew()
returns boolean
language sql
security definer
set search_path = core
stable
as $$
  select core.is_admin() or exists (
    select 1 from core.users where id = auth.uid() and role = 'coach' and can_log_ops_hours
  );
$$;

drop policy if exists "admin manage ccrew members" on programming.ccrew_members;
create policy "ops manage ccrew members" on programming.ccrew_members
  for all using (core.can_manage_ccrew()) with check (core.can_manage_ccrew());

drop policy if exists "admin manage ccrew periods" on programming.ccrew_periods;
create policy "ops manage ccrew periods" on programming.ccrew_periods
  for all using (core.can_manage_ccrew()) with check (core.can_manage_ccrew());

drop policy if exists "admin manage ccrew records" on programming.ccrew_records;
create policy "ops manage ccrew records" on programming.ccrew_records
  for all using (core.can_manage_ccrew()) with check (core.can_manage_ccrew());
