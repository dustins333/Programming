-- Two coach-side exercise-library asks from the same batch of feedback:
--
-- 1. Muscle group / movement pattern become multi-select on exercise
--    creation/edit (e.g. a single exercise can hit both "back" and "legs").
--    Both columns move from scalar text to text[]. Every consumer in the
--    app already groups/filters these client-side via .filter()/.includes()
--    rather than relying on the DB to do it, so this is a pure column-type
--    change — no server-side query logic depends on the old scalar shape.
--
-- 2. Lift variations (e.g. Squat -> Goblet/Front Rack/Lateral Squat) can be
--    grouped under a parent movement for browsing in the builder sidebar.
--    Deliberately browsing-time only, per direct confirmation — a variation
--    is still its own real, independently-selectable/loggable exercise;
--    History/PR tracking is untouched. Nesting is capped at one level by
--    application logic (the "Variation of" picker only ever offers
--    parent-less exercises) rather than a DB constraint — proportionate for
--    a small coach-authored library with no adversarial input.

-- --- muscle_group / movement_pattern: text -> text[] -------------------

-- Unnamed column-level checks from 0004 get Postgres' default generated
-- name (<table>_<column>_check) — same convention already relied on in
-- 0022/0028. If either DROP below silently no-ops due to a name mismatch,
-- check `\d programming.exercises` in the SQL Editor and follow up.
alter table programming.exercises drop constraint if exists exercises_muscle_group_check;
alter table programming.exercises drop constraint if exists exercises_movement_pattern_check;

-- Scalar index is meaningless once the column is an array (nothing queries
-- it server-side anyway — every consumer filters client-side).
drop index if exists programming.exercises_muscle_group_idx;

alter table programming.exercises
  alter column muscle_group type text[]
  using (case when muscle_group is null then null else array[muscle_group] end);
alter table programming.exercises
  alter column movement_pattern type text[]
  using (case when movement_pattern is null then null else array[movement_pattern] end);

alter table programming.exercises add constraint exercises_muscle_group_check
  check (muscle_group is null or muscle_group <@ array['chest', 'back', 'shoulders', 'legs', 'glutes', 'core', 'arms', 'full_body']::text[]);
alter table programming.exercises add constraint exercises_movement_pattern_check
  check (movement_pattern is null or movement_pattern <@ array['squat', 'lunge', 'hinge', 'core', 'row', 'horizontal_push', 'vertical_pull', 'vertical_push']::text[]);

-- --- variations: parent_exercise_id ------------------------------------

alter table programming.exercises add column parent_exercise_id uuid references programming.exercises (id) on delete set null;
alter table programming.exercises add constraint exercises_parent_not_self check (parent_exercise_id is null or parent_exercise_id <> id);
create index exercises_parent_exercise_idx on programming.exercises (parent_exercise_id) where parent_exercise_id is not null;

-- Cheap insurance, same as every other schema-touching migration before
-- this one, even though this one only alters an existing table.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New/changed columns need the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
