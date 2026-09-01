-- Members could not read core.settings.specialty_bars at all.
--
-- 0047 gave members a read policy on core.settings deliberately scoped to a
-- whitelist of keys, because that table is a shared bag (messaging kill
-- switch, payroll anchor, notification copy) and a blanket member read would
-- expose all of it. The whitelist was messaging-only, and when the weight
-- calculator's Specialty bar picker landed it read `specialty_bars` from the
-- same table without the whitelist being widened.
--
-- RLS filters rows rather than erroring, so `getSetting` saw zero rows, fell
-- back to its default `[]`, and the picker rendered "No specialty bars added
-- yet - a coach can add some in Settings > Equipment" to every member. Staff
-- read the same key through `core.is_staff()` and saw the real list, which is
-- why this only ever showed up as a member report.
--
-- The list is gym equipment (a trap bar weighs what it weighs), so there is
-- nothing here a member should not see. The policy is renamed because
-- "messaging settings" stopped describing it.
--
-- The `auth.uid() is not null` guard is preserved: `to public` includes anon,
-- and an RLS policy gates on the caller first and content state second.

drop policy if exists "members can read messaging settings" on core.settings;

create policy "members can read whitelisted settings"
  on core.settings for select
  using (
    auth.uid() is not null
    and key = any (array['messaging_enabled', 'messaging_audience', 'specialty_bars'])
  );

-- Rollback:
--   drop policy if exists "members can read whitelisted settings" on core.settings;
--   create policy "members can read messaging settings"
--     on core.settings for select
--     using (
--       auth.uid() is not null
--       and key = any (array['messaging_enabled', 'messaging_audience'])
--     );
