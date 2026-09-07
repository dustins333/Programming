-- Adds 'bridge' to the movement_pattern vocabulary.
--
-- Requested by the coaches: a glute bridge / hip thrust was being tagged
-- as 'hinge', which made the builder's movement-balance tally read as
-- though the week had more hinging in it than it did.
--
-- The list lives in three places and all three have to move together:
-- this file's two CHECK constraints plus MOVEMENT_PATTERNS in
-- lib/programming/exercises.js. Widening a CHECK is additive, so this can
-- be applied before or after the deploy without a window where either
-- half is broken -- an older bundle simply never offers the new value.
--
-- Rollback (only safe while nothing is tagged 'bridge'):
--   alter table programming.exercises drop constraint exercises_movement_pattern_check;
--   alter table programming.exercises add constraint exercises_movement_pattern_check
--     check (movement_pattern is null or movement_pattern <@ array['squat','lunge','hinge','core','row','horizontal_push','vertical_pull','vertical_push']::text[]);
--   alter table programming.exercise_parents drop constraint exercise_parents_movement_pattern_check;
--   alter table programming.exercise_parents add constraint exercise_parents_movement_pattern_check
--     check (movement_pattern is null or movement_pattern <@ array['squat','lunge','hinge','core','row','horizontal_push','vertical_pull','vertical_push']::text[]);

alter table programming.exercises drop constraint if exists exercises_movement_pattern_check;
alter table programming.exercises add constraint exercises_movement_pattern_check
  check (movement_pattern is null or movement_pattern <@ array[
    'squat', 'lunge', 'hinge', 'bridge', 'core', 'row',
    'horizontal_push', 'vertical_pull', 'vertical_push'
  ]::text[]);

alter table programming.exercise_parents drop constraint if exists exercise_parents_movement_pattern_check;
alter table programming.exercise_parents add constraint exercise_parents_movement_pattern_check
  check (movement_pattern is null or movement_pattern <@ array[
    'squat', 'lunge', 'hinge', 'bridge', 'core', 'row',
    'horizontal_push', 'vertical_pull', 'vertical_push'
  ]::text[]);
