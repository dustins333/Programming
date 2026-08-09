-- Not a schema migration — reschedules the existing
-- nutrition-checkin-available-scan pg_cron job (registered by 0014) from a
-- fixed once-a-week schedule to a 15-minute poll, since
-- scan-nutrition-checkin-available now reads its send day/time from
-- core.settings (coach-editable on Settings -> Nutrition) instead of having
-- them baked into the cron schedule itself. Same "poll cheap, gate inside
-- the function" shape as scan-announcements/scan-payroll-deadline-reminders
-- — cron.schedule() with an existing job name upserts it in place, no
-- unschedule step needed first.
--
-- Before running this:
--   1. Redeploy the function (its content/timing/idempotency logic changed):
--        supabase functions deploy scan-nutrition-checkin-available --no-verify-jwt
--   2. No new secret needed — reuses the CRON_SECRET already set.
--   3. Replace the placeholder below with that same secret value, then run
--      this whole file in the SQL Editor.

select cron.schedule(
  'nutrition-checkin-available-scan',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://rtgwhchycfnfvwagilkw.supabase.co/functions/v1/scan-nutrition-checkin-available',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'KovaCron'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To confirm the schedule changed: select * from cron.job where jobname = 'nutrition-checkin-available-scan';
-- To see run history/failures:      select * from cron.job_run_details order by start_time desc limit 20;
