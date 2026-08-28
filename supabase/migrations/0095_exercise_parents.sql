-- A parent stops being an exercise and becomes its own record.
--
-- Until now "parent" wasn't a thing — it was any exercise that happened to
-- have something pointing at it via exercises.parent_exercise_id. Three
-- real problems fell out of that:
--
--   1. The "Variation of" picker had to offer every parent-less exercise
--      (135 of them) because any one of them could become a parent. Long
--      enough to be unusable.
--   2. In the builder sidebar a parent row is a click-to-insert target
--      with a small chevron beside it, so aiming for "show me what's under
--      this" regularly inserted the parent into the session instead.
--   3. Nothing stopped a warm-up parenting lifts. The live library has
--      exactly that: the warm-up "Glute Bridge" heads two real lifts.
--
-- A parent record can't be programmed, logged or picked, because it has no
-- row in programming.exercises at all — that's structural, not a filter
-- some future query can forget to apply.
--
-- NOTHING IS LOST. 15 of the 20 current parents are themselves programmed
-- into live sessions (Landmine Press carries 551 logged sets, Lat Pulldown
-- 164 across 30 sessions), so every lift-type parent is migrated INTO its
-- own parent alongside its variations: the "Lat Pulldown" parent holds the
-- Lat Pulldown lift plus its two variations. Its id never changes, so
-- every session row, log row and PR is untouched.
--
-- exercises.parent_exercise_id is deliberately left in place, unread, as
-- the rollback path — see the bottom of this file.

create table programming.exercise_parents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Copied off the exercise this parent was migrated from, and used to
  -- pre-tag a new variation added under it (the behaviour the old
  -- "picking a parent pulls its tags down" already had). Optional: a
  -- parent with none falls back to the union of its members' tags for
  -- sidebar bucketing, so it can never vanish from the column.
  muscle_group text[],
  movement_pattern text[],
  created_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint exercise_parents_muscle_group_check check (muscle_group is null or muscle_group <@ array['chest','back','shoulders','arms','legs','glutes','core','full_body','upper_chest','lower_chest','lats','upper_back','lower_back','front_delt','side_delt','rear_delt','biceps','triceps','forearms','quads','hamstrings','calves','abs','obliques']::text[]),
  constraint exercise_parents_movement_pattern_check check (movement_pattern is null or movement_pattern <@ array['squat','lunge','hinge','core','row','horizontal_push','vertical_pull','vertical_push']::text[])
);

-- Case- and whitespace-insensitive, because the thing this feature exists
-- to stop is two parents that read as the same movement. The live library
-- already has two parents named "Glute Bridge" and one named "RDL " with a
-- trailing space; the backfill below folds both away.
create unique index exercise_parents_name_key on programming.exercise_parents (lower(btrim(name)));

alter table programming.exercises
  add column parent_id uuid references programming.exercise_parents (id) on delete set null;
create index exercises_parent_id_idx on programming.exercises (parent_id) where parent_id is not null;

alter table programming.exercise_parents enable row level security;

-- Mirrors 0094's split exactly: adding is open to every coach (the whole
-- point of "+ New parent" on the exercise form is not being blocked
-- mid-build), while renaming and removing are the reviewer's job and live
-- on the reviewer's own screen.
create policy "staff read exercise parents" on programming.exercise_parents
  for select using (core.is_staff());
create policy "staff insert exercise parents" on programming.exercise_parents
  for insert with check (core.is_staff());
create policy "reviewers update exercise parents" on programming.exercise_parents
  for update using (core.can_access_exercise_library()) with check (core.can_access_exercise_library());
create policy "reviewers delete exercise parents" on programming.exercise_parents
  for delete using (core.can_access_exercise_library());

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

/* ---------------------------------------------------------- backfill */

-- A "head" is an exercise with at least one ACTIVE variation under it.
-- Requiring an active child drops "Front Rack/Goblet Squat", whose only
-- child is an archived duplicate Squat — it is itself a variation of Squat
-- and belongs inside that parent, not heading one of its own. Its archived
-- child simply ends up ungrouped, which is invisible either way.
--
-- distinct on folds the two "Glute Bridge" heads into one parent record,
-- preferring the lift over the warm-up and a tagged row over an untagged
-- one so the surviving record carries {glutes} rather than nothing.
insert into programming.exercise_parents (name, muscle_group, movement_pattern)
select distinct on (lower(btrim(p.name)))
       btrim(p.name), p.muscle_group, p.movement_pattern
from programming.exercises p
where exists (
  select 1 from programming.exercises c
  where c.parent_exercise_id = p.id and c.is_active
)
order by lower(btrim(p.name)), (p.type = 'lift') desc, (p.muscle_group is not null) desc, p.id;

-- Every variation moves to the new record.
update programming.exercises c
set parent_id = ep.id
from programming.exercises p
join programming.exercise_parents ep on lower(ep.name) = lower(btrim(p.name))
where c.parent_exercise_id = p.id
  and exists (
    select 1 from programming.exercises c2
    where c2.parent_exercise_id = p.id and c2.is_active
  );

-- And the head lift itself joins the parent it used to be, which is what
-- keeps it programmable. Lift heads only: the warm-up "Glute Bridge" heads
-- two lifts today, and dropping a warm-up into a lift parent would carry
-- that bug across rather than ending it. It keeps its variations (they
-- move above), it just isn't a member of the group itself.
update programming.exercises p
set parent_id = ep.id
from programming.exercise_parents ep
where lower(ep.name) = lower(btrim(p.name))
  and p.type = 'lift'
  and exists (
    select 1 from programming.exercises c
    where c.parent_exercise_id = p.id and c.is_active
  );

comment on column programming.exercises.parent_exercise_id is
  'SUPERSEDED by parent_id (0095). Left populated as the rollback path for that migration; nothing in the app reads it. Do not wire new code to this column.';

-- Rollback:
--   alter table programming.exercises drop column parent_id;
--   drop table programming.exercise_parents;
-- parent_exercise_id is never written by 0095, so the old grouping is
-- still intact underneath and the app reverts with the code.

-- New table + column: NOTIFY pgrst, 'reload schema'; in the SQL Editor.
