-- 0084_startable_clients_between_blocks.sql
--
-- Two pickers, one list. The coach's phone used to list every active SPC
-- client and only tell you a name was unusable AFTER you picked it — which on
-- real data means 72 names of which 62 fail, because an spc_clients row gets
-- created by the enrolment toggle whether or not anyone ever programmed a
-- block for that person. The board's picker (0083) asks the database which
-- clients are actually startable instead, and that is the one to keep; this
-- migration only widens it slightly so the phone can share it.
--
-- WHAT CHANGES: a client who HAS had blocks but has none covering today is
-- now returned, with a null week and no sessions, so the list can say "No
-- block running" instead of silently omitting her. Measured today that is
-- zero people — but it is every client the day her block ends, and a name
-- quietly missing from the picker is the kind of thing a coach hunts for.
--
-- WHAT DOESN'T: a client who has never had a block at all is still absent.
-- That is 62 of the 72 active rows; showing them greyed out would bury the
-- ten real ones and recreate exactly the problem this fixes. They are not
-- mid-programme, they are un-programmed, and the fix for them is a block —
-- which happens on her SPC page, not on a picker.

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
  -- Active, and programmed at least once. The exists() is what keeps the 62
  -- never-programmed enrolment rows out of the list.
  active as (
    select c.user_id as uid, u.name as uname
    from programming.spc_clients c
    join core.users u on u.id = c.user_id
    where coalesce(c.status, '') <> 'paused'
      and exists (select 1 from programming.spc_blocks b where b.spc_client_id = c.user_id)
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
$$;
