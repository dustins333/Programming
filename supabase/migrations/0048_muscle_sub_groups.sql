-- Finer muscle-group tagging on exercises: each of the eight existing
-- groups (0029's CHECK list) gains its own sub-options, so a coach can tag
-- "lats" or "rear delt" instead of only "back" or "shoulders".
--
-- Deliberately ADDITIVE, not a replacement. The eight top-level values stay
-- valid, so every exercise already tagged keeps its tag and keeps showing
-- up in the builder sidebar's buckets — a coach re-tags with finer detail
-- whenever they happen to be editing an exercise, not in one forced pass
-- through the whole library. Nothing anywhere requires a sub-group.
--
-- Storage is one tag per concept, not both: tagging "lats" does NOT also
-- store "back". Anything that needs the coarse group derives it in app
-- code (lib/programming/exercises.js's parentMuscleGroup), so the two can
-- never drift out of sync in the data.
--
-- Glutes and full body get no sub-options — there was nothing to split
-- them into, so they stay top-level-only.

-- 0029 named this constraint explicitly, so this DROP is exact rather than
-- relying on Postgres' generated-name convention.
alter table programming.exercises drop constraint if exists exercises_muscle_group_check;

alter table programming.exercises add constraint exercises_muscle_group_check
  check (muscle_group is null or muscle_group <@ array[
    -- top level (unchanged from 0029)
    'chest', 'back', 'shoulders', 'arms', 'legs', 'glutes', 'core', 'full_body',
    -- chest
    'upper_chest', 'lower_chest',
    -- back
    'lats', 'upper_back', 'lower_back',
    -- shoulders
    'front_delt', 'side_delt', 'rear_delt',
    -- arms
    'biceps', 'triceps', 'forearms',
    -- legs
    'quads', 'hamstrings', 'calves',
    -- core
    'abs', 'obliques'
  ]::text[]);

-- No new columns or tables, so PostgREST's schema cache is untouched by
-- this one — a CHECK change needs no reload. Harmless to send anyway.
