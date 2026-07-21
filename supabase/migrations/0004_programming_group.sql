-- Programming module, Phase 2 scope: exercise library + the group-program
-- workout builder (Flagship/Better With Age). SPC's own tables come later
-- (Phase 5) — program_comments is scoped to group_block_id only for now
-- and will be widened with an ALTER once spc_blocks exists, same reasoning
-- as the original plan's migration-ordering note.

create table programming.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null check (muscle_group in
    ('chest', 'back', 'shoulders', 'legs', 'glutes', 'core', 'arms', 'full_body')),
  movement_pattern text check (movement_pattern in
    ('squat', 'lunge', 'hinge', 'core', 'row', 'horizontal_push', 'vertical_pull', 'vertical_push')),
  cues text,
  video_url text,
  is_active boolean not null default true,
  created_by uuid references core.users (id),
  created_at timestamptz not null default now()
);

create index exercises_muscle_group_idx on programming.exercises (muscle_group) where is_active;

create table programming.group_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('Flagship', 'Better With Age')),
  block_length_weeks int not null,
  sessions_per_week int not null default 3
);

insert into programming.group_programs (name, block_length_weeks) values
  ('Flagship', 4),
  ('Better With Age', 6)
on conflict (name) do nothing;

create table programming.group_blocks (
  id uuid primary key default gen_random_uuid(),
  group_program_id uuid not null references programming.group_programs (id),
  block_start_date date not null,
  block_end_date date not null,
  created_by uuid references core.users (id),
  created_at timestamptz not null default now()
);

create index group_blocks_program_idx on programming.group_blocks (group_program_id, block_start_date desc);

-- Publish/draft lives here, per-session-per-week, not on the block — a
-- coach can publish week 1 while week 3 is still a draft, and can edit a
-- published week anytime with no locking (per spec).
create table programming.group_workouts (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references programming.group_blocks (id) on delete cascade,
  session_number smallint not null check (session_number between 1 and 3),
  week_number smallint not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, session_number, week_number)
);

create table programming.group_workout_warmups (
  id uuid primary key default gen_random_uuid(),
  group_workout_id uuid not null references programming.group_workouts (id) on delete cascade,
  exercise_id uuid references programming.exercises (id),
  position smallint not null,
  label text,
  sets text,
  reps text,
  notes text
);

create index gww_workout_idx on programming.group_workout_warmups (group_workout_id, position);

create table programming.group_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  group_workout_id uuid not null references programming.group_workouts (id) on delete cascade,
  exercise_id uuid not null references programming.exercises (id),
  position smallint not null,
  sets int default 3,
  reps text default '10',
  tempo text,
  notes text
);

create index gwe_workout_idx on programming.group_workout_exercises (group_workout_id, position);

create table programming.client_program_assignments (
  user_id uuid primary key references core.users (id) on delete cascade,
  group_program_id uuid references programming.group_programs (id)
);

-- Keyed by exercise_id directly (not by which program it came from) so
-- "what did she do last time on lateral raises" works regardless of
-- source — drives the builder's prefill and (Phase 3) the client portal's
-- per-exercise history.
create table programming.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  exercise_id uuid not null references programming.exercises (id),
  date_performed date not null,
  sets int,
  reps int,
  weight numeric,
  notes text,
  source text not null check (source in ('flagship', 'bwa', 'spc')),
  created_at timestamptz not null default now()
);

create index logs_user_exercise_idx on programming.logs (user_id, exercise_id, date_performed desc);

create table programming.program_comments (
  id uuid primary key default gen_random_uuid(),
  group_block_id uuid not null references programming.group_blocks (id) on delete cascade,
  coach_id uuid not null references core.users (id),
  comment_text text not null,
  created_at timestamptz not null default now()
);

create index program_comments_block_idx on programming.program_comments (group_block_id, created_at);

-- RLS

alter table programming.exercises enable row level security;
alter table programming.group_programs enable row level security;
alter table programming.group_blocks enable row level security;
alter table programming.group_workouts enable row level security;
alter table programming.group_workout_warmups enable row level security;
alter table programming.group_workout_exercises enable row level security;
alter table programming.client_program_assignments enable row level security;
alter table programming.logs enable row level security;
alter table programming.program_comments enable row level security;

create policy "staff read all exercises" on programming.exercises
  for select using (core.is_staff());
create policy "authenticated read active exercises" on programming.exercises
  for select using (auth.uid() is not null and is_active);
create policy "staff insert exercises" on programming.exercises
  for insert with check (core.is_staff());
create policy "staff update exercises" on programming.exercises
  for update using (core.is_staff()) with check (core.is_staff());

create policy "authenticated read group_programs" on programming.group_programs
  for select using (auth.uid() is not null);
create policy "admin manage group_programs" on programming.group_programs
  for all using (core.is_admin()) with check (core.is_admin());

create policy "staff manage group_blocks" on programming.group_blocks
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads assigned group_blocks" on programming.group_blocks
  for select using (
    exists (
      select 1 from programming.client_program_assignments cpa
      where cpa.user_id = auth.uid() and cpa.group_program_id = group_blocks.group_program_id
    )
  );

create policy "staff manage group_workouts" on programming.group_workouts
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads published assigned workouts" on programming.group_workouts
  for select using (
    status = 'published'
    and exists (
      select 1 from programming.group_blocks gb
      join programming.client_program_assignments cpa on cpa.group_program_id = gb.group_program_id
      where gb.id = group_workouts.block_id and cpa.user_id = auth.uid()
    )
  );

create policy "staff manage group_workout_warmups" on programming.group_workout_warmups
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads published assigned warmups" on programming.group_workout_warmups
  for select using (
    exists (
      select 1 from programming.group_workouts gw
      join programming.group_blocks gb on gb.id = gw.block_id
      join programming.client_program_assignments cpa on cpa.group_program_id = gb.group_program_id
      where gw.id = group_workout_warmups.group_workout_id
        and gw.status = 'published'
        and cpa.user_id = auth.uid()
    )
  );

create policy "staff manage group_workout_exercises" on programming.group_workout_exercises
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads published assigned exercises" on programming.group_workout_exercises
  for select using (
    exists (
      select 1 from programming.group_workouts gw
      join programming.group_blocks gb on gb.id = gw.block_id
      join programming.client_program_assignments cpa on cpa.group_program_id = gb.group_program_id
      where gw.id = group_workout_exercises.group_workout_id
        and gw.status = 'published'
        and cpa.user_id = auth.uid()
    )
  );

create policy "staff manage assignments" on programming.client_program_assignments
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own assignment" on programming.client_program_assignments
  for select using (user_id = auth.uid());

create policy "staff manage logs" on programming.logs
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member manages own logs" on programming.logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff manage program_comments" on programming.program_comments
  for all using (core.is_staff()) with check (core.is_staff());

-- New tables in an already-exposed/granted schema still need the same
-- Data-API permission dance as 0003 — GRANT is table-specific, not
-- schema-wide, so it has to be repeated for every table added after that
-- migration ran (the `alter default privileges` in 0003 only covers
-- tables created after it, but doing this explicitly here is cheap
-- insurance against relying on that ordering).
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
