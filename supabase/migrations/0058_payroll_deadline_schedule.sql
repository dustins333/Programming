-- Fixes a real bug plus a schedule change to the payroll deadline reminder.
--
-- The bug: scan-payroll-deadline-reminders gated purely on
-- payroll_deadline_weekday (3 = Wednesday), so it fired on EVERY Wednesday
-- — including the one in the middle of each 14-day period, a full week
-- before anything was actually due. Pay periods run Thursday -> Wednesday
-- (anchor 2025-10-02 is a Thursday), so the function now anchors both
-- reminders to the period's own boundary instead of to a weekday. That
-- lands on the same Wednesday a coach expects, and can't drift.
--
-- The schedule change: one reminder the evening the period closes, and a
-- second the next day at noon for anyone who still hasn't submitted.
--
-- Run this AFTER redeploying the function:
--   supabase functions deploy scan-payroll-deadline-reminders --no-verify-jwt

-- 20:00 Boise on the last day of the pay period (Wednesday evening).
update core.settings
set value = '"20:00"', updated_at = now()
where key = 'payroll_deadline_time';

-- 12:00 Boise the next day (Thursday noon) — only to whoever is still
-- unsubmitted. Insert-if-missing so re-running this file is harmless.
insert into core.settings (key, value)
values ('payroll_deadline_followup_time', '"12:00"')
on conflict (key) do nothing;

-- No longer read by anything: the reminder is anchored to the pay period
-- boundary now, not to a weekday. Leaving the row would suggest it still
-- controls something.
delete from core.settings where key = 'payroll_deadline_weekday';

-- The cron job polls and the function decides whether now is actually one
-- of the two windows. Hourly instead of every 15 minutes: the windows are
-- on-the-hour, and the function's own last-sent guard
-- (payroll_deadline_reminder_last_sent) stops a second send on later polls
-- the same day.
--
-- Deliberately NOT two fixed-time cron entries: pg_cron schedules are UTC,
-- and Boise shifts between UTC-6 and UTC-7, so a fixed-UTC cron would be an
-- hour off half the year — and being an hour EARLY means the function's
-- Boise-time gate fails and no reminder goes out at all that day.
--
-- alter_job rather than cron.schedule so the existing command (which holds
-- the real CRON_SECRET) is preserved untouched and no secret has to be
-- pasted into this file. If this pg_cron version predates alter_job, fall
-- back to re-running 0038 with '0 * * * *' and the real secret substituted.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'payroll-deadline-reminder-scan'),
  schedule := '0 * * * *'
);

-- To confirm:  select jobname, schedule, active from cron.job where jobname = 'payroll-deadline-reminder-scan';
-- To confirm:  select key, value from core.settings where key like 'payroll%';
