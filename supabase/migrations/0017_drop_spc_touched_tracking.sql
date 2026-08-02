-- Dropping the "last touched" (coach_initials/touched_date) tracking on
-- spc_workout_exercises, added in 0016 as a straight carry-over of the old
-- per-week model's stamp — per direct feedback it wasn't providing enough
-- value to be worth the confusion (it showed a bare, unlabeled date next to
-- any edited row). No app code reads or writes these columns anymore.
alter table programming.spc_workout_exercises drop column coach_initials;
alter table programming.spc_workout_exercises drop column touched_date;
