-- CCrew (Committed Crew) — the monthly attendance award.
--
-- Kilo remains the source of truth for attendance. Terra exports a calendar
-- month from Kilo, uploads it here, reviews a preview, and commits. See
-- ccrew-spec.md for every rule; the two that shape this schema are:
--
--   1. FREEZE. Kilo returns packages as of export time, not as of the date
--      range requested, so a closed month must never be recomputed from
--      current packages. `packages` and `target` on ccrew_records are
--      snapshots taken at commit time and are never touched again. This is
--      not a denormalisation shortcut — it is the whole point.
--   2. EMAIL IS THE KEY, not name. Names change; a name-keyed record would
--      silently start someone a fresh streak.
--
-- Lives in `programming` rather than its own schema deliberately: a new
-- schema needs a GRANT USAGE (missed once, see 0039) and a manual "Exposed
-- schemas" tick in the dashboard. Nothing here is worth that.

-- --------------------------------------------------------------------
-- ccrew_members — one row per person who has ever appeared in an export
-- --------------------------------------------------------------------
-- `user_id` IS the manual match table the spec calls for: taught once,
-- remembered forever. Terra's Kilo email (tmarjonen1@gmail.com) is not her
-- Kova login (terra@kovastrength.com), and only ~27 of 139 people have a
-- Kova account at all, so this is nullable and usually null. It matters
-- because the staff 2x floor keys off core.users.role — never off Kilo's
-- own `Current Status` or the `Team Lift` package, both of which are wrong
-- at the edges (Terra is a paying Member; Banesa holds Team Lift and IS a
-- coach).
--
-- `is_active` is set false when someone stops appearing in the export.
-- Their history is KEPT — Kilo only exports active members, so leaving is
-- indistinguishable from a row simply not being there, and if they come
-- back their months are still here.
create table if not exists programming.ccrew_members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  user_id uuid references core.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ccrew_members_email_lower check (email = lower(email))
);

create index if not exists ccrew_members_user_idx on programming.ccrew_members (user_id);

alter table programming.ccrew_members enable row level security;

drop policy if exists "staff read ccrew members" on programming.ccrew_members;
create policy "staff read ccrew members" on programming.ccrew_members
  for select using (core.is_staff());

drop policy if exists "admin manage ccrew members" on programming.ccrew_members;
create policy "admin manage ccrew members" on programming.ccrew_members
  for all using (core.is_admin()) with check (core.is_admin());

-- --------------------------------------------------------------------
-- ccrew_periods — one row per processed month
-- --------------------------------------------------------------------
-- Keyed by the first of the month as its natural key: there is exactly one
-- CCrew period per calendar month and no reason for a surrogate id. The
-- CHECK is a cheap guard against an upload landing a mid-month date.
create table if not exists programming.ccrew_periods (
  period date primary key,
  source text not null default 'upload' check (source in ('upload', 'backfill')),
  roster_count int not null default 0,
  qualified_count int not null default 0,
  uploaded_by uuid references core.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  notes text,
  constraint ccrew_periods_first_of_month check (extract(day from period) = 1)
);

alter table programming.ccrew_periods enable row level security;

drop policy if exists "staff read ccrew periods" on programming.ccrew_periods;
create policy "staff read ccrew periods" on programming.ccrew_periods
  for select using (core.is_staff());

drop policy if exists "admin manage ccrew periods" on programming.ccrew_periods;
create policy "admin manage ccrew periods" on programming.ccrew_periods
  for all using (core.is_admin()) with check (core.is_admin());

-- --------------------------------------------------------------------
-- ccrew_records — one row per person per month
-- --------------------------------------------------------------------
-- Everyone in the upload is stored, not just the people who qualified.
-- Keeping the near-misses is what makes "attended 8, needed 10" answerable
-- later, and it is the raw material for Phase 3's near-miss notification.
--
-- `packages` and `target` are FROZEN (see the header). `target` is the
-- number actually used to judge the month, so on a staff member it is
-- already the 2x floor, not their package's value — `package_target` keeps
-- what the package alone said, so the two can be told apart after the fact.
--
-- `tier` is the highest tier the person actually CLEARED, which is not
-- necessarily their target: a staff member on a 3x package who only cleared
-- 2x is listed under 2x. Null when they did not qualify.
create table if not exists programming.ccrew_records (
  id uuid primary key default gen_random_uuid(),
  period date not null references programming.ccrew_periods (period) on delete cascade,
  member_id uuid not null references programming.ccrew_members (id) on delete cascade,
  attendance int not null default 0 check (attendance >= 0),
  packages text not null default '',
  package_target smallint not null default 0,
  target smallint not null default 0,
  qualified boolean not null default false,
  tier smallint check (tier is null or tier in (2, 3)),
  staff_floor_applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (period, member_id),
  -- A qualifying month always has a tier; a non-qualifying one never does.
  constraint ccrew_records_tier_matches_qualified
    check ((qualified and tier is not null) or (not qualified and tier is null))
);

create index if not exists ccrew_records_member_idx on programming.ccrew_records (member_id, period);
create index if not exists ccrew_records_period_idx on programming.ccrew_records (period) where qualified;

alter table programming.ccrew_records enable row level security;

drop policy if exists "staff read ccrew records" on programming.ccrew_records;
create policy "staff read ccrew records" on programming.ccrew_records
  for select using (core.is_staff());

drop policy if exists "admin manage ccrew records" on programming.ccrew_records;
create policy "admin manage ccrew records" on programming.ccrew_records
  for all using (core.is_admin()) with check (core.is_admin());

-- Same Data-API permission dance as every table-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- Needs the usual PostgREST schema-cache nudge — NOTIFY pgrst, 'reload
-- schema'; in the SQL Editor right after running this.
