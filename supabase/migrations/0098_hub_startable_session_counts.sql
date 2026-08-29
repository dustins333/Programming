-- 0098_hub_startable_session_counts.sql
--
-- One number per session pill: how many times this client has logged THAT
-- session across the whole current block.
--
-- Why it matters on the floor: SPC clients do their sessions out of order and
-- miss them. "Session 1 (6) · Session 2 (7)" tells a coach at a glance that
-- Session 1 is the one behind, which is the actual decision being made when
-- staging tomorrow's board. The existing `completed` flag only answers "has
-- she done it THIS week", which cannot say that.
--
-- Counted over the block, not over all time: a block is the unit a coach
-- thinks in, and a count spanning three blocks would only say who has been
-- here longest. Distinct week_number, so a completion row that somehow
-- appeared twice for one week still counts once.
--
-- Additive only. `loggedCount` joins the existing keys on each session
-- object; every existing caller keeps working untouched, and a caller that
-- doesn't read it is unaffected.

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
    select
      a.uid,
      a.uname,
      blk.bid,
      case
        when blk.uid is null then null
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
            ),
            -- Every week of this block whose row for THIS session number has
            -- a completion. Counts the current week too: it is a tally of
            -- what has been done, not of what is left.
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
          and w.week_number = j.wnum
          and w.status = 'published'
      ), '[]'::jsonb)
    end
  from joined j
  order by j.uname;
end;
$$;
