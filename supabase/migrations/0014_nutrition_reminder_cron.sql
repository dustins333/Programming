-- Not a schema migration — project-level cron config, same as 0013. Schedules
-- the two nutrition reminder Edge Functions (supabase/functions/
-- scan-nutrition-reminders and scan-nutrition-checkin-available), ported
-- from the standalone Nutrition Tracker app's two cron routes. See
-- CLAUDE.md's "Coach push notifications" section.
--
-- Before running this:
--   1. Deploy both functions:
--        supabase functions deploy scan-nutrition-reminders --no-verify-jwt
--        supabase functions deploy scan-nutrition-checkin-available --no-verify-jwt
--   2. No new secret needed — this reuses the CRON_SECRET already set for
--      scan-spc-alerts (Supabase function secrets are project-wide).
--   3. Replace the placeholder below with that same secret value, then run
--      this whole file in the SQL Editor.

-- Daily log + Monday check-in nag — same schedule the source app used
-- (0 2 * * *, ~evening in Boise).
select cron.schedule(
  'nutrition-reminders-scan',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://rtgwhchycfnfvwagilkw.supabase.co/functions/v1/scan-nutrition-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REPLACE_WITH_THE_SAME_CRON_SECRET_VALUE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Weekly check-in opens — Sundays only, same schedule the source app used
-- (0 15 * * 0, Sunday morning Boise).
select cron.schedule(
  'nutrition-checkin-available-scan',
  '0 15 * * 0',
  $$
  select net.http_post(
    url := 'https://rtgwhchycfnfvwagilkw.supabase.co/functions/v1/scan-nutrition-checkin-available',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REPLACE_WITH_THE_SAME_CRON_SECRET_VALUE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check both are registered:  select * from cron.job;
-- To see run history/failures:   select * from cron.job_run_details order by start_time desc limit 20;
-- To remove one:                 select cron.unschedule('nutrition-reminders-scan');
