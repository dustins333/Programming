-- 0115_hub_startable_last_logged.sql
--
-- One date per session pill: when this client last finalized THAT session.
--
-- Why it matters on the floor: an SPC client with one completion against each
-- of her sessions reads identically on every pill — "Session 1 (1) ·
-- Session 2 (1)" cannot say which she did most recently, which is exactly the
-- decision a coach is making when putting her on the board. loggedCount
-- answers "how much", this answers "when last".
--
-- Same scope as loggedCount in every arm, so the two can never describe
-- different sets of completions: block-scoped, and counting the current week.
-- Null when she has never logged that session.
--
-- Returned as a timestamptz, not a date. The client renders it through
-- dateInBoise — reading a Boise-local date off a UTC timestamp with a string
-- slice is the bug this codebase keeps re-learning.
--
-- Additive only: `lastLoggedAt` joins the existing keys on each session
-- object, the function's signature is unchanged, and a caller that doesn't
-- read it is unaffected. The rest of the body is byte-identical to what was
-- live before this ran (extracted with pg_get_functiondef and diffed).

CREATE OR REPLACE FUNCTION programming.hub_startable_clients()
 RETURNS TABLE(user_id uuid, name text, block_id uuid, week_number smallint, sessions jsonb, program_kind text, program_id uuid, program_name text)
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
  active as (
    select c.user_id as uid, u.name as uname
    from programming.spc_clients c
    join core.users u on u.id = c.user_id
    -- 0108: three enrolment states now. 'inactive' means she is no longer
    -- an SPC client at all, so the test is positive rather than "not
    -- paused" — otherwise a switched-off client keeps appearing on the
    -- wall display's picker. Identical for the active/paused pair.
    where c.status = 'active'
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
  ),
  -- ── group arm ────────────────────────────────────────────────────────────
  -- One block per PROGRAM (not per client): a group block is shared, which is
  -- the whole reason LLYL is a group. Same "prefer the one with published
  -- content" tiebreak the SPC arm uses.
  g_blk as (
    select distinct on (gb.group_program_id)
      gb.group_program_id as pid,
      gb.id as bid,
      gb.block_start_date,
      gb.block_length_weeks
    from programming.group_blocks gb, t
    where gb.block_start_date <= t.d
      and gb.block_end_date >= t.d
    order by
      gb.group_program_id,
      (exists (
        select 1 from programming.group_workouts w
        where w.block_id = gb.id and w.status = 'published'
      )) desc,
      gb.block_start_date desc
  ),
  g_joined as (
    select
      cpa.user_id as uid,
      u.name as uname,
      gp.id as pid,
      gp.name as pname,
      b.bid,
      case
        when b.bid is null then null
        else least(
          greatest(floor((t.d - b.block_start_date) / 7.0)::int + 1, 1),
          b.block_length_weeks
        )
      end::smallint as wnum
    from programming.client_program_assignments cpa
    join programming.group_programs gp on gp.id = cpa.group_program_id
    join core.users u on u.id = cpa.user_id
    left join g_blk b on b.pid = gp.id
    cross join t
    where gp.hub_enabled
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
            -- The CALENDAR week, not the authored 1. See 0104's header.
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
            ),
            -- Newest finalize of this session, anywhere in the run. Same
            -- scope as loggedCount, so "3 times, last on the 28th" is one
            -- consistent answer. Null when she has never logged it.
            'lastLoggedAt', (
              select max(sc3.completed_at)
              from programming.session_completions sc3
              where sc3.user_id = j.uid
                and sc3.spc_workout_id = w.id
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
            ),
            'lastLoggedAt', (
              select max(sc3.completed_at)
              from programming.spc_workouts w3
              join programming.session_completions sc3
                on sc3.spc_workout_id = w3.id
               and sc3.week_number = w3.week_number
              where w3.spc_block_id = j.bid
                and w3.session_number = w.session_number
                and sc3.user_id = j.uid
            )
          ) order by w.session_number
        )
        from programming.spc_workouts w
        where w.spc_block_id = j.bid
          and coalesce(w.scheduled_week, w.week_number) = j.wnum
          and w.status = 'published'
      ), '[]'::jsonb)
    end,
    'spc'::text,
    null::uuid,
    null::text
  from joined j

  union all

  select
    g.uid,
    g.uname,
    g.bid,
    g.wnum,
    case
      when g.bid is null or g.wnum is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'spcWorkoutId', null,
            'groupWorkoutId', w.id,
            'sessionNumber', w.session_number,
            'title', w.title,
            -- The authored week IS the calendar week for a group block, and
            -- a group completion ignores it entirely (see header note 2).
            -- Carried only so the board can print "Week 5".
            'weekNumber', w.week_number,
            'movedFromWeek', null,
            'completed', exists (
              select 1 from programming.session_completions sc
              where sc.user_id = g.uid
                and sc.group_workout_id = w.id
            ),
            'loggedCount', (
              select count(distinct w2.week_number)
              from programming.group_workouts w2
              where w2.block_id = g.bid
                and w2.session_number = w.session_number
                and exists (
                  select 1 from programming.session_completions sc2
                  where sc2.user_id = g.uid
                    and sc2.group_workout_id = w2.id
                )
            ),
            'lastLoggedAt', (
              select max(sc3.completed_at)
              from programming.group_workouts w3
              join programming.session_completions sc3
                on sc3.group_workout_id = w3.id
              where w3.block_id = g.bid
                and w3.session_number = w.session_number
                and sc3.user_id = g.uid
            )
          ) order by w.session_number
        )
        from programming.group_workouts w
        where w.block_id = g.bid
          and w.week_number = g.wnum
          and w.status = 'published'
      ), '[]'::jsonb)
    end,
    'group'::text,
    g.pid,
    g.pname
  from g_joined g
  order by 2, 6;
end;
$function$
;
