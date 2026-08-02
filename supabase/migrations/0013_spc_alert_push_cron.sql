-- Not a schema migration — this is project-level cron config, run in the SQL
-- Editor the same way as every other file in this folder. Schedules the
-- scan-spc-alerts Edge Function (supabase/functions/scan-spc-alerts) to run
-- daily so a block-ending alert + auto-draft doesn't depend on a coach
-- happening to have the SPC dashboard open (see that function's header
-- comment, and CLAUDE.md's "Coach push notifications" section).
--
-- Before running this:
--   1. Deploy the function: supabase functions deploy scan-spc-alerts --no-verify-jwt
--   2. Set its secret:      supabase secrets set CRON_SECRET=<a-random-value>
--   3. Replace both placeholders below with that same random value and your
--      project's function URL, then run this whole file in the SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Runs at 13:00 UTC (6am MST / 7am MDT — before a coach's day starts).
-- Adjust the schedule later with: select cron.alter_job(job_id, schedule => '...');
select cron.schedule(
  'spc-alert-scan',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://rtgwhchycfnfvwagilkw.supabase.co/functions/v1/scan-spc-alerts',
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
-- To remove it entirely:         select cron.unschedule('spc-alert-scan');
