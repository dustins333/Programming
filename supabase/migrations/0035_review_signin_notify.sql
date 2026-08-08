-- Not a schema-owned migration in the usual sense — adds a trigger directly
-- on Supabase-managed auth.users, a documented-supported pattern (same
-- shape as Supabase's own "on_auth_user_created" example). Texts Terra the
-- moment Apple's App Review demo account (review@kovastrength.com) actually
-- signs into the app, via the new notify-review-signin Edge Function.
--
-- Already deployed and run against the live project (2026-08-07) — kept
-- here for history, same as every other migration file in this repo. The
-- placeholder below is deliberate: the real secret was substituted only in
-- the copy actually run against the database, never committed here, same
-- convention as 0025_announcement_push_cron.sql's CRON_SECRET placeholder.
--   1. Function deployed: supabase functions deploy notify-review-signin --no-verify-jwt
--   2. REVIEW_SIGNIN_SECRET set as its own dedicated function secret (not
--      CRON_SECRET — the CLI can set secrets but can't read an already-set
--      one back, so a fresh secret was generated instead).
--   3. Replace the placeholder below with that same REVIEW_SIGNIN_SECRET
--      value before running this file again (e.g. to recreate the trigger
--      after a schema reset) — Postgres has no way to reference an Edge
--      Function secret from inside a trigger body, so the literal value is
--      unavoidably baked into the live function's source either way.

create extension if not exists pg_net;

create or replace function core.notify_review_signin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email = 'review@kovastrength.com'
     and new.last_sign_in_at is not null
     and new.last_sign_in_at is distinct from old.last_sign_in_at then
    perform net.http_post(
      url := 'https://rtgwhchycfnfvwagilkw.supabase.co/functions/v1/notify-review-signin',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-trigger-secret', 'REPLACE_WITH_THE_REVIEW_SIGNIN_SECRET_VALUE'
      ),
      body := jsonb_build_object('signed_in_at', new.last_sign_in_at)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_review_account_signin on auth.users;

create trigger on_review_account_signin
  after update of last_sign_in_at on auth.users
  for each row
  execute function core.notify_review_signin();

-- To confirm it's registered:  select tgname from pg_trigger where tgname = 'on_review_account_signin';
-- To remove it entirely:       drop trigger on_review_account_signin on auth.users;
