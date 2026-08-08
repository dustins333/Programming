-- Not a schema migration — project-level cron config, run in the SQL Editor
-- like every other file in this folder. Schedules the
-- scan-payroll-deadline-reminders Edge Function so a coach who hasn't
-- finalized gets pushed once the configured weekly deadline passes,
-- without depending on anyone having the app open.
--
-- Before running this:
--   1. Deploy the function: supabase functions deploy scan-payroll-deadline-reminders --no-verify-jwt
--   2. CRON_SECRET is already set from the scan-spc-alerts setup (function
--      secrets are project-wide) — reuse that same value below.
--   3. Replace the placeholder below with that value, then run this file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 15 minutes, every day — cheap to poll; the function itself checks
-- whether today/now actually matches the configured deadline weekday/time
-- (payroll_deadline_weekday/payroll_deadline_time in core.settings) and
-- no-ops otherwise. Same "poll often, gate inside the function" shape as
-- the announcement-scan cron job.
select cron.schedule(
  'payroll-deadline-reminder-scan',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://rtgwhchycfnfvwagilkw.supabase.co/functions/v1/scan-payroll-deadline-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REPLACE_WITH_THE_SAME_CRON_SECRET_VALUE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check it's registered:      select * from cron.job;
-- To see run history/failures:   select * from cron.job_run_details order by start_time desc limit 20;
-- To remove it entirely:         select cron.unschedule('payroll-deadline-reminder-scan');
