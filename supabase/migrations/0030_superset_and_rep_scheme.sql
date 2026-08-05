-- Two more asks from the same feedback batch as 0029:
--
-- 1. Supersets — link two exercises within a session so a member does one
--    set of each back-to-back. Group + SPC builders only, not the reusable
--    Template builder (templates are single flat prescriptions, per direct
--    confirmation). superset_group_id is a plain shared pairing token, not
--    an FK to another table — two rows sharing the same non-null value are
--    a pair. No DB-level "exactly 2 members" enforcement; the builder UI
--    always claims both sides of a pairing atomically.
--
-- 2. Per-set rep scheme — a session's reps target stops being one flat
--    string for every set (e.g. set 1-2 = "10-12", set 3 = "1-8"). Verified
--    against the live schema before writing this: SPC was already
--    reworked in 0016 to match group_workout_exercises' flat one-row shape
--    (sets int, reps text, tempo/rest text, notes text) — the old
--    per-week spc_exercise_weeks progression table is long gone — so
--    group_workout_exercises, spc_workout_exercises, and template_exercises
--    are structurally identical and get the same rep_scheme jsonb column.
--    Existing rows are backfilled by repeating their current flat reps
--    value across their current sets count, so nothing regresses to a
--    blank scheme the first time an existing session is opened.

alter table programming.group_workout_exercises add column superset_group_id uuid;
alter table programming.spc_workout_exercises add column superset_group_id uuid;

alter table programming.group_workout_exercises add column rep_scheme jsonb;
alter table programming.spc_workout_exercises add column rep_scheme jsonb;
alter table programming.template_exercises add column rep_scheme jsonb;

update programming.group_workout_exercises
  set rep_scheme = to_jsonb(array_fill(reps, array[sets]))
  where rep_scheme is null and sets is not null and sets > 0;
update programming.spc_workout_exercises
  set rep_scheme = to_jsonb(array_fill(reps, array[sets]))
  where rep_scheme is null and sets is not null and sets > 0;
update programming.template_exercises
  set rep_scheme = to_jsonb(array_fill(reps, array[sets]))
  where rep_scheme is null and sets is not null and sets > 0;

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New columns need the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
