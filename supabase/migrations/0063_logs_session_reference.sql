-- A log row now knows which session it came from.
--
-- Until this, a row's identity was (user_id, exercise_id, date_performed,
-- set_number) and nothing more — which broke in two ways once a member
-- logged more than one session on the same calendar date (logging a whole
-- week at once, most commonly):
--
--   1. Cosmetic: every "what did she do that day" reader pulled every row on
--      that date with no way to split it, so three sessions finalized in one
--      evening rendered all of their lifts under each one. coachLogs.js's
--      exerciseIdsForCompletion() is the heuristic that papered over this,
--      and its own comment says it needs this column.
--   2. Not cosmetic: the same lift programmed in two same-day sessions has
--      an IDENTICAL key for set 1 in both, so logResult's select-then-update
--      upsert found the first session's row and OVERWROTE it. Silent data
--      loss, no error.
--
-- The session identity mirrors programming.session_completions (0007/0008)
-- exactly rather than inventing a new one: group keys off the group_workout
-- row alone (already unique per week), SPC needs week_number too (one
-- spc_workouts row recurs across every week of its block), one-offs need
-- neither.
--
-- Deliberately NOT a reference to session_completions itself: a completion
-- row only exists once the member taps Finalize, but autosave writes logs
-- continuously from the first keystroke. Every set would be written null and
-- need back-stamping at finalize time.

alter table programming.logs
  add column group_workout_id uuid references programming.group_workouts (id) on delete set null,
  add column spc_workout_id uuid references programming.spc_workouts (id) on delete set null,
  add column week_number smallint,
  add column one_off_workout_id uuid references programming.one_off_workouts (id) on delete set null;

-- ON DELETE SET NULL, not cascade — unlike session_completions, where the
-- completion is meaningless without its workout. A member's training history
-- must survive a coach deleting the session it was programmed from; it
-- degrades to "logged on this date, session unknown", which is exactly the
-- state every pre-migration row is already in.

-- No exactly-one-of check constraint, unlike session_completions_check.
-- Every existing row is all-null and has to stay valid, so "unknown" is a
-- legal fourth state here and always will be for historical data.

create index logs_group_workout_idx on programming.logs (group_workout_id) where group_workout_id is not null;
create index logs_spc_workout_idx on programming.logs (spc_workout_id) where spc_workout_id is not null;
create index logs_one_off_workout_idx on programming.logs (one_off_workout_id) where one_off_workout_id is not null;

-- logs_user_exercise_idx (user_id, exercise_id, date_performed) already
-- covers logResult's lookup; the session columns are an equality filter on
-- top of an already-tiny result set, so no new composite is needed.

-- ---------------------------------------------------------------- backfill
--
-- Best-effort and deliberately conservative. A finalized session tells us
-- (user, Boise-local date of completed_at, that workout's exercise list), so
-- most historical rows resolve. Two cases stay null, correctly:
--
--   - a lift that appears in TWO completions on the same date. That's the
--     genuinely unresolvable case — and where the overwrite bug already
--     destroyed one of the two sessions' numbers, so there is nothing to
--     recover even in principle.
--   - logs on a date with no completion at all (never finalized).
--
-- Only ever touches rows whose session columns are all null, so it is
-- re-runnable and cannot overwrite anything written by the app.

with candidates as (
  select l.id as log_id, c.group_workout_id as gw, null::uuid as sw, null::smallint as wk, null::uuid as ow
    from programming.logs l
    join programming.session_completions c
      on c.user_id = l.user_id
     and (c.completed_at at time zone 'America/Boise')::date = l.date_performed
     and c.group_workout_id is not null
    join programming.group_workout_exercises gwe
      on gwe.group_workout_id = c.group_workout_id
     and gwe.exercise_id = l.exercise_id
   where l.group_workout_id is null and l.spc_workout_id is null and l.one_off_workout_id is null

  union

  select l.id, null::uuid, c.spc_workout_id, c.week_number, null::uuid
    from programming.logs l
    join programming.session_completions c
      on c.user_id = l.user_id
     and (c.completed_at at time zone 'America/Boise')::date = l.date_performed
     and c.spc_workout_id is not null
    join programming.spc_workout_exercises swe
      on swe.spc_workout_id = c.spc_workout_id
     and swe.exercise_id = l.exercise_id
   where l.group_workout_id is null and l.spc_workout_id is null and l.one_off_workout_id is null

  union

  select l.id, null::uuid, null::uuid, null::smallint, c.one_off_workout_id
    from programming.logs l
    join programming.session_completions c
      on c.user_id = l.user_id
     and (c.completed_at at time zone 'America/Boise')::date = l.date_performed
     and c.one_off_workout_id is not null
    join programming.one_off_exercises ooe
      on ooe.one_off_workout_id = c.one_off_workout_id
     and ooe.exercise_id = l.exercise_id
   where l.group_workout_id is null and l.spc_workout_id is null and l.one_off_workout_id is null
),
-- UNION (not UNION ALL) above already collapses an exercise listed twice in
-- the same workout, so a count of 1 here genuinely means "exactly one
-- session could have produced this row".
unambiguous as (
  select log_id, gw, sw, wk, ow
    from candidates
   where log_id in (select log_id from candidates group by log_id having count(*) = 1)
)
update programming.logs l
   set group_workout_id = u.gw,
       spc_workout_id = u.sw,
       week_number = u.wk,
       one_off_workout_id = u.ow
  from unambiguous u
 where l.id = u.log_id;

-- Run `NOTIFY pgrst, 'reload schema';` after this — new columns need it the
-- same as new tables do.
