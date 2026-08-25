-- 0088: move the notes stranded in logs.notes into the shared store (0087).
--
-- 0087 made programming.exercise_coaching_notes THE note on a lift, but left
-- everything written before it where it was, on the log rows. The result was
-- exactly half a merge: a note a coach wrote at the TV showed up everywhere,
-- while a note the client had typed on her phone was still invisible to the
-- board — which is what was reported the moment 0087 went onto the dev server.
--
-- 266 distinct notes across 50 members, measured before writing this.
--
-- What is deliberately NOT migrated:
--   * truecoach_import_id is not null — 4,504 rows whose `notes` is the whole
--     raw TrueCoach result block copied verbatim onto every set (0066). These
--     are imported history, not anything anyone said, and pulling them in
--     would bury real coaching notes under years of text. This is the reason
--     0087 chose a display-time fallback over a backfill in the first place;
--     excluding on the import id makes the backfill safe and lets the shared
--     store simply BE the truth.
--   * empty/whitespace-only notes.
--
-- logs.notes is left in place and still read as a fallback, because members on
-- an older native build keep writing there until a new build ships.

insert into programming.exercise_coaching_notes
  (user_id, exercise_id, author_id, author_name, body,
   spc_workout_id, group_workout_id, one_off_workout_id, week_number, created_at)
select
  d.user_id,
  d.exercise_id,
  -- The member wrote it: logs.notes is her own session log, and nothing else
  -- has ever written to it. Attributing it to a coach would be a guess.
  d.user_id,
  u.name,
  d.notes,
  d.spc_workout_id,
  d.group_workout_id,
  d.one_off_workout_id,
  d.week_number,
  d.created_at
from (
  -- logResult copied the same text onto every set row of a lift, so collapse
  -- to one note per (member, lift, date, session) and take the earliest set's.
  select distinct on (l.user_id, l.exercise_id, l.date_performed,
                      l.spc_workout_id, l.group_workout_id, l.one_off_workout_id)
         l.user_id, l.exercise_id, l.notes, l.week_number,
         l.spc_workout_id, l.group_workout_id, l.one_off_workout_id,
         l.created_at
    from programming.logs l
   where l.notes is not null
     and btrim(l.notes) <> ''
     and l.truecoach_import_id is null
     and l.exercise_id is not null
   order by l.user_id, l.exercise_id, l.date_performed,
            l.spc_workout_id, l.group_workout_id, l.one_off_workout_id,
            l.set_number nulls last
) d
join core.users u on u.id = d.user_id
-- Re-runnable: skip anything already carried across. Matching on the text as
-- well as the lift means a genuine later note on the same lift is untouched.
where not exists (
  select 1 from programming.exercise_coaching_notes n
   where n.user_id = d.user_id
     and n.exercise_id = d.exercise_id
     and n.body = d.notes
);

notify pgrst, 'reload schema';
