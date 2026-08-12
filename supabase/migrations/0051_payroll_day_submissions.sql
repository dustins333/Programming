-- Per-day "I'm done entering this date" submission for the payroll entry
-- screen.
--
-- Why this exists: the tile grid used to treat each tile's own checkmark as
-- that tile's save button (tap the checkmark -> write the row). Per direct
-- ask, entry data now autosaves as it's typed, and the checkmarks stay
-- hollow until the coach taps one Submit button at the bottom of the page —
-- so "submitted" became a real piece of state with nowhere to live. One row
-- per (coach, date); its presence is the whole signal.
--
-- Deliberately NOT modelled like payroll.finalizations, despite looking
-- similar:
--   * No staff_name/staff_email snapshot and `on delete cascade` rather
--     than `on delete set null` (which the rest of this schema uses per
--     0036's convention #3). That convention exists because pay entries,
--     requests and finalizations are permanent audit data that must stay
--     legible after an account is removed. A day submission is not — it's
--     transient entry-screen state that gets cleared again the moment the
--     coach edits that date (see clearDaySubmission in
--     lib/payroll/daySubmissions.js), so the audit record for "this period
--     is locked in" remains payroll.finalizations alone.
--   * Coaches write it directly rather than through a security-definer RPC.
--     finalizations needs the RPC because a coach must never be able to set
--     their own reopened_at; this table has no column a coach shouldn't be
--     allowed to set.
--
-- Guarded on closed periods only, not on finalization: the entry grid is
-- already hidden once a coach finalizes, and blocking the write there would
-- only add a failure mode with no data at stake.

create table payroll.day_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  pay_period_start date not null references payroll.pay_periods (start_date),
  entry_date date not null,
  submitted_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index day_submissions_user_period_idx on payroll.day_submissions (user_id, pay_period_start);

alter table payroll.day_submissions enable row level security;

create policy "admin select day_submissions" on payroll.day_submissions
  for select using (core.is_admin());
create policy "coach select own day_submissions" on payroll.day_submissions
  for select using (user_id = auth.uid());

create policy "coach manage own day_submissions" on payroll.day_submissions
  for all using (
    user_id = auth.uid() and core.is_staff()
    and not payroll.is_period_closed(pay_period_start)
  )
  with check (
    user_id = auth.uid() and core.is_staff()
    and not payroll.is_period_closed(pay_period_start)
  );

create policy "admin manage day_submissions" on payroll.day_submissions
  for all using (core.is_admin() and not payroll.is_period_closed(pay_period_start))
  with check (core.is_admin() and not payroll.is_period_closed(pay_period_start));

-- Explicit rather than relying on 0036's `alter default privileges` line —
-- same defensive convention 0004 established after 0003's schema-grant bug.
grant all on payroll.day_submissions to anon, authenticated, service_role;
