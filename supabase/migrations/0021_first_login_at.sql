-- Ported from the standalone Nutrition Tracker app's own 0005_first_login_at
-- .sql, adapted for Kova's identity model. That app's clients.first_login_at
-- only tells us whether someone has ever logged into THAT app — meaningless
-- for a Kova-only member who'll never touch the standalone app at all. This
-- is the Kova-native equivalent: has this person ever actually opened Kova
-- and had their session resolve, regardless of which module (Programming,
-- Nutrition, SPC) they're using it for. Surfaced on the coach's nutrition
-- Onboarding list (app/(coach)/nutrition/onboarding.js) to distinguish
-- "hasn't done the onboarding tasks yet" from "has never even signed in" —
-- the real signal behind a real support problem (invite emails missed or
-- landing in spam, silently stalling a client's onboarding).
alter table core.users add column first_login_at timestamptz;

-- Same reasoning as 0020's update_own_notification_prefs: no plain RLS
-- "user can update own row" policy exists on core.users (deliberately — see
-- 0001), so this is a narrow security-definer RPC that can only ever set
-- this one column, and only once (no-ops if already set, so repeated calls
-- across every login are harmless).
create function core.stamp_own_first_login()
returns void
language sql
security definer
set search_path = core
as $$
  update core.users
  set first_login_at = now()
  where id = auth.uid() and first_login_at is null;
$$;

grant execute on function core.stamp_own_first_login() to authenticated;

-- New column needs the same PostgREST schema-cache nudge as new tables —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
