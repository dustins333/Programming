-- Adds a Lift/Warm-up type split to the exercise library (design handoff
-- v1-update, "Exercise Library" section). A warm-up exercise has no
-- muscle_group/movement_pattern (not applicable — it's not part of the
-- movement-pattern balance tally) but gets a default sets/reps pair that
-- pre-fills when it's inserted into a session's warm-up slot.

alter table programming.exercises
  add column type text not null default 'lift' check (type in ('lift', 'warmup'));

-- Not applicable to warm-ups, so this can no longer be a blanket not-null —
-- createExercise/updateExercise still always set it for type='lift'.
alter table programming.exercises alter column muscle_group drop not null;

alter table programming.exercises add column default_sets int;
alter table programming.exercises add column default_reps text;

-- NOTIFY pgrst, 'reload schema'; -- run this after, same as every prior migration that alters a schema PostgREST caches.
