-- Two unrelated asks landing in one migration since both came out of the
-- same conversation:
--
-- 1. SPC rearchitected to match Group Programs exactly: one spc_workouts
--    row per (block, week, session) instead of one row per session_number
--    that recurred across every week with progression living in a separate
--    spc_exercise_weeks table. The recurring model meant a session's
--    exercise LIST was locked for the whole block — only sets/reps/rest
--    could vary week to week — which turned out to be wrong in practice
--    (coaches need to add/remove exercises for specific weeks routinely).
--    Explicitly authorized to drop existing SPC block content rather than
--    migrate it — everything in spc_workouts/spc_workout_exercises/
--    spc_exercise_weeks/spc_workout_warmups as of this writing is test data.
--
-- 2. group_blocks/spc_blocks' single "staff manage" (for all) policy let
--    any coach delete a block. Splitting it into explicit per-command
--    policies so DELETE can be admin-only, per direct request — coaches
--    accidentally creating a block they didn't mean to should be an admin
--    cleanup action, not something every coach can do to every block.

-- Wipe existing SPC workout-level content — spc_blocks/spc_clients
-- themselves are untouched, only the recurring-session content tied to the
-- old shape. Cascades take session_completions' spc_workout_id rows and
-- program_comments is unaffected (scoped to spc_block_id, not workout).
truncate table programming.spc_workouts cascade;

drop table programming.spc_exercise_weeks;
drop table programming.spc_workout_week_titles;

alter table programming.spc_workouts add column week_number smallint not null default 1;
alter table programming.spc_workouts alter column week_number drop default;
alter table programming.spc_workouts drop constraint spc_workouts_spc_block_id_session_number_key;
alter table programming.spc_workouts add constraint spc_workouts_block_week_session_key unique (spc_block_id, session_number, week_number);

-- Flat prescription directly on the exercise row now, same shape as
-- group_workout_exercises plus the coach_initials/touched_date "last
-- touched" stamp SPC's print template still wants (rest instead of tempo —
-- SPC/templates/one-offs have always used "rest", group uses "tempo",
-- different program families, no need for them to match column-for-column).
alter table programming.spc_workout_exercises add column sets int default 3;
alter table programming.spc_workout_exercises add column reps text default '10';
alter table programming.spc_workout_exercises add column rest text;
alter table programming.spc_workout_exercises add column coach_initials text;
alter table programming.spc_workout_exercises add column touched_date date;

-- Block delete: admin-only. Replaces each single "staff manage" (for all)
-- policy with three staff-scoped policies (read/insert/update) plus one
-- admin-only delete policy — Postgres ORs multiple permissive policies for
-- the same command, so leaving the old "for all" policy in place would
-- still let any coach delete through it.
drop policy "staff manage group_blocks" on programming.group_blocks;
create policy "staff read group_blocks" on programming.group_blocks
  for select using (core.is_staff());
create policy "staff insert group_blocks" on programming.group_blocks
  for insert with check (core.is_staff());
create policy "staff update group_blocks" on programming.group_blocks
  for update using (core.is_staff()) with check (core.is_staff());
create policy "admin delete group_blocks" on programming.group_blocks
  for delete using (core.is_admin());

drop policy "staff manage spc_blocks" on programming.spc_blocks;
create policy "staff read spc_blocks" on programming.spc_blocks
  for select using (core.is_staff());
create policy "staff insert spc_blocks" on programming.spc_blocks
  for insert with check (core.is_staff());
create policy "staff update spc_blocks" on programming.spc_blocks
  for update using (core.is_staff()) with check (core.is_staff());
create policy "admin delete spc_blocks" on programming.spc_blocks
  for delete using (core.is_admin());

-- Same Data-API permission dance as every schema-adding migration before
-- this one — cheap insurance even though this migration only adds columns,
-- not tables.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
