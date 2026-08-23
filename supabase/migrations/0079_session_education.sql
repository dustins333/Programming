-- Coach education: what a coach needs to know before a new block goes out.
--
-- Written in the group session builder's right rail (a tab beside "balance
-- this week") and read on the new Coach Prep tab, where a coach previews an
-- upcoming block on their phone before it's posted.
--
-- SCOPE — keyed to (block, session_number), NOT to a single group_workouts
-- row. Terra's call: you explain a block's lifts once, so a note written on
-- Session 1 shows for Session 1 in every week of that block. Keying it to a
-- workout would mean re-typing the same coaching point six times for a
-- six-week block, and a coach reading week 3 would see nothing.
--
-- exercise_id is a POINTER, not ownership: the note is not a property of the
-- library exercise (the same lift in next month's block gets its own note),
-- it just says which of the session's lifts this box is about. Nullable, so
-- a box with no lift selected is a session-wide note. ON DELETE SET NULL
-- rather than cascade — archiving/removing an exercise must never silently
-- delete something a coach typed; the box survives as a general note.
--
-- Group only, deliberately (Terra: "only on group... for now"). SPC would
-- need a second nullable key column plus an XOR check, the same shape as
-- session_completions — additive and cheap when it's actually wanted, so
-- there's no point pre-building an XOR nothing uses.
--
-- Staff-only in every direction. There is NO member policy, not even select:
-- this is written for a coach's eye ("cue the brace before the bar moves"),
-- the same reasoning as programming.client_limitations in 0057.

create table if not exists programming.session_education (
  id uuid primary key default gen_random_uuid(),
  group_block_id uuid not null references programming.group_blocks (id) on delete cascade,
  -- No `between 1 and 3` check here, unlike group_workouts (0004): programs
  -- have had a configurable sessions_per_week since 0011, and that old
  -- constraint is a trap waiting for a 4x/week program.
  session_number smallint not null check (session_number >= 1),
  exercise_id uuid references programming.exercises (id) on delete set null,
  notes text,
  video_url text,
  position smallint not null default 0,
  created_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_education_block_session_idx
  on programming.session_education (group_block_id, session_number, position);

alter table programming.session_education enable row level security;

create policy "staff manage session education" on programming.session_education
  for all using (core.is_staff()) with check (core.is_staff());

grant select, insert, update, delete on programming.session_education to authenticated;

-- New table — PostgREST needs the usual nudge before it's reachable:
-- NOTIFY pgrst, 'reload schema';
