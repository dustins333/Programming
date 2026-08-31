-- 0104_hub_sessions_format.sql
--
-- The wall display and the staging picker learn the sessions format (0102).
--
-- Both RPCs resolve a client's current session by matching a workout row's
-- week against a computed current week. That is exactly right for a weekly
-- block, where there is one row per (week, session), and completely wrong for
-- a sessions-format run, where a session has ONE row that recurs every week
-- and every row carries the authored week_number = 1. Without this, a
-- converted client simply cannot be started from the wall: the picker
-- resolves "week 3" against rows that are all week 1 and finds nothing.
--
-- Weekly behaviour is deliberately byte-identical. Every branch below is
-- gated on spc_blocks.format, and the weekly arm of each is the previous
-- definition unchanged (0098/0101 for hub_startable_clients, 0091 for
-- hub_resolve_staged) — including hub_startable_clients' missing status
-- filter, which is pre-existing and not this migration's to change.
--
-- Three things differ for a sessions-format run, and each is forced by the
-- model rather than chosen:
--
-- 1 ▸ Which block is current. Mirrors getCurrentSpcBlock (lib/programming/
--     spc_blocks.js): a NULL end date is an ongoing program and covers today
--     by definition (0103), and when nothing covers today the most recent
--     past run still counts — a lapsed run keeps running for the member, so
--     she must still be startable at the wall. The roster burns red for the
--     coach instead. The fallback mirrors the JS exactly, including that it
--     takes the single most recent active block regardless of format and only
--     accepts it if it is sessions-format: a weekly block that has ended has
--     genuinely ended.
--
-- 2 ▸ Which sessions. All of the run's published rows, every week. The week
--     does not filter, because the row IS the session.
--
-- 3 ▸ Which week number rides along. UNCAPPED calendar weeks off the start
--     date, and — unlike the weekly arm — that calendar week is also what
--     each session's own weekNumber carries. It has to be: the caller hands
--     that value back to markSpcExerciseComplete, and a sessions-format run
--     files its completions under the calendar week (see spcCompletionWeek in
--     lib/programming/sessionCompletions.js and calendarWeekNumber in
--     schedule.js), not under the authored 1. Handing back the authored week
--     here would file the wall's per-exercise ticks in week 1 while the
--     member's own phone reads them out of the calendar week, and the two
--     surfaces would silently disagree about what she had done.
--
--     Session finalize is unaffected either way — finalizeSpcSession resolves
--     the week from the workout row itself and ignores the caller.
--
-- No schema change, no new grants: both functions keep their signature,
-- their SECURITY DEFINER, and their existing execute grants.

-- ── Every SPC client who could go on the board right now ───────────────────
create or replace function programming.hub_startable_clients()
returns table (user_id uuid, name text, block_id uuid, week_number smallint, sessions jsonb)
language plpgsql
security definer
set search_path = programming, core, public
as $$
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with t as (select (now() at time zone 'America/Boise')::date as d),
  active as (
    select c.user_id as uid, u.name as uname
    from programming.spc_clients c
    join core.users u on u.id = c.user_id
    where coalesce(c.status, '') <> 'paused'
      and exists (select 1 from programming.spc_blocks b where b.spc_client_id = c.user_id)
  ),
  -- The weekly arm of this predicate is unchanged. The sessions arm adds the
  -- ongoing case (NULL end covers today).
  covering as (
    select distinct on (b.spc_client_id)
      b.spc_client_id as uid,
      b.id as bid,
      b.block_start_date,
      b.block_length_weeks,
      b.format
    from programming.spc_blocks b, t
    where b.block_start_date <= t.d
      and (
        (b.format = 'weekly' and b.block_end_date >= t.d)
        -- status is asserted on the sessions arm only, so the weekly arm
        -- stays byte-identical to what it was. A demoted program has its
        -- dates cleared (endProgramsBefore), so this is belt to that brace.
        or (b.format = 'sessions' and b.status = 'active'
            and (b.block_end_date is null or b.block_end_date >= t.d))
      )
    order by
      b.spc_client_id,
      (exists (
        select 1 from programming.spc_workouts w
        where w.spc_block_id = b.id and w.status = 'published'
      )) desc,
      b.block_start_date desc
  ),
  -- Lapsed fallback, sessions-format only. Deliberately picks the most recent
  -- started block of ANY format and then requires it to be sessions-format,
  -- so a client whose latest run is a finished weekly block stays finished.
  lapsed as (
    select distinct on (b.spc_client_id)
      b.spc_client_id as uid,
      b.id as bid,
      b.block_start_date,
      b.block_length_weeks,
      b.format
    from programming.spc_blocks b, t
    where b.status = 'active'
      and b.block_start_date <= t.d
    order by b.spc_client_id, b.block_start_date desc, b.id desc
  ),
  blk as (
    select
      a.uid,
      coalesce(c.bid, l.bid) as bid,
      coalesce(c.block_start_date, l.block_start_date) as block_start_date,
      coalesce(c.block_length_weeks, l.block_length_weeks) as block_length_weeks,
      coalesce(c.format, l.format) as format
    from active a
    left join covering c on c.uid = a.uid
    left join lapsed l on l.uid = a.uid and c.uid is null and l.format = 'sessions'
  ),
  joined as (
    select
      a.uid,
      a.uname,
      blk.bid,
      blk.format,
      case
        when blk.bid is null then null
        when blk.format = 'sessions' then
          -- Uncapped: a run that outlives its planned length keeps counting,
          -- and completions are filed under this same number.
          greatest(floor((t.d - blk.block_start_date) / 7.0)::int + 1, 1)
        else least(
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
      when j.format = 'sessions' then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'spcWorkoutId', w.id,
            'sessionNumber', w.session_number,
            'title', w.title,
            -- The CALENDAR week, not the authored 1. See the header.
            'weekNumber', j.wnum,
            'movedFromWeek', null,
            'completed', exists (
              select 1 from programming.session_completions sc
              where sc.user_id = j.uid
                and sc.spc_workout_id = w.id
                and sc.week_number = j.wnum
            ),
            -- One row per session, so the weeks it has been done are simply
            -- the distinct weeks its own completions were filed under.
            'loggedCount', (
              select count(distinct sc2.week_number)
              from programming.session_completions sc2
              where sc2.user_id = j.uid
                and sc2.spc_workout_id = w.id
            )
          ) order by w.session_number
        )
        from programming.spc_workouts w
        where w.spc_block_id = j.bid
          and w.status = 'published'
      ), '[]'::jsonb)
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'spcWorkoutId', w.id,
            'sessionNumber', w.session_number,
            'title', w.title,
            -- The authored week, which is what a completion is keyed on. The
            -- caller must hand this back when it finalizes, never j.wnum.
            'weekNumber', w.week_number,
            'movedFromWeek', case when w.scheduled_week is null then null else w.week_number end,
            'completed', exists (
              select 1 from programming.session_completions sc
              where sc.user_id = j.uid
                and sc.spc_workout_id = w.id
                and sc.week_number = w.week_number
            ),
            'loggedCount', (
              select count(distinct w2.week_number)
              from programming.spc_workouts w2
              where w2.spc_block_id = j.bid
                and w2.session_number = w.session_number
                and exists (
                  select 1 from programming.session_completions sc2
                  where sc2.user_id = j.uid
                    and sc2.spc_workout_id = w2.id
                    and sc2.week_number = w2.week_number
                )
            )
          ) order by w.session_number
        )
        from programming.spc_workouts w
        where w.spc_block_id = j.bid
          and coalesce(w.scheduled_week, w.week_number) = j.wnum
          and w.status = 'published'
      ), '[]'::jsonb)
    end
  from joined j
  order by j.uname;
end;
$$;

-- ── Resolve a staged {client, session_number} to a real workout row ────────
create or replace function programming.hub_resolve_staged(p_staged_id uuid, p_on_date date default null)
returns table (
  user_id uuid,
  client_name text,
  session_number smallint,
  spc_workout_id uuid,
  week_number smallint,
  reason text
)
language plpgsql
stable
security definer
set search_path = programming, core, public
as $$
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with t as (select coalesce(p_on_date, (now() at time zone 'America/Boise')::date) as d),
  sc as (
    select * from programming.hub_staged_clients where staged_session_id = p_staged_id
  ),
  covering as (
    select distinct on (b.spc_client_id)
      b.spc_client_id as uid,
      b.id as bid,
      b.block_start_date,
      b.block_length_weeks,
      b.format
    from programming.spc_blocks b, t
    where b.status = 'active'
      and b.block_start_date <= t.d
      and (
        (b.format = 'weekly' and b.block_end_date >= t.d)
        -- status is asserted on the sessions arm only, so the weekly arm
        -- stays byte-identical to what it was. A demoted program has its
        -- dates cleared (endProgramsBefore), so this is belt to that brace.
        or (b.format = 'sessions' and b.status = 'active'
            and (b.block_end_date is null or b.block_end_date >= t.d))
      )
    order by
      b.spc_client_id,
      (exists (
        select 1 from programming.spc_workouts w
        where w.spc_block_id = b.id and w.status = 'published'
      )) desc,
      b.block_start_date desc
  ),
  lapsed as (
    select distinct on (b.spc_client_id)
      b.spc_client_id as uid,
      b.id as bid,
      b.block_start_date,
      b.block_length_weeks,
      b.format
    from programming.spc_blocks b, t
    where b.status = 'active'
      and b.block_start_date <= t.d
    order by b.spc_client_id, b.block_start_date desc, b.id desc
  ),
  blk as (
    select
      s.uid,
      coalesce(c.bid, l.bid) as bid,
      coalesce(c.block_start_date, l.block_start_date) as block_start_date,
      coalesce(c.block_length_weeks, l.block_length_weeks) as block_length_weeks,
      coalesce(c.format, l.format) as format
    -- Aliased to uid deliberately: a bare user_id here is ambiguous against
    -- this function's own OUT parameter of that name.
    from (select distinct sc.user_id as uid from sc) s
    left join covering c on c.uid = s.uid
    left join lapsed l on l.uid = s.uid and c.uid is null and l.format = 'sessions'
  ),
  resolved as (
    select
      sc.user_id as uid,
      sc.client_name as cname,
      sc.session_number as snum,
      sc.position as pos,
      blk.bid,
      blk.format,
      case
        when blk.bid is null then null
        when blk.format = 'sessions' then
          greatest(floor((t.d - blk.block_start_date) / 7.0)::int + 1, 1)
        else least(
          greatest(floor((t.d - blk.block_start_date) / 7.0)::int + 1, 1),
          blk.block_length_weeks
        )
      end::smallint as wnum
    from sc
    left join blk on blk.uid = sc.user_id
    cross join t
  )
  select
    r.uid,
    r.cname,
    r.snum,
    w.id,
    r.wnum,
    case
      when r.bid is null then 'No block running'
      -- Says WHICH week, because "nothing published this week" against a
      -- sheet that is visibly full of lifts reads as a lie. The lifts are
      -- there; they just haven't been published for the week that runs.
      -- A sessions-format run has no per-week publish, so its version of
      -- this names the session instead of a week that means nothing.
      when w.id is null and r.format = 'sessions' then 'Session ' || r.snum || ' not published yet'
      when w.id is null then 'Week ' || r.wnum || ' not published yet'
      else null
    end
  from resolved r
  left join programming.spc_workouts w
    on w.spc_block_id = r.bid
   and w.session_number = r.snum
   and w.status = 'published'
   and (r.format = 'sessions' or w.week_number = r.wnum)
  order by r.pos;
end;
$$;
