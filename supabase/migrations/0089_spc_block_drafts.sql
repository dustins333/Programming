-- SPC blocks can be drafted before they are scheduled.
--
-- THE PROBLEM. "Build next block" created a real, dated block the instant it
-- was clicked, starting the day after the last one ended. A coach then spent
-- a few days actually writing it, and by the time it was ready week 1 had
-- already gone by — the client had "missed" a week that was never visible to
-- her. Worst on a brand-new client, where there is no previous block to hang
-- the dates off at all.
--
-- THE SHAPE. A block is now born with status 'draft' and NO DATES. It is
-- invisible to the member and to the wall display, it takes up no room on the
-- calendar, and nothing schedules around it. When the coach is done she picks
-- the Monday it starts and it becomes 'active' — which is the first moment it
-- has dates at all.
--
-- WHY NULLABLE DATES rather than a provisional date plus a flag: every query
-- in this app that asks "which block covers today" does it with a date range
-- comparison, and NULL fails all of them by construction. That means a draft
-- cannot leak into the member's view, the roster, the flags scan or the block
-- pickers through a filter somebody forgot to add. The explicit status column
-- is still here, and RLS still gates on it, but the null dates are the
-- belt underneath the braces.
--
-- The existing spc_blocks_start_monday CHECK needs no change: a CHECK whose
-- expression evaluates to NULL passes, so a dateless draft satisfies it and a
-- real start date is still forced onto a Monday.

alter table programming.spc_blocks
  add column status text not null default 'active'
  check (status in ('draft', 'active'));

-- Default 'active' so every existing row, and any writer that has never heard
-- of drafts, keeps behaving exactly as it does today. Only the new draft path
-- passes 'draft' explicitly.

alter table programming.spc_blocks alter column block_start_date drop not null;
alter table programming.spc_blocks alter column block_end_date drop not null;

alter table programming.spc_blocks
  add constraint spc_blocks_active_has_dates
  check (status = 'draft' or (block_start_date is not null and block_end_date is not null));

-- A dateless block can never be the one covering today, so an active block
-- without dates would be a silently invisible program. This is what makes
-- publishing atomic: dates and status move together or not at all.

-- RLS ------------------------------------------------------------------

-- The member's own block row.
drop policy if exists "member reads own spc_blocks" on programming.spc_blocks;
create policy "member reads own spc_blocks" on programming.spc_blocks
  for select using (spc_client_id = auth.uid() and status = 'active');

-- The wall display (0071) reads a hub-active client's block the same way.
drop policy if exists "display reads hub spc_blocks" on programming.spc_blocks;
create policy "display reads hub spc_blocks" on programming.spc_blocks
  for select using (
    core.is_gym_display() and programming.hub_active_client(spc_client_id) and status = 'active'
  );

-- Content. Session-level publishing already gates these; the block's own
-- status is now a second gate above it, which is the whole point — a coach
-- can publish sessions as she writes them without anyone seeing anything.
drop policy if exists "member reads published own spc_workouts" on programming.spc_workouts;
create policy "member reads published own spc_workouts" on programming.spc_workouts
  for select using (
    status = 'published'
    and exists (
      select 1 from programming.spc_blocks sb
      where sb.id = spc_workouts.spc_block_id
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
    )
  );

drop policy if exists "display reads hub published spc_workouts" on programming.spc_workouts;
create policy "display reads hub published spc_workouts" on programming.spc_workouts
  for select using (
    core.is_gym_display()
    and status = 'published'
    and exists (
      select 1 from programming.spc_blocks sb
      where sb.id = spc_workouts.spc_block_id
        and programming.hub_active_client(sb.spc_client_id)
        and sb.status = 'active'
    )
  );

drop policy if exists "member reads published own spc_workout_warmups" on programming.spc_workout_warmups;
create policy "member reads published own spc_workout_warmups" on programming.spc_workout_warmups
  for select using (
    exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_warmups.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
    )
  );

drop policy if exists "display reads hub published spc_workout_warmups" on programming.spc_workout_warmups;
create policy "display reads hub published spc_workout_warmups" on programming.spc_workout_warmups
  for select using (
    core.is_gym_display()
    and exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_warmups.spc_workout_id
        and sw.status = 'published'
        and programming.hub_active_client(sb.spc_client_id)
        and sb.status = 'active'
    )
  );

drop policy if exists "member reads published own spc_workout_exercises" on programming.spc_workout_exercises;
create policy "member reads published own spc_workout_exercises" on programming.spc_workout_exercises
  for select using (
    exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_exercises.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
    )
  );

drop policy if exists "display reads hub published spc_workout_exercises" on programming.spc_workout_exercises;
create policy "display reads hub published spc_workout_exercises" on programming.spc_workout_exercises
  for select using (
    core.is_gym_display()
    and exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_exercises.spc_workout_id
        and sw.status = 'published'
        and programming.hub_active_client(sb.spc_client_id)
        and sb.status = 'active'
    )
  );

-- Deleting a block is admin-only (0016) because a live block is real history:
-- session_completions cascades off spc_workouts, so dropping one takes a
-- client's record of finishing her sessions with it. A DRAFT has none of that
-- — nobody has ever seen it, so nothing can have been logged against it — and
-- a coach who starts one by mistake needs a way out that does not involve
-- asking an admin.
create policy "staff delete draft spc_blocks" on programming.spc_blocks
  for delete using (core.can_access_spc() and status = 'draft');

-- The wall display's own client picker (0083). Two changes, both narrowing a
-- draft out of it: a client whose only block is a draft has not been
-- programmed as far as the display is concerned, and the current-block CTE
-- says so explicitly rather than relying on the date filter alone. Body is
-- otherwise the deployed definition, unchanged.

CREATE OR REPLACE FUNCTION programming.hub_startable_clients()
 RETURNS TABLE(user_id uuid, name text, block_id uuid, week_number smallint, sessions jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'programming', 'core', 'public'
AS $function$
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with t as (select (now() at time zone 'America/Boise')::date as d),
  -- Active, and programmed at least once. The exists() is what keeps the 62
  -- never-programmed enrolment rows out of the list.
  active as (
    select c.user_id as uid, u.name as uname
    from programming.spc_clients c
    join core.users u on u.id = c.user_id
    where coalesce(c.status, '') <> 'paused'
      and exists (select 1 from programming.spc_blocks b where b.spc_client_id = c.user_id and b.status = 'active')
  ),
  -- "Current block" mirrors getCurrentSpcBlock: prefer whichever overlapping
  -- block actually has published content, then the most recently started.
  blk as (
    select distinct on (b.spc_client_id)
      b.spc_client_id as uid,
      b.id as bid,
      b.block_start_date,
      b.block_length_weeks
    from programming.spc_blocks b, t
    where b.block_start_date <= t.d and b.block_end_date >= t.d
      and b.status = 'active'
    order by
      b.spc_client_id,
      (exists (
        select 1 from programming.spc_workouts w
        where w.spc_block_id = b.id and w.status = 'published'
      )) desc,
      b.block_start_date desc
  ),
  joined as (
    -- LEFT join, so "between blocks" survives into the result with a null
    -- week rather than being filtered out.
    select
      a.uid,
      a.uname,
      blk.bid,
      case
        when blk.uid is null then null
        else least(
          -- currentWeekNumber(): a flat day count from the block's start,
          -- clamped to its length. lib/programming/schedule.js is the
          -- reference.
          greatest(floor((t.d - blk.block_start_date) / 7.0)::int + 1, 1),
          blk.block_length_weeks
        )
      end::smallint as wnum
    from active a
    left join blk on blk.uid = a.uid
    cross join t
  )
  select
    j.uid,
    j.uname,
    j.bid,
    j.wnum,
    case
      when j.bid is null or j.wnum is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'spcWorkoutId', w.id,
            'sessionNumber', w.session_number,
            'title', w.title,
            'completed', exists (
              select 1 from programming.session_completions sc
              where sc.user_id = j.uid
                and sc.spc_workout_id = w.id
                and sc.week_number = j.wnum
            )
          ) order by w.session_number
        )
        from programming.spc_workouts w
        where w.spc_block_id = j.bid
          and w.week_number = j.wnum
          and w.status = 'published'
      ), '[]'::jsonb)
    end
  from joined j
  order by j.uname;
end;
$function$
;

-- ROLLBACK, if this ever needs undoing. Any draft that exists at that point
-- has to go first — it holds no dates, so it cannot satisfy the NOT NULLs
-- being put back:
--
--   delete from programming.spc_blocks where status = 'draft';
--   alter table programming.spc_blocks drop constraint spc_blocks_active_has_dates;
--   alter table programming.spc_blocks alter column block_start_date set not null;
--   alter table programming.spc_blocks alter column block_end_date set not null;
--   alter table programming.spc_blocks drop column status;   -- takes the status
--     -- check with it; the RLS policies above reference it, so recreate the
--     -- 0006/0071/0083 versions (which have no status clause) BEFORE this line.
