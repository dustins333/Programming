-- Programming module, Phase 5 scope: SPC (individualized, staggered-block
-- program builder + coach-grouped tracking dashboard + print export).
-- Widens program_comments to also target spc_blocks, per the note left in
-- 0004's header when program_comments was first scoped to group_block_id
-- only.

create table programming.spc_clients (
  user_id uuid primary key references core.users (id) on delete cascade,
  assigned_coach_id uuid references core.users (id),
  sessions_per_week smallint not null default 2,
  status text not null default 'needs_printed' check (status in
    ('printed_ready', 'needs_printed', 'new_program_asap', 'coming_up_next_week', 'paused')),
  notes_goals_feedback text,
  created_at timestamptz not null default now()
);

-- Row existence = "enrolled in SPC", same pattern as nutrition.nutrition_clients
-- — kept separate from client_program_assignments (which stays group-program-
-- only) so Hybrid (group + SPC) just works: a client can have both an
-- assignment row and a spc_clients row independently.

create table programming.spc_blocks (
  id uuid primary key default gen_random_uuid(),
  spc_client_id uuid not null references programming.spc_clients (user_id) on delete cascade,
  coach_id uuid not null references core.users (id),
  block_start_date date not null,
  block_length_weeks smallint not null default 4,
  block_end_date date not null,
  created_at timestamptz not null default now()
);

create index spc_blocks_client_idx on programming.spc_blocks (spc_client_id, block_start_date desc);

-- One row per session (Session 1..sessions_per_week) — unlike group_workouts,
-- there is no week_number here. An SPC block is one continuous progression
-- written once, not a session rewritten fresh each week, so week 1..N live
-- as columns on spc_exercise_weeks below rather than as separate workout
-- rows per week.
create table programming.spc_workouts (
  id uuid primary key default gen_random_uuid(),
  spc_block_id uuid not null references programming.spc_blocks (id) on delete cascade,
  session_number smallint not null check (session_number >= 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spc_block_id, session_number)
);

create table programming.spc_workout_warmups (
  id uuid primary key default gen_random_uuid(),
  spc_workout_id uuid not null references programming.spc_workouts (id) on delete cascade,
  exercise_id uuid references programming.exercises (id),
  position smallint not null,
  label text,
  sets text,
  reps text,
  notes text
);

create index sww_workout_idx on programming.spc_workout_warmups (spc_workout_id, position);

-- Base exercise row — no sets/reps/rest here, those are per-week
-- (spc_exercise_weeks) since progression is the whole point of the SPC
-- print template's week-column layout.
create table programming.spc_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  spc_workout_id uuid not null references programming.spc_workouts (id) on delete cascade,
  exercise_id uuid not null references programming.exercises (id),
  position smallint not null,
  notes text
);

create index swe_workout_idx on programming.spc_workout_exercises (spc_workout_id, position);

-- coach_initials/touched_date are app-stamped on every edit to that week's
-- cell (editing coach's initials + todayInBoise()) — this is what "tracking
-- when it was last touched" means per the print template, not a manual
-- entry field.
create table programming.spc_exercise_weeks (
  id uuid primary key default gen_random_uuid(),
  spc_workout_exercise_id uuid not null references programming.spc_workout_exercises (id) on delete cascade,
  week_number smallint not null,
  sets int,
  reps text,
  rest text,
  coach_initials text,
  touched_date date,
  unique (spc_workout_exercise_id, week_number)
);

create index sew_exercise_idx on programming.spc_exercise_weeks (spc_workout_exercise_id, week_number);

-- Widen program_comments to also allow targeting an spc_block instead of a
-- group_block — exactly one of the two must be set.
alter table programming.program_comments add column spc_block_id uuid references programming.spc_blocks (id) on delete cascade;
alter table programming.program_comments alter column group_block_id drop not null;
alter table programming.program_comments add constraint program_comments_one_target check (
  (group_block_id is not null and spc_block_id is null) or (group_block_id is null and spc_block_id is not null)
);
create index program_comments_spc_block_idx on programming.program_comments (spc_block_id, created_at);

-- RLS

alter table programming.spc_clients enable row level security;
alter table programming.spc_blocks enable row level security;
alter table programming.spc_workouts enable row level security;
alter table programming.spc_workout_warmups enable row level security;
alter table programming.spc_workout_exercises enable row level security;
alter table programming.spc_exercise_weeks enable row level security;

create policy "staff manage spc_clients" on programming.spc_clients
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own spc_clients row" on programming.spc_clients
  for select using (user_id = auth.uid());

create policy "staff manage spc_blocks" on programming.spc_blocks
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own spc_blocks" on programming.spc_blocks
  for select using (spc_client_id = auth.uid());

create policy "staff manage spc_workouts" on programming.spc_workouts
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads published own spc_workouts" on programming.spc_workouts
  for select using (
    status = 'published'
    and exists (
      select 1 from programming.spc_blocks sb
      where sb.id = spc_workouts.spc_block_id and sb.spc_client_id = auth.uid()
    )
  );

create policy "staff manage spc_workout_warmups" on programming.spc_workout_warmups
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads published own spc_workout_warmups" on programming.spc_workout_warmups
  for select using (
    exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_warmups.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
    )
  );

create policy "staff manage spc_workout_exercises" on programming.spc_workout_exercises
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads published own spc_workout_exercises" on programming.spc_workout_exercises
  for select using (
    exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_exercises.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
    )
  );

create policy "staff manage spc_exercise_weeks" on programming.spc_exercise_weeks
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads published own spc_exercise_weeks" on programming.spc_exercise_weeks
  for select using (
    exists (
      select 1 from programming.spc_workout_exercises swe
      join programming.spc_workouts sw on sw.id = swe.spc_workout_id
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where swe.id = spc_exercise_weeks.spc_workout_exercise_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
    )
  );

-- Same Data-API permission dance as every schema-adding migration before
-- this one (0003's note, repeated defensively in 0004) — GRANT is
-- table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
