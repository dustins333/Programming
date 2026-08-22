-- SPC Live Hub — design pass v1 (design_handoff_spc_hub_v1).
--
-- Three additions, all driven by one constraint from 0071: the wall display
-- signs in as its own account with NO read policy on core.users at all, and
-- no read of any client outside the open hub session. Anything the TV needs
-- to *show* about a person therefore has to be either snapshotted onto a row
-- it can already read, or served by a security-definer function.
--
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.

-- ---------------------------------------------------------------------------
-- 1. Note attribution — snapshot the author's name onto the note.
--
-- The design shows every saved note attributed by first name ("— Georgie")
-- in the history strip and the dock's block history. author_id already
-- exists, but resolving it to a name means reading core.users, which the
-- display account cannot do. Same answer 0071 already used for
-- hub_session_clients.client_name: snapshot the name at write time.
-- Nullable with no backfill — notes written before this render unattributed,
-- which is honest rather than guessed.
-- ---------------------------------------------------------------------------
alter table programming.exercise_coaching_notes add column author_name text;

-- Likewise the session's coach: the TV writes notes on that coach's behalf
-- (it is a device, not a person) and needs their name to attribute with.
alter table programming.hub_sessions add column coach_name text;

-- ---------------------------------------------------------------------------
-- 2. Idle-screen stats.
--
-- The board spends most of the day idle showing a clock, the gym's weekly
-- session count, and a rotating list of recent bests. Both figures are
-- gym-wide, and the display account is scoped to the open session's clients
-- only — so this is a security-definer function returning the aggregate and
-- nothing else, rather than any widening of what the TV can read.
--
-- Recent bests are member first names + numbers on a wall in a shared room,
-- so they are OFF unless core.settings.hub_idle_show_recent_bests is true
-- (Terra's call, 2026-08-22). The gate lives here, not in the client, so the
-- TV never even receives the rows when it is off — and it needs no read on
-- core.settings, which it also has no policy for.
--
-- "Best" mirrors the app's own PR rule closely enough to be honest: a lift
-- logged in the last 7 days beating that client's own previous best, and
-- only once they have at least 2 earlier days of that lift on record (so a
-- first-ever log is never announced as a personal best). Reps-only lifts
-- (exercises.tracks_weight = false) are judged on reps, matching
-- getExerciseStats / countPersonalRecordsOn.
-- ---------------------------------------------------------------------------
create function programming.hub_idle_stats()
returns jsonb
language plpgsql
security definer
set search_path = programming, core, public
stable
as $$
declare
  v_today date;
  v_cutoff date;
  v_sessions integer;
  v_show boolean;
  v_bests jsonb;
begin
  if not (core.is_gym_display() or core.is_staff()) then
    raise exception 'not authorised';
  end if;

  v_today := (now() at time zone 'America/Boise')::date;
  -- Monday-start week, matching how every other week in this app is counted.
  select count(*) into v_sessions
  from programming.session_completions
  where completed_at >= date_trunc('week', v_today::timestamp);

  select coalesce(
    (select value = 'true'::jsonb from core.settings where key = 'hub_idle_show_recent_bests'),
    false
  ) into v_show;

  if not v_show then
    return jsonb_build_object('sessions_this_week', v_sessions, 'bests', '[]'::jsonb);
  end if;

  v_cutoff := v_today - 7;

  with recent as (
    select distinct on (l.user_id, l.exercise_id)
      l.user_id, l.exercise_id, l.reps, l.weight, l.date_performed
    from programming.logs l
    where l.date_performed >= v_cutoff
      and l.truecoach_import_id is null
      and (l.weight is not null or l.reps is not null)
    order by l.user_id, l.exercise_id,
             l.weight desc nulls last, l.reps desc nulls last, l.date_performed desc
  ),
  prior as (
    select l.user_id, l.exercise_id,
           max(l.weight) as max_w,
           max(l.reps) as max_r,
           count(distinct l.date_performed) as days
    from programming.logs l
    where l.date_performed < v_cutoff
      and l.truecoach_import_id is null
    group by 1, 2
  )
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_bests
  from (
    select split_part(u.name, ' ', 1) as who,
           e.name as lift,
           r.reps as reps,
           r.weight as weight,
           e.tracks_weight as tracks_weight
    from recent r
    join prior p on p.user_id = r.user_id and p.exercise_id = r.exercise_id
    join core.users u on u.id = r.user_id
    join programming.exercises e on e.id = r.exercise_id
    where u.role = 'member'
      and not u.is_gym_display
      and p.days >= 2
      and (
        (e.tracks_weight and r.weight is not null and r.weight > coalesce(p.max_w, -1))
        or ((not e.tracks_weight) and r.reps is not null and r.reps > coalesce(p.max_r, -1))
      )
    order by r.date_performed desc, r.weight desc nulls last
    limit 8
  ) t;

  return jsonb_build_object('sessions_this_week', v_sessions, 'bests', v_bests);
end;
$$;

grant execute on function programming.hub_idle_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The setting row itself, explicitly off. The function coalesces a
--    missing row to false anyway; this exists so the admin toggle in
--    Settings → Equipment has something to render before it is first flipped.
-- ---------------------------------------------------------------------------
insert into core.settings (key, value)
values ('hub_idle_show_recent_bests', 'false'::jsonb)
on conflict (key) do nothing;
