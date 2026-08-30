-- 0101_spc_scheduled_week.sql
--
-- Phase 4 of the SPC calendar rework: a session can be moved to a different
-- week of its own block without rewriting the block.
--
-- Why a second column rather than just changing week_number: SPC completions
-- are keyed on (user_id, spc_workout_id, week_number) with a unique index
-- (0007), so rewriting the authored week would silently desync every
-- completion already recorded against that row. Keeping both also means the
-- print sheet keeps printing the block AS AUTHORED, which is what the paper
-- template is for, and undoing a move is clearing one field.
--
-- Everything that asks "which week is this session in" reads
-- coalesce(scheduled_week, week_number). Everything that records or looks up
-- a COMPLETION keeps using the authored week_number. That split is the whole
-- design; if the two are ever conflated a completion lands somewhere nothing
-- can find it.
--
-- Null = its authored week, so every existing row is unaffected and there is
-- nothing to backfill.

alter table programming.spc_workouts
  add column if not exists scheduled_week smallint;

-- >= 1 is all a plain CHECK can say — the upper bound lives on the parent
-- block, which a row-level CHECK cannot reach. The trigger below is what
-- actually holds the "a session stays inside its block" rule.
alter table programming.spc_workouts
  drop constraint if exists spc_workouts_scheduled_week_range;
alter table programming.spc_workouts
  add constraint spc_workouts_scheduled_week_range
  check (scheduled_week is null or scheduled_week >= 1);

-- Fires only when a move is actually being recorded (the WHEN clause), so the
-- builder's ordinary saves, copies and bulk publishes never pay for the
-- lookup. A session missed in the final week has nowhere to go: extend the
-- block (that already exists) or let it drop.
create or replace function programming.assert_scheduled_week_in_block()
returns trigger
language plpgsql
security definer
set search_path = programming
as $$
declare
  len smallint;
begin
  select block_length_weeks into len from programming.spc_blocks where id = new.spc_block_id;
  if len is null then
    raise exception 'spc_workouts.scheduled_week: block % not found', new.spc_block_id;
  end if;
  if new.scheduled_week > len then
    raise exception 'scheduled_week % is past the end of a %-week block', new.scheduled_week, len
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists spc_workouts_scheduled_week_in_block on programming.spc_workouts;
create trigger spc_workouts_scheduled_week_in_block
  before insert or update of scheduled_week, spc_block_id on programming.spc_workouts
  for each row
  when (new.scheduled_week is not null)
  execute function programming.assert_scheduled_week_in_block();

-- The wall display's staging picker has to see a make-up in the week it was
-- moved to, or a coach stages tomorrow's board off the block as authored and
-- the session she moved never appears.
--
-- Only the "which sessions belong to this calendar week" filter is coalesced.
-- `completed` and `loggedCount` still match on the workout's own authored
-- week_number, because that is what session_completions stores. Before this
-- change `completed` compared against j.wnum, which was identical to
-- w.week_number while nothing could move; it is now written the way it always
-- meant.
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

notify pgrst, 'reload schema';
