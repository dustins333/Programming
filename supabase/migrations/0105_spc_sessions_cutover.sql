-- 0105_spc_sessions_cutover.sql
--
-- The cutover: every weekly block that is still in play becomes a
-- sessions-format program (0102). After this there is no client left on the
-- old model, so hasLiveWeeklyWorld() is false for everyone and the new
-- tabbed client page is what every coach sees.
--
-- Finished blocks are deliberately NOT touched. History stays exactly as it
-- was authored — a past block is a record of what she actually did, week by
-- week, and rewriting it would be rewriting the past. Only blocks that are
-- live, queued or still drafts are converted.
--
-- THE RULE, from the spec: the CURRENT WEEK BECOMES THE TRUTH. Whatever is
-- programmed for the week she is in right now becomes the one definition of
-- each session, and it keeps running from here.
--
-- Two shapes, decided per block by W, its current week:
--
--   W = 1  The block started this Monday, so its week 1 already IS the
--          current week. Convert in place: flip the format, drop the
--          not-yet-reached week rows, keep everything else — the block id,
--          the dates, and every completion already filed against week 1.
--
--   W > 1  Her current week sits in the middle of a block. Copying week W
--          back onto week 1 in place would silently rewrite the completions
--          already filed against weeks 1..W-1 (they are keyed on the authored
--          week_number), so instead a NEW run R is created starting this
--          Monday, week W's content is copied into it as week 1, and the old
--          block is trimmed to end the day before. B survives untouched as
--          the history of weeks 1..W-1.
--
-- Whichever shape applies, THIS WEEK'S OWN DATA MOVES WITH HER. For the W > 1
-- case that means repointing three things at the new rows: her
-- session_completions for week W, her logs from Monday onward, and her
-- per-exercise ticks (exercise_completions). Miss any one of them and a woman
-- who trained on Saturday opens the app on Sunday to a week that has reset
-- itself. exercise_completions is the easy one to forget — it hangs off the
-- copied spc_workout_exercises rows, not off the workout.
--
-- Everything is date arithmetic off today in Boise, so this is correct
-- whether it runs on Sunday night or on Monday morning.
--
-- SAFETY. Nothing is deleted without first asserting that nothing references
-- it: session_completions and exercise_completions both CASCADE from the rows
-- this drops, so an unguarded delete would destroy completion records rather
-- than fail. A block that fails any assertion is SKIPPED and reported, never
-- half-converted. programming.zz_cutover_0105_log records what happened to
-- every block, including the old->new run mapping, and the zz_*_backup_0105
-- tables hold the pre-change values.

-- ── Rollback data ─────────────────────────────────────────────────────────
-- Plain `create table as` lands in an exposed schema with no RLS, which is
-- the 0099 lesson: enable it and revoke, or these become a readable copy of
-- every client's programming.
drop table if exists programming.zz_blocks_backup_0105;
create table programming.zz_blocks_backup_0105 as
  select * from programming.spc_blocks;

drop table if exists programming.zz_completions_backup_0105;
create table programming.zz_completions_backup_0105 as
  select id, user_id, spc_workout_id, week_number, instance from programming.session_completions
   where spc_workout_id is not null;

drop table if exists programming.zz_logs_backup_0105;
create table programming.zz_logs_backup_0105 as
  select id, user_id, spc_workout_id, week_number, date_performed from programming.logs
   where spc_workout_id is not null;

drop table if exists programming.zz_exercise_completions_backup_0105;
create table programming.zz_exercise_completions_backup_0105 as
  select id, user_id, spc_workout_exercise_id, week_number from programming.exercise_completions
   where spc_workout_exercise_id is not null;

drop table if exists programming.zz_cutover_0105_log;
create table programming.zz_cutover_0105_log (
  block_id uuid,
  client_id uuid,
  kind text,           -- live | queued | draft
  current_week int,
  action text,         -- converted_in_place | new_run | skipped
  new_block_id uuid,   -- the run created for it, when action = new_run
  workouts_deleted int default 0,
  workouts_copied int default 0,
  completions_moved int default 0,
  logs_moved int default 0,
  exercise_completions_moved int default 0,
  note text
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'zz_blocks_backup_0105','zz_completions_backup_0105','zz_logs_backup_0105',
    'zz_exercise_completions_backup_0105','zz_cutover_0105_log'
  ] loop
    execute format('alter table programming.%I enable row level security', t);
    execute format('revoke all on programming.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── The cutover ───────────────────────────────────────────────────────────
do $$
declare
  v_today       date := (now() at time zone 'America/Boise')::date;
  v_monday      date := date_trunc('week', (now() at time zone 'America/Boise')::date)::date;
  b             record;
  wk            record;
  ex            record;
  v_w           int;
  v_kind        text;
  v_new_block   uuid;
  v_new_workout uuid;
  v_new_ex      uuid;
  v_del         int;
  v_copied      int;
  v_comp        int;
  v_logs        int;
  v_exc         int;
  v_n           int;
  v_note        text;
begin
  for b in
    select bl.*,
      case
        when bl.status = 'draft' then 'draft'
        when bl.block_start_date > v_today then 'queued'
        when bl.block_end_date >= v_today then 'live'
        else 'past'
      end as kind
    from programming.spc_blocks bl
    where bl.format = 'weekly'
    order by bl.spc_client_id, bl.block_start_date nulls first
  loop
    v_kind := b.kind;
    continue when v_kind = 'past';

    v_note := null;
    v_del := 0; v_copied := 0; v_comp := 0; v_logs := 0; v_exc := 0;
    v_w := case
             when v_kind = 'live' then floor((v_monday - b.block_start_date) / 7.0)::int + 1
             else 1
           end;

    -- A moved session (0101) has no meaning once the week grid is gone, and
    -- silently dropping the move would put her make-up back where it was
    -- authored. Nothing has ever used the column, so this should never fire.
    select count(*) into v_n
      from programming.spc_workouts w
     where w.spc_block_id = b.id and w.scheduled_week is not null;
    if v_n > 0 then
      insert into programming.zz_cutover_0105_log(block_id, client_id, kind, current_week, action, note)
      values (b.id, b.spc_client_id, v_kind, v_w, 'skipped', format('%s session(s) moved to another week', v_n));
      continue;
    end if;

    if v_kind = 'live' and v_w > 1 then
      -- ── W > 1: a new run, seeded from this week ─────────────────────────
      -- Refuse rather than create a run that overlaps something already
      -- scheduled. Nothing in the app enforces overlap at the DB level, so
      -- this is the only guard.
      select count(*) into v_n
        from programming.spc_blocks o
       where o.spc_client_id = b.spc_client_id
         and o.id <> b.id
         and o.status = 'active'
         and o.block_start_date is not null
         and o.block_start_date <= b.block_end_date
         and coalesce(o.block_end_date, date '9999-12-31') >= v_monday;
      if v_n > 0 then
        insert into programming.zz_cutover_0105_log(block_id, client_id, kind, current_week, action, note)
        values (b.id, b.spc_client_id, v_kind, v_w, 'skipped',
                format('a new run would overlap %s other scheduled block(s)', v_n));
        continue;
      end if;

      select count(*) into v_n
        from programming.spc_workouts w
       where w.spc_block_id = b.id and w.week_number = v_w;
      if v_n = 0 then
        insert into programming.zz_cutover_0105_log(block_id, client_id, kind, current_week, action, note)
        values (b.id, b.spc_client_id, v_kind, v_w, 'skipped', 'nothing programmed for the current week');
        continue;
      end if;

      insert into programming.spc_blocks
        (spc_client_id, coach_id, block_start_date, block_end_date, block_length_weeks,
         status, format, auto_extend)
      values
        (b.spc_client_id, b.coach_id, v_monday, b.block_end_date,
         greatest(ceil((b.block_end_date - v_monday + 1) / 7.0)::int, 1),
         'active', 'sessions',
         -- Rolling is a weekly-only mechanism (grow the grid by a week). A
         -- sessions run's end date is edited directly, or set to null for an
         -- ongoing program, so the flag would only ever be a stale one.
         false)
      returning id into v_new_block;

      for wk in
        select * from programming.spc_workouts
         where spc_block_id = b.id and week_number = v_w
         order by session_number
      loop
        insert into programming.spc_workouts
          (spc_block_id, session_number, status, title, week_number, last_edited_by)
        values
          (v_new_block, wk.session_number, wk.status, wk.title, 1, wk.last_edited_by)
        returning id into v_new_workout;
        v_copied := v_copied + 1;

        -- Warm-ups carry no completion of their own, so a plain copy is
        -- enough. Every column, including the superset link (0085) — copied
        -- verbatim, matching copySpcWorkoutContent's own precedent.
        insert into programming.spc_workout_warmups
          (spc_workout_id, exercise_id, position, label, sets, reps, notes, superset_group_id)
        select v_new_workout, u.exercise_id, u.position, u.label, u.sets, u.reps, u.notes, u.superset_group_id
          from programming.spc_workout_warmups u
         where u.spc_workout_id = wk.id;

        -- Lifts go one at a time because each new id is needed to move that
        -- lift's per-exercise ticks across.
        for ex in
          select * from programming.spc_workout_exercises
           where spc_workout_id = wk.id order by position
        loop
          insert into programming.spc_workout_exercises
            (spc_workout_id, exercise_id, position, notes, sets, reps, rest,
             superset_group_id, rep_scheme, tempo)
          values
            (v_new_workout, ex.exercise_id, ex.position, ex.notes, ex.sets, ex.reps, ex.rest,
             ex.superset_group_id, ex.rep_scheme, ex.tempo)
          returning id into v_new_ex;

          update programming.exercise_completions
             set spc_workout_exercise_id = v_new_ex, week_number = 1
           where user_id = b.spc_client_id
             and spc_workout_exercise_id = ex.id
             and week_number = v_w;
          get diagnostics v_n = row_count;
          v_exc := v_exc + v_n;
        end loop;

        update programming.session_completions
           set spc_workout_id = v_new_workout, week_number = 1
         where user_id = b.spc_client_id
           and spc_workout_id = wk.id
           and week_number = v_w;
        get diagnostics v_n = row_count;
        v_comp := v_comp + v_n;

        -- Only this week's sets. Anything logged before Monday belongs to a
        -- week that stays on the old block.
        update programming.logs
           set spc_workout_id = v_new_workout, week_number = 1
         where user_id = b.spc_client_id
           and spc_workout_id = wk.id
           and date_performed >= v_monday;
        get diagnostics v_n = row_count;
        v_logs := v_logs + v_n;
      end loop;

      update programming.spc_blocks
         set block_end_date = v_monday - 1,
             block_length_weeks = v_w - 1,
             auto_extend = false
       where id = b.id;

      insert into programming.zz_cutover_0105_log
        (block_id, client_id, kind, current_week, action, new_block_id,
         workouts_copied, completions_moved, logs_moved, exercise_completions_moved)
      values (b.id, b.spc_client_id, v_kind, v_w, 'new_run', v_new_block,
              v_copied, v_comp, v_logs, v_exc);

    else
      -- ── W = 1, queued, or draft: convert the block in place ─────────────
      -- Week 1 is already the current week (or the block has not started at
      -- all), so nothing has to move. Only the not-yet-reached week rows go.
      select count(*) into v_n
        from programming.session_completions sc
        join programming.spc_workouts w on w.id = sc.spc_workout_id
       where w.spc_block_id = b.id and w.week_number > 1;
      if v_n > 0 then
        insert into programming.zz_cutover_0105_log(block_id, client_id, kind, current_week, action, note)
        values (b.id, b.spc_client_id, v_kind, v_w, 'skipped',
                format('%s completion(s) filed against a later week', v_n));
        continue;
      end if;

      select count(*) into v_n
        from programming.exercise_completions ec
        join programming.spc_workout_exercises e on e.id = ec.spc_workout_exercise_id
        join programming.spc_workouts w on w.id = e.spc_workout_id
       where w.spc_block_id = b.id and w.week_number > 1;
      if v_n > 0 then
        insert into programming.zz_cutover_0105_log(block_id, client_id, kind, current_week, action, note)
        values (b.id, b.spc_client_id, v_kind, v_w, 'skipped',
                format('%s per-exercise tick(s) against a later week', v_n));
        continue;
      end if;

      -- logs FK is ON DELETE SET NULL rather than CASCADE, so these would
      -- survive as orphaned sets rather than vanish — but an orphan is still
      -- a set nothing can attribute, so it refuses too.
      select count(*) into v_n
        from programming.logs lg
        join programming.spc_workouts w on w.id = lg.spc_workout_id
       where w.spc_block_id = b.id and w.week_number > 1;
      if v_n > 0 then
        insert into programming.zz_cutover_0105_log(block_id, client_id, kind, current_week, action, note)
        values (b.id, b.spc_client_id, v_kind, v_w, 'skipped',
                format('%s logged set(s) against a later week', v_n));
        continue;
      end if;

      delete from programming.spc_workouts
       where spc_block_id = b.id and week_number > 1;
      get diagnostics v_del = row_count;

      update programming.spc_blocks
         set format = 'sessions', auto_extend = false
       where id = b.id;

      insert into programming.zz_cutover_0105_log
        (block_id, client_id, kind, current_week, action, workouts_deleted)
      values (b.id, b.spc_client_id, v_kind, v_w, 'converted_in_place', v_del);
    end if;
  end loop;
end $$;
