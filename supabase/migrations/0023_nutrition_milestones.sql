-- Nutrition milestones: coach-assigned goals shown as small colored cards on
-- a client's Dashboard tab ("cutesy colored rectangles" per the ask) and
-- surfaced to the client themselves on their nutrition Today tab. Genuinely
-- new — unlike most of this app's nutrition module, there's no standalone
-- Nutrition Tracker app equivalent to port, so this lives in Kova's own
-- `programming` schema (FK'd to core.users, same shared auth id as
-- public.clients.id) rather than the shared public.* tables focus_items/
-- game_plan reuse.
--
-- `color_index` stores a palette index, not a literal color, so the actual
-- colors stay a client-side/themeable constant (see MILESTONE_COLORS).
-- The "max 3 active at once" rule from the ask is enforced app-side (same
-- convention as e.g. the single-slot photo-requirement flag elsewhere in
-- this schema) rather than a DB constraint.
create table programming.nutrition_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  title text not null,
  details text,
  color_index smallint not null default 0,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid references core.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Set once the client has seen the "congrats, you completed X" popup for
  -- this completion — null while a completed milestone is still unseen.
  acknowledged_at timestamptz
);

create index nutrition_milestones_user_status_idx on programming.nutrition_milestones (user_id, status);

alter table programming.nutrition_milestones enable row level security;

create policy "staff manage nutrition_milestones" on programming.nutrition_milestones
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

create policy "member reads own nutrition_milestones" on programming.nutrition_milestones
  for select using (user_id = auth.uid());

-- Narrow self-service write, same pattern as core.update_own_notification_prefs
-- (0020) — a member can only ever flip their own completed-and-unseen
-- milestone's acknowledged_at, nothing else on the row.
create function programming.acknowledge_nutrition_milestone(p_milestone_id uuid)
returns void
language sql
security definer
set search_path = programming
as $$
  update programming.nutrition_milestones
  set acknowledged_at = now()
  where id = p_milestone_id
    and user_id = auth.uid()
    and status = 'completed'
    and acknowledged_at is null;
$$;

grant execute on function programming.acknowledge_nutrition_milestone(uuid) to authenticated;

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New tables/functions need the same PostgREST schema-cache nudge as
-- always — NOTIFY pgrst, 'reload schema'; in the SQL Editor right after
-- running this.
