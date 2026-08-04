-- Not a schema migration — project-level cron config, run in the SQL Editor
-- the same way as every other file in this folder. Schedules the
-- scan-announcements Edge Function so a *scheduled* announcement still gets
-- pushed even if nobody's looking at the app when its send time arrives.
-- ("Send now" announcements don't need this — the coach compose screen
-- calls send-announcement directly and immediately.)
--
-- Before running this:
--   1. Deploy both functions:
--        supabase functions deploy send-announcement
--        supabase functions deploy scan-announcements --no-verify-jwt
--   2. CRON_SECRET is already set from the scan-spc-alerts setup (function
--      secrets are project-wide) — no need to set it again.
--   3. Replace the placeholder below with that same CRON_SECRET value, then
--      run this whole file in the SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 15 minutes — fine enough granularity for a "scheduled announcement"
-- without needing to-the-minute precision. Adjust later with:
--   select cron.alter_job(job_id, schedule => '...');
select cron.schedule(
  'announcement-scan',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://rtgwhchycfnfvwagilkw.supabase.co/functions/v1/scan-announcements',
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
-- To remove it entirely:         select cron.unschedule('announcement-scan');
