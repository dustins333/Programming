-- Payroll module — replaces the standalone Glide payroll app. Full design
-- rationale lives in the approved plan; the short version of what's
-- deliberately different from Glide:
--
-- 1. Pay periods are NOT a pre-seeded, manually-maintained calendar table
--    (Glide needed a separate daily job just to flip Open/Closed). A period
--    is identified by its start_date alone (natural key, end_date is a
--    generated column, 14-day cadence computed app-side from an anchor in
--    core.settings) and only gets a real row once something references it
--    — payroll.ensure_pay_period() lazily upserts a stub row on first
--    write. The only real *state* this table holds is whether a period has
--    been explicitly closed by an admin.
-- 2. Custom pay requests and the actual pay entry are unified: approving a
--    request directly creates the linked pay_entries row (payroll.
--    custom_requests.pay_entry_id) — no separate manual re-typing step,
--    which is what caused a real $200 gap between an approved and an
--    actually-paid amount in the Glide data this replaces.
-- 3. Every user_id/coach_id FK uses `on delete set null`, never cascade,
--    and every row that references a person also snapshots their
--    name/email at write time — this is permanent audit data and must
--    stay legible even if a coach's account is later removed (core.users
--    itself cascades from auth.users, per 0001).
-- 4. Once a pay period is closed, RLS blocks writes to it for EVERYONE,
--    including admin — a genuine hard stop, not just a UI convention, per
--    explicit ask ("for audit purposes... it's not changing").
--
-- After running this, add `payroll` to Project Settings > API > Exposed
-- schemas (dashboard-only setting, same as core/programming/nutrition
-- needed originally), then NOTIFY pgrst, 'reload schema'; in the SQL
-- Editor.

create schema if not exists payroll;

-- Anchor + cadence for the computed pay-period math (lib/payroll/periods.js)
-- — every one of the 29 real historical Glide pay periods lands exactly 14
-- days apart starting here, so this one date is all that's needed to derive
-- any period's start/end going forward. Deadline-reminder config lives here
-- too, same admin-editable core.settings convention scan-spc-alerts already
-- uses for alert_lead_time_days/notify_spc_block_alerts. payroll_deadline_
-- weekday follows dayOfWeekInBoise()'s 0=Sunday..6=Saturday convention
-- (3 = Wednesday, matching "coaches need it in by Wednesday").
insert into core.settings (key, value) values
  ('payroll_period_anchor_date', '"2025-10-02"'),
  ('payroll_deadline_weekday', '3'),
  ('payroll_deadline_time', '"17:00"'),
  ('notify_payroll_deadline_reminders', 'true')
on conflict (key) do nothing;

-- Mirrors Glide's per-user "Manager" flag (today only Lauren has it) —
-- same admin-settable-toggle shape as can_view_spc/can_view_nutrition/
-- can_view_exercise_library (0015), gates whether the Ops Hours field
-- shows up on that coach's payroll entry form.
alter table core.users add column can_log_ops_hours boolean not null default false;

-- ---------------------------------------------------------------------
-- Pay periods
-- ---------------------------------------------------------------------

create table payroll.pay_periods (
  start_date date primary key,
  end_date date not null generated always as (start_date + 13) stored,
  label text,
  legacy_period_id text unique,
  closed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create function payroll.is_period_closed(p_start date)
returns boolean
language sql
security definer
set search_path = payroll
stable
as $$
  select coalesce((select closed from payroll.pay_periods where start_date = p_start), false);
$$;

-- Lazily creates the stub row for a period the first time anything needs
-- to reference it — this is the whole point of not pre-seeding a calendar.
create function payroll.ensure_pay_period(p_start date)
returns void
language plpgsql
security definer
set search_path = payroll
as $$
begin
  insert into payroll.pay_periods (start_date)
  values (p_start)
  on conflict (start_date) do nothing;
end;
$$;

alter table payroll.pay_periods enable row level security;

create policy "staff read pay_periods" on payroll.pay_periods
  for select using (core.is_staff());

create policy "admin manage pay_periods" on payroll.pay_periods
  for all using (core.is_admin()) with check (core.is_admin());

-- ---------------------------------------------------------------------
-- Rate tables — global flat rates, admin-write / staff-read
-- ---------------------------------------------------------------------

create table payroll.core_rates (
  work_type text primary key check (work_type in
    ('group_session', 'program_written', 'admin_hours', 'welcome_session', 'strategy_session', 'ops_hours')),
  unit text not null,
  rate numeric(10, 2) not null
);

insert into payroll.core_rates (work_type, unit, rate) values
  ('group_session', 'session', 25.00),
  ('program_written', 'program', 15.00),
  ('admin_hours', 'hour', 18.00),
  ('welcome_session', 'session', 40.00),
  ('strategy_session', 'session', 10.00),
  ('ops_hours', 'hour', 23.00)
on conflict (work_type) do nothing;

alter table payroll.core_rates enable row level security;

create policy "staff read core_rates" on payroll.core_rates
  for select using (core.is_staff());

create policy "admin manage core_rates" on payroll.core_rates
  for all using (core.is_admin()) with check (core.is_admin());

create table payroll.other_rates (
  other_type text primary key,
  unit text not null,
  rate numeric(10, 2) not null,
  active boolean not null default true
);

insert into payroll.other_rates (other_type, unit, rate) values
  ('1:1 Nutrition', 'each', 100.00),
  ('1:1 Session', 'each', 40.00),
  ('2:1 - no sign up', 'session', 30.00),
  ('2:1 - sign up', 'session', 50.00),
  ('Away Program', 'item', 60.00),
  ('Benchmark', 'hour', 25.00),
  ('BWA Programming', 'item', 150.00),
  ('Cleaning', 'item', 30.00),
  ('Event', 'item', 100.00),
  ('Flagship+Videos', 'item', 250.00),
  ('N101', 'each', 100.00),
  ('Pictures', 'item', 200.00),
  ('Shadowing', 'hour', 18.00),
  ('Training', 'hour', 15.00),
  ('Virtual Meeting', 'item', 10.00),
  ('In-Person Meeting', 'item', 37.50),
  ('Bright Spots', 'item', 5.00),
  ('Leadership Team Meeting', 'item', 25.00),
  ('LLYL', 'hour', 50.00)
on conflict (other_type) do nothing;

alter table payroll.other_rates enable row level security;

create policy "staff read other_rates" on payroll.other_rates
  for select using (core.is_staff());

create policy "admin manage other_rates" on payroll.other_rates
  for all using (core.is_admin()) with check (core.is_admin());

-- SPC pay is a flat rate per session, tiered by that session's attendee
-- count (not per-attendee) — every real session in the Glide history caps
-- at 4, so the input is capped there too rather than open-ended.
create table payroll.spc_tiers (
  attendees smallint primary key check (attendees between 0 and 4),
  rate_per_session numeric(10, 2) not null
);

insert into payroll.spc_tiers (attendees, rate_per_session) values
  (0, 10.00),
  (1, 25.00),
  (2, 37.00),
  (3, 54.00),
  (4, 71.00)
on conflict (attendees) do nothing;

alter table payroll.spc_tiers enable row level security;

create policy "staff read spc_tiers" on payroll.spc_tiers
  for select using (core.is_staff());

create policy "admin manage spc_tiers" on payroll.spc_tiers
  for all using (core.is_admin()) with check (core.is_admin());

-- ---------------------------------------------------------------------
-- Finalizations — per-coach per-period lock. Coaches can only ever
-- finalize (lock) their own row via the RPC below, which is the ONLY
-- write path for them — RLS can't restrict which column a plain UPDATE
-- touches, and a coach must never be able to set their own reopened_at
-- (that would let them self-unlock). Reopening is a plain admin-only
-- table write instead, same "admin reopens" precedent as
-- nutrition_checkin_reopens.
--
-- Defined here, before pay_entries, because pay_entries' own RLS policies
-- below reference payroll.finalizations in an EXISTS subquery — Postgres
-- resolves every table a CREATE POLICY references at creation time, so
-- this table has to exist first or the whole migration fails partway
-- through with "relation payroll.finalizations does not exist".
-- ---------------------------------------------------------------------

create table payroll.finalizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references core.users (id) on delete set null,
  staff_name text not null,
  staff_email text not null,
  pay_period_start date not null references payroll.pay_periods (start_date),
  finalized_at timestamptz,
  reopened_at timestamptz,
  reopened_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, pay_period_start)
);

alter table payroll.finalizations enable row level security;

create policy "admin select finalizations" on payroll.finalizations
  for select using (core.is_admin());
create policy "coach select own finalizations" on payroll.finalizations
  for select using (user_id = auth.uid());

create policy "admin manage finalizations" on payroll.finalizations
  for all using (core.is_admin() and not payroll.is_period_closed(pay_period_start))
  with check (core.is_admin() and not payroll.is_period_closed(pay_period_start));

create function payroll.finalize_own_period(p_period_start date)
returns void
language plpgsql
security definer
set search_path = payroll, core
as $$
declare
  v_name text;
  v_email text;
begin
  if payroll.is_period_closed(p_period_start) then
    raise exception 'This pay period is closed.';
  end if;

  select name, email into v_name, v_email from core.users where id = auth.uid();
  if v_name is null then
    raise exception 'No profile found for the current user.';
  end if;

  perform payroll.ensure_pay_period(p_period_start);

  insert into payroll.finalizations (user_id, staff_name, staff_email, pay_period_start, finalized_at)
  values (auth.uid(), v_name, v_email, p_period_start, now())
  on conflict (user_id, pay_period_start)
  do update set finalized_at = now(), staff_name = excluded.staff_name, staff_email = excluded.staff_email;
end;
$$;

-- ---------------------------------------------------------------------
-- Pay entries — the line-item table. One row can carry several work
-- types at once (matches the coach's real day-to-day: e.g. 2 programs +
-- an SPC session logged together), same shape as the Glide form.
-- ---------------------------------------------------------------------

create table payroll.pay_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references core.users (id) on delete set null,
  staff_name text not null,
  staff_email text not null,
  pay_period_start date not null references payroll.pay_periods (start_date),
  entry_date date not null,
  group_sessions numeric(10, 2),
  programs_written numeric(10, 2),
  admin_hours numeric(10, 2),
  welcome_sessions numeric(10, 2),
  strategy_sessions numeric(10, 2),
  ops_hours numeric(10, 2),
  spc_session boolean,
  spc_attendees smallint check (spc_attendees between 0 and 4),
  other_type text references payroll.other_rates (other_type),
  other_qty numeric(10, 2) not null default 1,
  custom_amt numeric(10, 2),
  custom_description text,
  notes text,
  spc_notes text,
  program_notes text,
  welcome_notes text,
  admin_notes text,
  source text not null default 'coach_entry' check (source in
    ('coach_entry', 'custom_request', 'nutrition_billing', 'legacy_import')),
  legacy_entry_id text unique,
  created_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pay_entries_period_user_idx on payroll.pay_entries (pay_period_start, user_id);
create index pay_entries_user_idx on payroll.pay_entries (user_id, entry_date desc);

alter table payroll.pay_entries enable row level security;

create policy "admin select pay_entries" on payroll.pay_entries
  for select using (core.is_admin());
create policy "coach select own pay_entries" on payroll.pay_entries
  for select using (user_id = auth.uid());

create policy "admin insert pay_entries" on payroll.pay_entries
  for insert with check (core.is_admin() and not payroll.is_period_closed(pay_period_start));
create policy "coach insert own pay_entries" on payroll.pay_entries
  for insert with check (
    user_id = auth.uid() and core.is_staff()
    and not payroll.is_period_closed(pay_period_start)
    and not exists (
      select 1 from payroll.finalizations f
      where f.user_id = auth.uid() and f.pay_period_start = pay_entries.pay_period_start
        and f.finalized_at is not null
        and (f.reopened_at is null or f.finalized_at > f.reopened_at)
    )
  );

create policy "admin update pay_entries" on payroll.pay_entries
  for update using (core.is_admin() and not payroll.is_period_closed(pay_period_start))
  with check (core.is_admin() and not payroll.is_period_closed(pay_period_start));
create policy "coach update own pay_entries" on payroll.pay_entries
  for update using (
    user_id = auth.uid()
    and not payroll.is_period_closed(pay_period_start)
    and not exists (
      select 1 from payroll.finalizations f
      where f.user_id = auth.uid() and f.pay_period_start = pay_entries.pay_period_start
        and f.finalized_at is not null
        and (f.reopened_at is null or f.finalized_at > f.reopened_at)
    )
  )
  with check (
    user_id = auth.uid()
    and not payroll.is_period_closed(pay_period_start)
  );

create policy "admin delete pay_entries" on payroll.pay_entries
  for delete using (core.is_admin() and not payroll.is_period_closed(pay_period_start));
create policy "coach delete own pay_entries" on payroll.pay_entries
  for delete using (
    user_id = auth.uid()
    and not payroll.is_period_closed(pay_period_start)
    and not exists (
      select 1 from payroll.finalizations f
      where f.user_id = auth.uid() and f.pay_period_start = pay_entries.pay_period_start
        and f.finalized_at is not null
        and (f.reopened_at is null or f.finalized_at > f.reopened_at)
    )
  );

-- ---------------------------------------------------------------------
-- Custom requests — unifies request + pay (fixes the $200 drift bug)
-- ---------------------------------------------------------------------

create table payroll.custom_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references core.users (id) on delete set null,
  staff_name text not null,
  staff_email text not null,
  pay_period_start date not null references payroll.pay_periods (start_date),
  description text not null,
  amount_requested numeric(10, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  admin_notes text,
  approved_amount numeric(10, 2),
  decided_by uuid references core.users (id) on delete set null,
  decided_at timestamptz,
  pay_entry_id uuid references payroll.pay_entries (id) on delete set null,
  created_at timestamptz not null default now()
);

create index custom_requests_user_idx on payroll.custom_requests (user_id, pay_period_start);
create index custom_requests_status_idx on payroll.custom_requests (status);

-- CustomPayrollRequests has no stable id of its own in the legacy export,
-- unlike pay_entries (which reuses Glide's own EntryID as its primary
-- key). This composite dedup key is what makes re-running the legacy
-- importer against a later export idempotent instead of double-inserting
-- — a real (rare) exact-duplicate request would collide here and get
-- skipped, which is the documented, accepted tradeoff.
create unique index custom_requests_dedup_idx on payroll.custom_requests
  (staff_email, pay_period_start, description, amount_requested);

alter table payroll.custom_requests enable row level security;

create policy "admin select custom_requests" on payroll.custom_requests
  for select using (core.is_admin());
create policy "coach select own custom_requests" on payroll.custom_requests
  for select using (user_id = auth.uid());

create policy "admin insert custom_requests" on payroll.custom_requests
  for insert with check (core.is_admin() and not payroll.is_period_closed(pay_period_start));
create policy "coach insert own custom_requests" on payroll.custom_requests
  for insert with check (
    user_id = auth.uid() and core.is_staff()
    and not payroll.is_period_closed(pay_period_start)
  );

create policy "admin update custom_requests" on payroll.custom_requests
  for update using (core.is_admin() and not payroll.is_period_closed(pay_period_start))
  with check (core.is_admin() and not payroll.is_period_closed(pay_period_start));
create policy "coach update own pending custom_requests" on payroll.custom_requests
  for update using (user_id = auth.uid() and status = 'pending' and not payroll.is_period_closed(pay_period_start))
  with check (user_id = auth.uid() and status = 'pending' and not payroll.is_period_closed(pay_period_start));

create policy "admin delete custom_requests" on payroll.custom_requests
  for delete using (core.is_admin() and not payroll.is_period_closed(pay_period_start));
create policy "coach delete own pending custom_requests" on payroll.custom_requests
  for delete using (user_id = auth.uid() and status = 'pending' and not payroll.is_period_closed(pay_period_start));

-- ---------------------------------------------------------------------
-- 1:1 Nutrition billing assignments — rebuilt against real clients
-- ---------------------------------------------------------------------

create table payroll.nutrition_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references core.users (id) on delete set null,
  coach_name text not null,
  client_id uuid not null,
  client_name text not null,
  billing_day_of_month smallint not null check (billing_day_of_month between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nutrition_assignments_coach_idx on payroll.nutrition_assignments (coach_id) where active;

alter table payroll.nutrition_assignments enable row level security;

create policy "admin manage nutrition_assignments" on payroll.nutrition_assignments
  for all using (core.is_admin()) with check (core.is_admin());
create policy "coach manage own nutrition_assignments" on payroll.nutrition_assignments
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is schema-specific, not automatic across schemas.
-- USAGE on the schema itself is required too, not just table/sequence
-- grants — Postgres checks schema-level USAGE before it even looks at
-- table privileges, so omitting this produces "permission denied for
-- schema payroll" regardless of the grants below (this was missed in the
-- first version of this file and had to be patched forward in
-- 0039_payroll_schema_usage_grant.sql once already run against the live
-- project — included here so a fresh setup elsewhere doesn't repeat it).
grant usage on schema payroll to anon, authenticated, service_role;
grant all on all tables in schema payroll to anon, authenticated, service_role;
grant all on all sequences in schema payroll to anon, authenticated, service_role;
alter default privileges in schema payroll grant all on tables to anon, authenticated, service_role;
alter default privileges in schema payroll grant all on sequences to anon, authenticated, service_role;

-- New schema needs the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running
-- this, and remember to add `payroll` under Project Settings > API >
-- Exposed schemas first (dashboard-only setting).
