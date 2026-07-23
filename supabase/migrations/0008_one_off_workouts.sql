-- Reusable workout templates (coach-built once, copied onto a client's
-- one-off assignment) and one-off workouts themselves (a template's content
-- copied onto one specific client, no recurrence, no scheduled date — an
-- open extra the member sees in My Fitness until they finish it). Two named
-- template use cases per the original ask: "away programming" for travel,
-- and "trial session A/B/C" for prospects who already have a core.users
-- login (linked in via the existing admin "Link account" flow) but no real
-- program enrollment yet.
--
-- Templates are single-prescription (no per-week progression) since a
-- one-off is used once — unlike SPC's spc_exercise_weeks, there's no need
-- for a separate per-week table here.
create table programming.workout_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('away', 'trial')),
  created_by uuid references core.users (id),
  created_at timestamptz not null default now()
);

create table programming.template_warmups (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references programming.workout_templates (id) on delete cascade,
  exercise_id uuid references programming.exercises (id),
  position int not null,
  label text
);

create table programming.template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references programming.workout_templates (id) on delete cascade,
  exercise_id uuid not null references programming.exercises (id),
  position int not null,
  sets int,
  reps text,
  rest text,
  notes text
);

-- Any client (group or SPC) can receive a one-off — it's keyed directly by
-- user_id, not by a program/block, so it works the same regardless of what
-- else that client is enrolled in. status mirrors group/spc's draft/
-- published convention, but createOneOffFromTemplate() always creates these
-- already published: a coach explicitly assigning a ready-made template is
-- a lighter action than building a session from scratch, so there's no
-- separate review step by default. The column stays so a coach can still
-- unpublish one if they assigned the wrong thing.
create table programming.one_off_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  source_template_id uuid references programming.workout_templates (id) on delete set null,
  title text not null,
  status text not null default 'published' check (status in ('draft', 'published')),
  assigned_by uuid references core.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table programming.one_off_warmups (
  id uuid primary key default gen_random_uuid(),
  one_off_workout_id uuid not null references programming.one_off_workouts (id) on delete cascade,
  exercise_id uuid references programming.exercises (id),
  position int not null,
  label text
);

create table programming.one_off_exercises (
  id uuid primary key default gen_random_uuid(),
  one_off_workout_id uuid not null references programming.one_off_workouts (id) on delete cascade,
  exercise_id uuid not null references programming.exercises (id),
  position int not null,
  sets int,
  reps text,
  rest text,
  notes text
);

create index one_off_workouts_user_idx on programming.one_off_workouts (user_id);

-- Extend session_completions (0007) for a third workout type. The existing
-- two-way check constraint and its name (session_completions_check) come
-- from Postgres' default naming for an unnamed table-level check — this is
-- the only such check on this table, so it should be the right name, but
-- if this DROP fails, run `\d programming.session_completions` (or check
-- the table's constraints in the table editor) to find the actual name and
-- adjust before re-running.
alter table programming.session_completions add column one_off_workout_id uuid references programming.one_off_workouts (id) on delete cascade;

alter table programming.session_completions drop constraint if exists session_completions_check;
alter table programming.session_completions add constraint session_completions_check check (
  (group_workout_id is not null and spc_workout_id is null and one_off_workout_id is null and week_number is null) or
  (group_workout_id is null and spc_workout_id is not null and one_off_workout_id is null and week_number is not null) or
  (group_workout_id is null and spc_workout_id is null and one_off_workout_id is not null and week_number is null)
);

create unique index if not exists session_completions_one_off_uidx on programming.session_completions (user_id, one_off_workout_id) where one_off_workout_id is not null;

-- Widen logs.source (0004) to allow one-off logging. Same naming caveat as
-- above: this is Postgres' default name for an unnamed column-level check
-- (logs_source_check) — verify via `\d programming.logs` if the DROP fails.
alter table programming.logs drop constraint if exists logs_source_check;
alter table programming.logs add constraint logs_source_check check (source in ('flagship', 'bwa', 'spc', 'one_off'));

alter table programming.workout_templates enable row level security;
alter table programming.template_warmups enable row level security;
alter table programming.template_exercises enable row level security;
alter table programming.one_off_workouts enable row level security;
alter table programming.one_off_warmups enable row level security;
alter table programming.one_off_exercises enable row level security;

-- Templates are a coach-only authoring surface — members never query these
-- tables directly, only the one_off_* copy made from them.
create policy "staff manage workout_templates" on programming.workout_templates
  for all using (core.is_staff()) with check (core.is_staff());
create policy "staff manage template_warmups" on programming.template_warmups
  for all using (core.is_staff()) with check (core.is_staff());
create policy "staff manage template_exercises" on programming.template_exercises
  for all using (core.is_staff()) with check (core.is_staff());

-- one_off_workouts: staff manage everything; a member reads only their own
-- published ones (same shape as group/spc's "member reads published
-- assigned X" policies, just keyed directly by user_id instead of a join
-- through an assignment/block).
create policy "staff manage one_off_workouts" on programming.one_off_workouts
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own published one_off_workouts" on programming.one_off_workouts
  for select using (status = 'published' and user_id = auth.uid());

create policy "staff manage one_off_warmups" on programming.one_off_warmups
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own published one_off_warmups" on programming.one_off_warmups
  for select using (
    exists (
      select 1 from programming.one_off_workouts oow
      where oow.id = one_off_warmups.one_off_workout_id
        and oow.status = 'published'
        and oow.user_id = auth.uid()
    )
  );

create policy "staff manage one_off_exercises" on programming.one_off_exercises
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own published one_off_exercises" on programming.one_off_exercises
  for select using (
    exists (
      select 1 from programming.one_off_workouts oow
      where oow.id = one_off_exercises.one_off_workout_id
        and oow.status = 'published'
        and oow.user_id = auth.uid()
    )
  );

-- Same Data-API permission dance as every schema-adding migration before
-- this one (0003's note) — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
