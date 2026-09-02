-- Alternate programming: coach-managed template categories, plus a second
-- way to assign a template — across a run of calendar weeks, instead of the
-- single open-ended one-off that 0008 introduced.
--
-- Why this exists, and what it is NOT: one-offs stay exactly as they are.
-- The ask was for away/travel programming, which is 1-3 sessions repeating
-- for a few weeks with a start date. Along the way it became clear that
-- "what a template is for" and "how it gets assigned" are two different
-- axes: a welcome week for a new member is a SINGLE session, and a trial
-- session is too, while an away block is several across weeks. So the
-- category names the purpose (coach-managed, below) and the assignment
-- shape is chosen separately. Nothing here is hardcoded to the word "away".

-- ---------------------------------------------------------------------
-- 1. Coach-managed template categories
-- ---------------------------------------------------------------------
-- workout_templates.category was `text not null check (category in
-- ('away','trial'))` — inventing a third use (welcome week) meant a
-- migration every time, so this is a real table the coach edits.
create table programming.template_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Same normalised-name uniqueness as exercise_parents (0095) — two
-- categories differing only by case or trailing space are the same
-- category, and a duplicate is how a template goes missing from the list
-- it's supposed to be in.
create unique index template_categories_name_uidx
  on programming.template_categories (lower(btrim(name)));

insert into programming.template_categories (name, position) values
  ('Away programming', 0),
  ('Trial sessions', 1),
  ('Welcome week', 2);

alter table programming.workout_templates
  add column category_id uuid references programming.template_categories (id) on delete set null;

-- on delete set null, not cascade: deleting a category must never delete
-- the templates inside it. They fall back to "Uncategorised" in the UI and
-- can be re-filed.
update programming.workout_templates t
  set category_id = c.id
  from programming.template_categories c
  where (t.category = 'away'  and c.name = 'Away programming')
     or (t.category = 'trial' and c.name = 'Trial sessions');

-- The old text column is left populated but no longer read or written by
-- the app — same rollback-path convention as exercises.parent_exercise_id
-- (0095). Its CHECK and NOT NULL have to go or new rows can't be inserted.
alter table programming.workout_templates drop constraint if exists workout_templates_category_check;
alter table programming.workout_templates alter column category drop not null;
comment on column programming.workout_templates.category is
  'Superseded by category_id (0110). Left populated as the rollback path; not read or written by the app.';

alter table programming.template_categories enable row level security;

create policy "staff read template categories" on programming.template_categories
  for select using (core.is_staff());

-- Managing the category list is the same permission as managing templates
-- themselves (0008 gates those on can_access_spc via the templates policy).
-- Kept to plain is_staff() here deliberately: a category is a label on a
-- list, and a coach who can create a template needs to be able to file it.
create policy "staff manage template categories" on programming.template_categories
  for all using (core.is_staff()) with check (core.is_staff());

-- ---------------------------------------------------------------------
-- 2. The assignment: templates repeating across N calendar weeks
-- ---------------------------------------------------------------------
-- One row per assignment. The sessions live in alternate_sessions below,
-- ONE row per session for the whole run rather than one per (session, week)
-- — the same shape SPC's sessions format landed on in 0105. A week is a
-- repeat, not a copy, so per-week completions carry week_number the way
-- SPC's do.
create table programming.alternate_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  -- What the MEMBER sees as the tile heading. Defaults from the category
  -- when assigning ("Away programming"), but the coach can type anything,
  -- so a trip can read "Italy trip" and a welcome block never has to be
  -- called away.
  name text not null,
  start_date date not null,
  weeks smallint not null check (weeks between 1 and 12),
  -- Ticked by default when assigning: while this runs, the client's normal
  -- Flagship/BWA/SPC sessions must not be reported as missed. They're
  -- travelling, not slacking. Left as a per-assignment choice rather than a
  -- property of the category, since something like a deload happens while
  -- they're still in the gym.
  pause_missed_flags boolean not null default true,
  -- Set when a coach ends a run early (came back sooner than planned).
  -- Null means it runs its full length. Never rewrites start_date/weeks, so
  -- what was originally assigned stays readable.
  ended_at date,
  created_by uuid references core.users (id),
  created_at timestamptz not null default now(),
  -- Weeks here are calendar weeks, because My Week renders a Mon-Sun week
  -- and an away week offset from that would straddle two of them (the
  -- member's "week 2 of 3" and their own My Week would disagree). Same
  -- reasoning and same constraint style as group/spc blocks in 0063.
  constraint alternate_programs_start_monday check (extract(isodow from start_date) = 1)
);

create index alternate_programs_user_idx on programming.alternate_programs (user_id);

create table programming.alternate_sessions (
  id uuid primary key default gen_random_uuid(),
  alternate_program_id uuid not null references programming.alternate_programs (id) on delete cascade,
  -- Denormalised from the template at assign time, same as
  -- one_off_workouts.title: renaming or deleting the template later must
  -- not retroactively change what a client already has.
  source_template_id uuid references programming.workout_templates (id) on delete set null,
  title text not null,
  position int not null
);

create index alternate_sessions_program_idx on programming.alternate_sessions (alternate_program_id);

-- Content copied from the template at assign time, mirroring
-- one_off_warmups / one_off_exercises exactly (including the fact that
-- warm-ups carry no sets/reps — template_warmups doesn't have them either).
create table programming.alternate_warmups (
  id uuid primary key default gen_random_uuid(),
  alternate_session_id uuid not null references programming.alternate_sessions (id) on delete cascade,
  exercise_id uuid references programming.exercises (id),
  position int not null,
  label text,
  superset_group_id uuid
);

create table programming.alternate_exercises (
  id uuid primary key default gen_random_uuid(),
  alternate_session_id uuid not null references programming.alternate_sessions (id) on delete cascade,
  exercise_id uuid not null references programming.exercises (id),
  position int not null,
  sets int,
  reps text,
  rest text,
  notes text,
  superset_group_id uuid,
  rep_scheme text[]
);

create index alternate_warmups_session_idx on programming.alternate_warmups (alternate_session_id);
create index alternate_exercises_session_idx on programming.alternate_exercises (alternate_session_id);

alter table programming.alternate_programs enable row level security;
alter table programming.alternate_sessions enable row level security;
alter table programming.alternate_warmups enable row level security;
alter table programming.alternate_exercises enable row level security;

-- Any staff member can assign one, same as one-offs (0008 deliberately did
-- NOT gate one-offs on can_view_spc — they're reached from a client's own
-- profile regardless of what that client is enrolled in, and so are these).
create policy "staff manage alternate programs" on programming.alternate_programs
  for all using (core.is_staff()) with check (core.is_staff());

-- A member sees their own run only while it is actually live. Enforced here
-- rather than only in the app so a run assigned for next month genuinely
-- does not exist for her yet, the same way 0102 gates an upcoming SPC run.
-- The end is coalesce(ended_at, start_date + weeks*7 - 1): ending a run
-- early takes it off her phone immediately.
create policy "member reads own live alternate programs" on programming.alternate_programs
  for select using (
    user_id = auth.uid()
    and start_date <= (now() at time zone 'America/Boise')::date
    and (now() at time zone 'America/Boise')::date
        <= coalesce(ended_at, start_date + (weeks * 7 - 1))
  );

-- One definition of "is this run visible to this member", used by all three
-- child tables. A security-definer function rather than repeating the date
-- arithmetic three more times, and rather than relying on the parent's own
-- policy filtering a subquery — the child tables are different tables, so
-- there is no recursion risk here (unlike a policy that has to read the
-- table it is defined on, which is why 0071/0096 needed helpers of their
-- own). Because definer bypasses RLS, the ownership check is inside it.
create function programming.alternate_program_visible(program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = programming, public
as $$
  select exists (
    select 1 from programming.alternate_programs p
    where p.id = program_id
      and p.user_id = auth.uid()
      and p.start_date <= (now() at time zone 'America/Boise')::date
      and (now() at time zone 'America/Boise')::date
          <= coalesce(p.ended_at, p.start_date + (p.weeks * 7 - 1))
  );
$$;

grant execute on function programming.alternate_program_visible(uuid) to authenticated;

create policy "staff manage alternate sessions" on programming.alternate_sessions
  for all using (core.is_staff()) with check (core.is_staff());

create policy "member reads own live alternate sessions" on programming.alternate_sessions
  for select using (programming.alternate_program_visible(alternate_program_id));

create policy "staff manage alternate warmups" on programming.alternate_warmups
  for all using (core.is_staff()) with check (core.is_staff());

create policy "member reads own live alternate warmups" on programming.alternate_warmups
  for select using (
    exists (
      select 1 from programming.alternate_sessions s
      where s.id = alternate_warmups.alternate_session_id
        and programming.alternate_program_visible(s.alternate_program_id)
    )
  );

create policy "staff manage alternate exercises" on programming.alternate_exercises
  for all using (core.is_staff()) with check (core.is_staff());

create policy "member reads own live alternate exercises" on programming.alternate_exercises
  for select using (
    exists (
      select 1 from programming.alternate_sessions s
      where s.id = alternate_exercises.alternate_session_id
        and programming.alternate_program_visible(s.alternate_program_id)
    )
  );

-- ---------------------------------------------------------------------
-- 3. Completions and logs widen from three session types to four
-- ---------------------------------------------------------------------
-- Same widening 0008 did when one-offs were added. week_number is REQUIRED
-- for an alternate session and null for a one-off, because one
-- alternate_sessions row recurs across every week of its run (exactly like
-- an SPC sessions-format workout) while a one-off happens once.
alter table programming.session_completions
  add column alternate_session_id uuid references programming.alternate_sessions (id) on delete cascade;

alter table programming.session_completions drop constraint if exists session_completions_check;
alter table programming.session_completions add constraint session_completions_check check (
  (group_workout_id is not null and spc_workout_id is null and one_off_workout_id is null and alternate_session_id is null and week_number is null) or
  (group_workout_id is null and spc_workout_id is not null and one_off_workout_id is null and alternate_session_id is null and week_number is not null) or
  (group_workout_id is null and spc_workout_id is null and one_off_workout_id is not null and alternate_session_id is null and week_number is null) or
  (group_workout_id is null and spc_workout_id is null and one_off_workout_id is null and alternate_session_id is not null and week_number is not null)
);

create unique index session_completions_alternate_uidx
  on programming.session_completions (user_id, alternate_session_id, week_number, instance)
  where alternate_session_id is not null;

create index session_completions_alternate_idx
  on programming.session_completions (alternate_session_id)
  where alternate_session_id is not null;

alter table programming.exercise_completions
  add column alternate_exercise_id uuid references programming.alternate_exercises (id) on delete cascade;

alter table programming.exercise_completions drop constraint if exists exercise_completions_check;
alter table programming.exercise_completions add constraint exercise_completions_check check (
  (group_workout_exercise_id is not null and spc_workout_exercise_id is null and one_off_exercise_id is null and alternate_exercise_id is null and week_number is null) or
  (group_workout_exercise_id is null and spc_workout_exercise_id is not null and one_off_exercise_id is null and alternate_exercise_id is null and week_number is not null) or
  (group_workout_exercise_id is null and spc_workout_exercise_id is null and one_off_exercise_id is not null and alternate_exercise_id is null and week_number is null) or
  (group_workout_exercise_id is null and spc_workout_exercise_id is null and one_off_exercise_id is null and alternate_exercise_id is not null and week_number is not null)
);

create unique index exercise_completions_alternate_uidx
  on programming.exercise_completions (user_id, alternate_exercise_id, week_number, instance)
  where alternate_exercise_id is not null;

-- logs gets a session reference like the other three (0063) plus a new
-- source tag. It deliberately does NOT get week_number for these: a log row
-- is already keyed by date_performed, and the date determines which week of
-- the run it belongs to. Storing a week that nothing filters on is just a
-- second answer that can disagree with the first.
alter table programming.logs
  add column alternate_session_id uuid references programming.alternate_sessions (id) on delete set null;

create index logs_alternate_session_idx
  on programming.logs (alternate_session_id)
  where alternate_session_id is not null;

alter table programming.logs drop constraint if exists logs_source_check;
alter table programming.logs add constraint logs_source_check check (
  source in ('flagship', 'bwa', 'group', 'spc', 'one_off', 'alternate', 'truecoach')
);

-- logs_unique_set_idx ALSO has to include the new column, or two different
-- away sessions logged on one day would collide. That change is NOT here.
-- It is migration 0112, and it must not run until the app is deployed,
-- because logResult()'s insert branch is a real ON CONFLICT upsert naming
-- that index's columns explicitly — widening the index makes every
-- already-loaded browser tab fail with 42P10 on its next new set. Found
-- the hard way: this migration originally widened it, and production
-- inserts broke until the index was put back. 0112 widens it again once
-- logResult no longer names any column list at all.

-- Same Data-API permission dance as every schema-adding migration before
-- this one (0003's note).
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
