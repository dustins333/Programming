-- Demo/history seed data for show-and-tell.
--
-- Creates 3 fully-completed Flagship blocks on Dustin's test account
-- (dustin@kovastrength.com), each 4 weeks x 3 sessions x 3 exercises x 3
-- logged sets, with every session finalized (session_completions) so they
-- show up in the Group Programs History view and the client's "View full
-- block" / My Fitness history.
--
-- Dates (all in the past, non-overlapping with each other and with the two
-- currently-active test blocks that start 2026-07-20/21):
--   Block 1: 2026-01-05 -> 2026-02-01
--   Block 2: 2026-03-02 -> 2026-03-29
--   Block 3: 2026-05-11 -> 2026-06-07
--
-- NOT idempotent — this is meant to be run once. Re-running it will insert
-- a second copy of everything. To undo, see the cleanup query at the
-- bottom of this file (commented out).
--
-- Run this in the Supabase SQL Editor (Project > SQL Editor). No
-- NOTIFY pgrst, 'reload schema' needed afterward — this only inserts rows,
-- it doesn't change the schema.

do $$
declare
  v_user_id uuid;
  v_coach_id uuid;
  v_program_id uuid;
  v_bench_id uuid;
  v_squat_id uuid;
  v_row_id uuid;
  v_block_id uuid;
  v_workout_id uuid;
  v_block record;
  v_week int;
  v_session int;
  v_session_date date;
  v_completed_at timestamptz;
  v_set int;
begin
  select id into v_user_id from core.users where email = 'dustin@kovastrength.com';
  select id into v_coach_id from core.users where email = 'terra@kovastrength.com';
  select id into v_program_id from programming.group_programs where name = 'Flagship';
  select id into v_bench_id from programming.exercises where name = 'Barbell Bench Press' limit 1;
  select id into v_squat_id from programming.exercises where name = 'Goblet Squat' limit 1;
  select id into v_row_id from programming.exercises where name = 'Seated Cable Row' limit 1;

  if v_user_id is null then
    raise exception 'dustin@kovastrength.com not found in core.users';
  end if;
  if v_coach_id is null then
    raise exception 'terra@kovastrength.com not found in core.users';
  end if;
  if v_program_id is null then
    raise exception 'Flagship program not found in programming.group_programs';
  end if;
  if v_bench_id is null or v_squat_id is null or v_row_id is null then
    raise exception 'One or more seed exercises not found (Barbell Bench Press / Goblet Squat / Seated Cable Row) — check exact names in programming.exercises and adjust this script';
  end if;

  for v_block in
    select * from (values
      (1, '2026-01-05'::date, '2026-02-01'::date, 95::numeric,  25::numeric, 50::numeric),
      (2, '2026-03-02'::date, '2026-03-29'::date, 105::numeric, 30::numeric, 55::numeric),
      (3, '2026-05-11'::date, '2026-06-07'::date, 115::numeric, 35::numeric, 60::numeric)
    ) as t(block_seq, start_date, end_date, bench_base, squat_base, row_base)
  loop
    insert into programming.group_blocks (group_program_id, block_start_date, block_end_date, created_by)
    values (v_program_id, v_block.start_date, v_block.end_date, v_coach_id)
    returning id into v_block_id;

    for v_week in 1..4 loop
      for v_session in 1..3 loop
        insert into programming.group_workouts (block_id, session_number, week_number, status)
        values (v_block_id, v_session, v_week, 'published')
        returning id into v_workout_id;

        -- Session1 -> Monday, Session2 -> Wednesday, Session3 -> Friday of that week,
        -- matching lib/programming/schedule.js's sessionNumberForDate mapping.
        v_session_date := v_block.start_date + ((v_week - 1) * 7)
          + (case v_session when 1 then 0 when 2 then 2 else 4 end);
        v_completed_at := (v_session_date + time '18:00:00') at time zone 'America/Boise';

        insert into programming.group_workout_exercises (group_workout_id, exercise_id, position, sets, reps)
        values
          (v_workout_id, v_bench_id, 1, 3, '8'),
          (v_workout_id, v_squat_id, 2, 3, '8'),
          (v_workout_id, v_row_id, 3, 3, '8');

        insert into programming.session_completions (user_id, group_workout_id, completed_at)
        values (v_user_id, v_workout_id, v_completed_at);

        -- 3 logged sets per exercise, weight nudging up week over week.
        for v_set in 1..3 loop
          insert into programming.logs (user_id, exercise_id, date_performed, set_number, reps, weight, source)
          values (v_user_id, v_bench_id, v_session_date, v_set, 8, v_block.bench_base + (v_week - 1) * 5, 'flagship');
          insert into programming.logs (user_id, exercise_id, date_performed, set_number, reps, weight, source)
          values (v_user_id, v_squat_id, v_session_date, v_set, 8, v_block.squat_base + (v_week - 1) * 2.5, 'flagship');
          insert into programming.logs (user_id, exercise_id, date_performed, set_number, reps, weight, source)
          values (v_user_id, v_row_id, v_session_date, v_set, 8, v_block.row_base + (v_week - 1) * 2.5, 'flagship');
        end loop;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Cleanup (run manually later if you want to remove this demo data):
--
-- delete from programming.logs
--   where user_id = (select id from core.users where email = 'dustin@kovastrength.com')
--   and date_performed < '2026-07-01';
--
-- delete from programming.group_blocks
--   where block_start_date in ('2026-01-05', '2026-03-02', '2026-05-11');
--   -- (cascades to group_workouts / group_workout_exercises / session_completions)
-- ---------------------------------------------------------------------
