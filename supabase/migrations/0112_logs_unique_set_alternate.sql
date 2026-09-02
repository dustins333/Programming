-- Widens logs_unique_set_idx to include alternate_session_id (0110), so two
-- different away sessions logged on the same day for the same lift and set
-- number stay separate rows instead of colliding.
--
-- ORDER MATTERS. Run this only AFTER the app deploy that removes the
-- explicit conflict-target column list from logResult() in
-- lib/programming/memberPlan.js. Postgres resolves an ON CONFLICT column
-- list against a unique index with EXACTLY those columns; widen the index
-- while any client is still naming the old nine and that client fails with
-- 42P10 on every new set it tries to insert. That is not theoretical — it
-- happened while 0110 was being written, and production inserts were broken
-- until the index was restored.
--
-- logResult is index-agnostic now (plain insert, and a unique violation
-- falls back to re-reading the row and updating it), so nothing names a
-- column list any more and this is safe to apply whenever.
--
-- Rollback: drop this index and recreate it without alternate_session_id.
drop index if exists programming.logs_unique_set_idx;
create unique index logs_unique_set_idx on programming.logs (
  user_id, exercise_id, date_performed, set_number,
  group_workout_id, spc_workout_id, one_off_workout_id, alternate_session_id,
  truecoach_import_id, week_number
) nulls not distinct;
