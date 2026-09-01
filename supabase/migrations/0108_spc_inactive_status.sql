-- "SPC off" and "SPC paused" stop being the same thing.
--
-- THE PROBLEM. The SPC switch on a client's detail page wrote status='paused'
-- when turned off, so it could be turned back on without losing her coach,
-- frequency and notes. But 'paused' is also a real, deliberate state a coach
-- sets from the SPC page — "on hold, don't write her a program right now" —
-- and the SPC roster shows paused clients because that is exactly who a coach
-- needs to remember to resume. So switching someone off left them sitting on
-- the SPC list forever, labelled as though they were coming back.
--
-- THE FIX. A third value, 'inactive': not an SPC client. The roster queries
-- (getSpcRoster, getSpcRosterDetail) exclude it, so an unenrolled client
-- disappears from the SPC list the way she should, while her row — and every
-- program, log and completion hanging off it — survives untouched for the day
-- she comes back. Paused goes back to meaning only what it says.
--
--   active    training, on the roster
--   paused    on hold, still on the roster (the coach's own reminder)
--   inactive  not an SPC client; off the roster entirely
--
-- isSpcActive() (spcClients.js) — the check every member-facing SPC screen
-- runs — becomes status === 'active', which is the same answer it gave before
-- for both existing values. Row existence still is not enrolment.
--
-- ORDER MATTERS, opposite way round from 0099. That migration NARROWED the
-- domain, so the update had to run with no constraint attached. This one
-- WIDENS it: every current value is legal under the new constraint, so the
-- constraint goes on first and the update follows. Dropping and re-adding
-- rather than editing, because a CHECK cannot be altered in place.
--
-- BACKFILL. All four currently-paused clients become 'inactive' — Terra's
-- call, 2026-08-31. Until today the client-detail switch was the only way
-- most people reached 'paused' at all, so "paused" in the existing data means
-- "switched off" far more often than it means "on hold", and re-pausing
-- someone is one click. Their prior values are captured first.
--
-- ROLLBACK:
--   update programming.spc_clients c set status = b.status
--     from programming.zz_spc_status_backup_0108 b where b.user_id = c.user_id;
--   alter table programming.spc_clients drop constraint spc_clients_status_check;
--   alter table programming.spc_clients add constraint spc_clients_status_check
--     check (status in ('active','paused'));
--   -- plus restore hub_startable_clients' predicate to
--   --   where coalesce(c.status, '') <> 'paused'

-- A plain `create table as` lands in an exposed schema with no RLS (the 0099
-- lesson), so lock it down in the same breath.
create table if not exists programming.zz_spc_status_backup_0108 as
  select user_id, status, now() as captured_at from programming.spc_clients;
alter table programming.zz_spc_status_backup_0108 enable row level security;
revoke all on programming.zz_spc_status_backup_0108 from anon, authenticated;

alter table programming.spc_clients drop constraint if exists spc_clients_status_check;

alter table programming.spc_clients add constraint spc_clients_status_check
  check (status in ('active', 'paused', 'inactive'));

update programming.spc_clients set status = 'inactive' where status = 'paused';

-- The wall display's client picker asked "not paused", which lets an
-- unenrolled client straight through. Re-created verbatim from the live
-- definition with that one predicate changed — diff it against
-- pg_get_functiondef before touching it again (the 0106 lesson).
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
