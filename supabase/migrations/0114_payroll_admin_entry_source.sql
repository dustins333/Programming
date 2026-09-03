-- Payroll: a line for someone who is paid but is not an app user.
--
-- The real case: Callie White cleans the gym and is on payroll, but has no
-- reason to be staff inside the app — no login, no client visibility, no
-- coach permissions. Until now there was no way to record her pay at all,
-- so her amount was being folded into pay_periods.taxes_paid to make the
-- period total come out right. That works once and corrupts the one number
-- on a closed period that has no other source of truth.
--
-- Nothing structural was actually missing:
--   * pay_entries.user_id is already nullable
--   * staff_name/staff_email are snapshotted on every row anyway
--   * "admin insert pay_entries" only requires core.is_admin() and an open
--     period — it never mentions user_id
--   * every reader already groups on `user_id ?? staff_email` and renders
--     an "unlinked" row for entries with no account behind them (built for
--     Kelsie Neidner, a departed coach, whose 41 rows are keyed on email)
--
-- So the only thing this migration adds is an honest value for `source`.
-- Reusing 'coach_entry' would label a cleaner's pay as a coach's own
-- logged shift, which is exactly the kind of quiet wrongness the source
-- column exists to prevent — it is how a row's origin stays traceable
-- (0036's own comment on it), even though nothing renders it today.
--
-- Additive and reversible: no existing row changes, and every existing
-- source value stays legal.

alter table payroll.pay_entries drop constraint if exists pay_entries_source_check;

alter table payroll.pay_entries add constraint pay_entries_source_check
  check (source in ('coach_entry', 'custom_request', 'nutrition_billing', 'legacy_import', 'admin_entry'));

-- Rollback (only safe while no admin_entry rows exist):
--   alter table payroll.pay_entries drop constraint pay_entries_source_check;
--   alter table payroll.pay_entries add constraint pay_entries_source_check
--     check (source in ('coach_entry','custom_request','nutrition_billing','legacy_import'));
