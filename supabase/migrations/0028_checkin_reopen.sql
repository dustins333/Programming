-- Lets a coach reopen one specific missed weekly check-in for late
-- submission (Terra's real ask: a client missed her filing window and
-- wants to submit now). No changes needed to the standalone app's shared
-- public.checkin_responses table — its insert RLS policy already only
-- checks client_id = auth.uid(), with no week_start restriction, so a
-- member can already insert against any past week at the DB level. The
-- only thing actually missing is app-side: nothing ever showed the member
-- a form for anything but the live currentWeek. This table is the coach's
-- explicit "yes, let them file this one late" grant, genuinely new (no
-- standalone-app equivalent), so it lives in Kova's own `programming`
-- schema rather than touching public.* — same reasoning as
-- nutrition_milestones (0023).
--
-- expires_at is computed once at reopen time (the Sunday that closes the
-- *current* filing cycle) rather than derived live on every read, so the
-- deadline stays fixed and auditable even as "today" moves forward. Once
-- today passes expires_at, the reopen simply stops being offered — no
-- cron job or explicit "close" action needed, it just quietly lapses so
-- the next cycle proceeds normally.
create table programming.nutrition_checkin_reopens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  week_start date not null,
  opened_at timestamptz not null default now(),
  opened_by uuid references core.users (id),
  expires_at date not null
);

create index nutrition_checkin_reopens_user_idx on programming.nutrition_checkin_reopens (user_id, week_start);

alter table programming.nutrition_checkin_reopens enable row level security;

create policy "staff manage nutrition_checkin_reopens" on programming.nutrition_checkin_reopens
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

create policy "member reads own nutrition_checkin_reopens" on programming.nutrition_checkin_reopens
  for select using (user_id = auth.uid());

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New table needs the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
