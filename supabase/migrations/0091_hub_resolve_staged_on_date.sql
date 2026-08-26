-- 0091_hub_resolve_staged_on_date.sql
--
-- Resolve a staged group against the day it is FOR, not today.
--
-- 0090 resolved every staged slot against the Boise date at the moment of
-- asking. That is right at the wall (a session starting now runs today) and
-- wrong on the phone, where the whole point is reviewing tonight what runs
-- tomorrow: a group staged on a Sunday for a Monday spans a block week
-- boundary, so the phone would grade it against the wrong week's workouts
-- and either warn about a client who is fine or stay quiet about one who
-- isn't.
--
-- DROP then CREATE, not CREATE OR REPLACE: adding a defaulted parameter
-- makes a NEW function rather than replacing the old one, and Postgres then
-- refuses every single-argument call as ambiguous.

drop function if exists programming.hub_resolve_staged(uuid);

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
  blk as (
    select distinct on (b.spc_client_id)
      b.spc_client_id as uid,
      b.id as bid,
      b.block_start_date,
      b.block_length_weeks
    from programming.spc_blocks b, t
    where b.status = 'active'
      and b.block_start_date <= t.d
      and b.block_end_date >= t.d
    order by
      b.spc_client_id,
      (exists (
        select 1 from programming.spc_workouts w
        where w.spc_block_id = b.id and w.status = 'published'
      )) desc,
      b.block_start_date desc
  ),
  resolved as (
    select
      sc.user_id as uid,
      sc.client_name as cname,
      sc.session_number as snum,
      sc.position as pos,
      blk.bid,
      case
        when blk.bid is null then null
        else least(
          greatest(floor((t.d - blk.block_start_date) / 7.0)::int + 1, 1),
          blk.block_length_weeks
        )::smallint
      end as wnum
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
      when w.id is null then 'Week ' || r.wnum || ' not published yet'
      else null
    end
  from resolved r
  left join programming.spc_workouts w
    on w.spc_block_id = r.bid
   and w.week_number = r.wnum
   and w.session_number = r.snum
   and w.status = 'published'
  order by r.pos;
end;
$$;

grant execute on function programming.hub_resolve_staged(uuid, date) to authenticated;
