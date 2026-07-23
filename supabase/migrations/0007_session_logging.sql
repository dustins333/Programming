-- Per-set logging: a `logs` row now represents one set (its own reps/weight),
-- not a whole exercise's summary — lets a member capture 3x10/3x8/3x8, or an
-- ascending-weight set, individually. Existing rows default to set_number 1
-- and remain valid as single-row historical summaries; no backfill needed.
alter table programming.logs add column set_number smallint not null default 1;

-- Tracks whether a member has finalized a given session. Group sessions are
-- keyed by the specific week+session's group_workout row (already unique
-- per week, so week_number isn't needed there); SPC sessions repeat weekly
-- off one spc_workout row (SPC has no per-week workout rows — weeks live as
-- columns via spc_exercise_weeks), so week_number is required to tell one
-- week's completion from another's.
create table programming.session_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  group_workout_id uuid references programming.group_workouts (id) on delete cascade,
  spc_workout_id uuid references programming.spc_workouts (id) on delete cascade,
  week_number smallint,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (group_workout_id is not null and spc_workout_id is null and week_number is null) or
    (group_workout_id is null and spc_workout_id is not null and week_number is not null)
  )
);

-- Partial unique indexes instead of one table-wide unique constraint since
-- exactly one of group_workout_id/spc_workout_id is set per row (the check
-- constraint above) and the "one completion per session" key differs
-- between the two cases.
create unique index session_completions_group_uidx on programming.session_completions (user_id, group_workout_id) where group_workout_id is not null;
create unique index session_completions_spc_uidx on programming.session_completions (user_id, spc_workout_id, week_number) where spc_workout_id is not null;

create index session_completions_user_idx on programming.session_completions (user_id);

alter table programming.session_completions enable row level security;

-- Same shape as core.push_tokens (0002): member fully manages their own
-- rows, staff get read-only (coaches don't need to edit completion status,
-- just see it later on dashboards).
create policy "member manages own session completions" on programming.session_completions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff can read session completions" on programming.session_completions
  for select using (core.is_staff());

-- Same Data-API permission dance as every schema-adding migration before
-- this one (0003's note) — GRANT is table-specific, not schema-wide, so
-- this new table needs it explicitly even though 0003's default privileges
-- should already cover it.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
