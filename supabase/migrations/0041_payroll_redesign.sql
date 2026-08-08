-- Payroll redesign — tile-based entry UI, admin/staff view split, and a
-- real audit-locking guarantee for closed pay periods. Full design
-- rationale lives in the approved plan; the short version of what this
-- migration adds:
--
-- 1. strategy_notes mirrors the existing-but-previously-unused
--    welcome_notes column — the new Welcome/Strategy tile popups store a
--    coach-typed list of names here, one column per category, same shape.
-- 2. pay_periods gains owner_pay/staff_pay/taxes_paid — computed once at
--    close time (owner/staff) or typed once by the admin afterward
--    (taxes), then displayed read-only in the closed-periods list. All
--    nullable — a period that predates this feature, or is still open,
--    simply has nulls here.
-- 3. closed_period_rate_snapshots is what makes a closed period's dollar
--    amounts permanently immune to a later rate edit. pay_entries only
--    ever stores raw quantities (group_sessions=3, etc.) and dollars are
--    always computed live from whatever the CURRENT rate tables say —
--    correct for an open period (rate changes should be retroactive
--    within it), wrong for a closed one (which is supposed to be
--    audit-locked forever). This table captures a full copy of
--    core_rates/other_rates/spc_tiers at the exact moment a period is
--    closed, so every report for that period — including the per-category
--    drill-down — reads from its own frozen rates instead of the live
--    tables from then on.
--
-- No RLS changes to any existing table — "block close if pending custom
-- requests exist" and "rates move to a dedicated Settings tab" are pure
-- application logic, not new database restrictions.
--
-- After running this, NOTIFY pgrst, 'reload schema'; in the SQL Editor —
-- new columns need this same as new tables (bit us for real with the SPC
-- titles migration and again with 0011, both documented in CLAUDE.md).

alter table payroll.pay_entries add column strategy_notes text;

alter table payroll.pay_periods
  add column owner_pay numeric(10, 2),
  add column staff_pay numeric(10, 2),
  add column taxes_paid numeric(10, 2);

create table payroll.closed_period_rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  pay_period_start date not null unique references payroll.pay_periods (start_date),
  core_rates jsonb not null,
  other_rates jsonb not null,
  spc_tiers jsonb not null,
  created_at timestamptz not null default now()
);

alter table payroll.closed_period_rate_snapshots enable row level security;

-- Staff (not just admin) can read — a coach viewing their own Report tab
-- for an already-closed historical period needs this to compute their
-- breakdown at that period's frozen rates, not today's.
create policy "staff read closed_period_rate_snapshots" on payroll.closed_period_rate_snapshots
  for select using (core.is_staff());

-- Insert-only in practice (the app never updates/deletes a snapshot once
-- written), admin-gated same as every other payroll write path. No
-- separate update/delete policy — there's deliberately no in-app path to
-- either, matching "closed periods don't change" for the snapshot itself.
create policy "admin insert closed_period_rate_snapshots" on payroll.closed_period_rate_snapshots
  for insert with check (core.is_admin());

grant all on payroll.closed_period_rate_snapshots to anon, authenticated, service_role;
