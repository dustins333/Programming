-- 0102_spc_sessions_format.sql
--
-- Phase 2 (data layer) of the SPC simplification — spec:
-- https://claude.ai/code/artifact/b53ad627-9a83-4c2b-acd7-c9d1bbe30639
--
-- Three additive changes, all backward compatible: nothing user-visible
-- changes until the format-aware code ships and the cutover migration runs.
--
-- 1 ▸ spc_blocks.format — 'weekly' (the legacy per-week model, every existing
--     row) vs 'sessions' (the new one-definition-per-session model, where a
--     run's spc_workouts rows all carry week_number = 1 and the calendar is
--     pure arithmetic off block_start_date). The default stays 'weekly'
--     FOREVER, on purpose: the legacy writers still running today
--     (createSpcBlock's grid, scan-spc-alerts' draft creation) insert without
--     naming the column, and a 'sessions' default would mislabel every block
--     they create as new-model while it is built as a week grid. New-model
--     rows are always written with format = 'sessions' explicitly.
--
-- 2 ▸ instance columns on session_completions and exercise_completions, with
--     the SPC partial unique indexes widened to include them — what makes a
--     make-up session ("start a new one") representable as a second real
--     completion of the same (session, week). Every existing row is instance
--     1, and both hand-rolled upserts keep working unchanged in the interim
--     (inserts default to 1, and two default inserts still conflict).
--
--     programming.logs deliberately does NOT get an instance column: its 0073
--     unique-set index is what logResult()'s upsert infers against on the
--     app's hottest write path, and widening it would break every
--     not-yet-refreshed client's autosave the moment this ran (ON CONFLICT
--     must name the index's exact column set). A second same-day instance of
--     the SAME session therefore shares that day's set rows — acceptable: a
--     make-up is almost always a different day, and logs are read by date.
--
-- 3 ▸ the three member read policies gain a block_start_date gate (Boise
--     date), which is what makes an upcoming (future-dated) run's content
--     genuinely invisible to the member rather than merely unfetched.
--     Deliberately NO end-date gate — past the end with nothing queued, the
--     member keeps seeing and logging the current program (Terra,
--     2026-08-30). Drafts hold NULL dates, so the same comparison keeps them
--     invisible. Caller-first gating (spc_client_id = auth.uid()) unchanged.
--
-- Run in the Supabase SQL Editor (or supabase db query --linked -f), then:
--   NOTIFY pgrst, 'reload schema';

-- 1 ▸ block format ----------------------------------------------------------

alter table programming.spc_blocks
  add column format text not null default 'weekly'
  constraint spc_blocks_format_check check (format in ('weekly', 'sessions'));

-- 2 ▸ completion instances --------------------------------------------------

alter table programming.session_completions
  add column instance smallint not null default 1
  constraint session_completions_instance_check check (instance >= 1);

drop index programming.session_completions_spc_uidx;
create unique index session_completions_spc_uidx
  on programming.session_completions (user_id, spc_workout_id, week_number, instance)
  where spc_workout_id is not null;

alter table programming.exercise_completions
  add column instance smallint not null default 1
  constraint exercise_completions_instance_check check (instance >= 1);

drop index programming.exercise_completions_spc_uidx;
create unique index exercise_completions_spc_uidx
  on programming.exercise_completions (user_id, spc_workout_exercise_id, week_number, instance)
  where spc_workout_exercise_id is not null;

-- 3 ▸ member visibility gated on the block's start date ----------------------

drop policy "member reads published own spc_workouts" on programming.spc_workouts;
create policy "member reads published own spc_workouts" on programming.spc_workouts
  for select using (
    status = 'published'
    and exists (
      select 1 from programming.spc_blocks sb
      where sb.id = spc_workouts.spc_block_id
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
        and sb.block_start_date <= (now() at time zone 'America/Boise')::date
    )
  );

drop policy "member reads published own spc_workout_exercises" on programming.spc_workout_exercises;
create policy "member reads published own spc_workout_exercises" on programming.spc_workout_exercises
  for select using (
    exists (
      select 1
      from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_exercises.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
        and sb.block_start_date <= (now() at time zone 'America/Boise')::date
    )
  );

drop policy "member reads published own spc_workout_warmups" on programming.spc_workout_warmups;
create policy "member reads published own spc_workout_warmups" on programming.spc_workout_warmups
  for select using (
    exists (
      select 1
      from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_warmups.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
        and sb.block_start_date <= (now() at time zone 'America/Boise')::date
    )
  );
