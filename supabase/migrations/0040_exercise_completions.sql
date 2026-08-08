-- Per-exercise "mark complete" checkbox on My Fitness's focus-mode logging
-- screen — distinct from both programming.logs (the actual reps/weight,
-- autosaved) and programming.session_completions (the whole session's
-- finalize state). A member can mark one lift done even before every set
-- has numbers in it ("I did the exercise, just didn't log exact numbers"),
-- so this needs its own genuinely separate completion signal.
--
-- Same XOR-of-three shape as session_completions (0007/0008): group is
-- keyed by the join-row alone (group_workout_exercises.id is already
-- week/session-specific), SPC additionally needs week_number since
-- spc_workout_exercises rows recur across every week of the block (same
-- reason session_completions needs it for SPC), one-off needs neither.
-- Row existence = complete (no boolean column) — unlike a session
-- finalize, un-marking a single exercise is a normal, expected, reversible
-- action with no history value worth keeping, so un-marking just deletes
-- the row.
create table programming.exercise_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  group_workout_exercise_id uuid references programming.group_workout_exercises (id) on delete cascade,
  spc_workout_exercise_id uuid references programming.spc_workout_exercises (id) on delete cascade,
  week_number smallint,
  one_off_exercise_id uuid references programming.one_off_exercises (id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (group_workout_exercise_id is not null and spc_workout_exercise_id is null and one_off_exercise_id is null and week_number is null) or
    (group_workout_exercise_id is null and spc_workout_exercise_id is not null and one_off_exercise_id is null and week_number is not null) or
    (group_workout_exercise_id is null and spc_workout_exercise_id is null and one_off_exercise_id is not null and week_number is null)
  )
);

-- Partial unique indexes instead of one table-wide unique constraint, same
-- reasoning as session_completions' own indexes — exactly one of the three
-- FK columns is set per row (the check constraint above), and the "one
-- completion per exercise" key differs between the three cases.
create unique index exercise_completions_group_uidx on programming.exercise_completions (user_id, group_workout_exercise_id) where group_workout_exercise_id is not null;
create unique index exercise_completions_spc_uidx on programming.exercise_completions (user_id, spc_workout_exercise_id, week_number) where spc_workout_exercise_id is not null;
create unique index exercise_completions_one_off_uidx on programming.exercise_completions (user_id, one_off_exercise_id) where one_off_exercise_id is not null;

create index exercise_completions_user_idx on programming.exercise_completions (user_id);

alter table programming.exercise_completions enable row level security;

-- Same shape as session_completions (0007): member fully manages their own
-- rows, staff get read-only.
create policy "member manages own exercise completions" on programming.exercise_completions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff can read exercise completions" on programming.exercise_completions
  for select using (core.is_staff());

-- Same Data-API permission dance as every schema-adding migration before
-- this one (0003's note) — GRANT is table-specific, not schema-wide, so
-- this new table needs it explicitly even though 0003's default privileges
-- should already cover it.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
