-- design_handoff_v2_settings_nutrition — new member-facing Settings screen
-- needs per-user notification toggles (Daily log reminder / Weekly check-in
-- available / Coach messages), distinct from the admin's existing gym-wide
-- toggles in core.settings (NOTIFICATION_TOGGLES in app/(coach)/settings.js)
-- — those gate whether a feature sends push AT ALL; these gate whether a
-- given member individually wants it. Default true on all three so nobody's
-- notifications silently change until they explicitly opt out, same
-- "unset = always-on" convention 0013/0015 already established.
--
-- "Coach messages" has no send path at all yet (no push fires today on a
-- new programming.program_comments row) — the toggle is real and persisted,
-- just inert until that feature exists.

alter table core.users add column notify_daily_log_reminder boolean not null default true;
alter table core.users add column notify_checkin_available boolean not null default true;
alter table core.users add column notify_coach_messages boolean not null default true;

-- No plain RLS "user can update own row" policy exists on core.users (see
-- 0001) — deliberately, since a permissive one would let a member write
-- ANY column on their own row via a raw client update, including `role`.
-- Instead: a narrow security-definer RPC that can only ever touch these 3
-- columns, callable by any authenticated user for their own row only. This
-- is the safe pattern for "let a user self-service one small slice of their
-- own row" that this schema didn't need until now.
create function core.update_own_notification_prefs(
  p_daily_log_reminder boolean,
  p_checkin_available boolean,
  p_coach_messages boolean
)
returns void
language sql
security definer
set search_path = core
as $$
  update core.users
  set notify_daily_log_reminder = p_daily_log_reminder,
      notify_checkin_available = p_checkin_available,
      notify_coach_messages = p_coach_messages
  where id = auth.uid();
$$;

grant execute on function core.update_own_notification_prefs(boolean, boolean, boolean) to authenticated;

-- New columns need the same PostgREST schema-cache nudge as new tables —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
