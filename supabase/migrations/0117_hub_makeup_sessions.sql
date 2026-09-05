-- 0117_hub_makeup_sessions.sql
--
-- "She already logged Session 1 this week — open that one, or start a new
-- one?" That choice has existed on the coach's picker since 0104 and has
-- NEVER once worked from the wall display: the picker created the second
-- completion at PICK time, and the display's only write policy on
-- session_completions is
--
--     is_gym_display() AND hub_active_client(user_id)
--
-- — which is false for a client who is not on the board YET, i.e. every
-- client being picked. Every "Start a new one" from the TV died on a 42501.
-- Confirmed against live data both ways before writing this: the same insert
-- succeeds for a client already on the board and is refused for one who is
-- not. The three second-instance rows that do exist all came from the
-- MEMBER's own My Week sheet, which writes as the member and so was never
-- affected — which is exactly the split the coaches reported.
--
-- The fix is to stop writing at pick time. The picker now only records the
-- INTENT, and the make-up completion is opened once she is actually on the
-- board — at which point the display's existing policy already permits it,
-- with no widening. That also kills a second, quieter bug: cancelling the
-- picker used to leave a phantom instance-2 completion behind, which My Week
-- counts as a session she never did.
--
-- Deferring is also what lets STAGING offer the choice at all. A staged slot
-- persists overnight, so the intent rides on the row (new_instance) and fires
-- when the group starts.
--
-- What this adds:
--   1. hub_staged_clients.new_instance — the intent, for staged groups.
--   2. hub_open_makeup() — the single definition of "open a second one".
--   3. hub_resolve_staged() returns new_instance (return type changes, so
--      DROP + CREATE; the body is otherwise byte-identical).
--   4. hub_start_staged() opens the make-up for flagged rows it started.
--
-- Rollback:
--   drop function if exists programming.hub_open_makeup(uuid, uuid, smallint);
--   alter table programming.hub_staged_clients drop column if exists new_instance;
--   -- then re-create hub_resolve_staged / hub_start_staged from 0091 / 0104.

/* ─────────────────────────────────────────────── 1. the staged intent ──── */

-- Default false, so every staged row that exists today keeps behaving exactly
-- as it does: pick her session, start it, finalize updates the week's latest
-- instance. Nothing to backfill.
alter table programming.hub_staged_clients
  add column if not exists new_instance boolean not null default false;

comment on column programming.hub_staged_clients.new_instance is
  'Coach answered "start a new one" when staging: open a second completion for this session''s week when the group starts. Advisory only — hub_open_makeup does nothing if she turns out not to have logged it after all.';

/* ─────────────────────────────────────────────── 2. open a make-up ─────── */

-- The one definition of "she is doing this session again". Called by the app
-- immediately after a client lands on the board, and by hub_start_staged for
-- a flagged staged row.
--
-- SECURITY DEFINER, and deliberately gated on the client being on the OPEN
-- board with THIS workout — so the display's reach is exactly what it already
-- was (hub_active_client's rule, plus the workout), not one row wider.
--
-- The week is a parameter rather than re-derived here. Every caller already
-- holds the authoritative value from the same RPC family
-- (hub_startable_clients / hub_resolve_staged both compute it), and the JS
-- side derives it in spcCompletionWeek — a fourth copy of the block-week
-- arithmetic is a fourth thing to drift.
--
-- DOES NOTHING when she has no completion for that week yet, returning null.
-- That is what makes a stale intent harmless: a group staged on Sunday for
-- Monday crosses a block week, where she has logged nothing, and the ordinary
-- finalize path creating instance 1 is exactly right. Never invent a
-- completion for a session she has not done — the board would open washed
-- green and her week would count a session that never happened.
create or replace function programming.hub_open_makeup(
  p_user_id uuid,
  p_spc_workout_id uuid,
  p_week_number smallint
)
returns smallint
language plpgsql
security definer
set search_path = programming, core, public
as $$
declare
  v_instance smallint;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_spc_workout_id is null or p_week_number is null then
    return null;
  end if;

  if not exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
     where hs.ended_at is null
       and hc.removed_at is null
       and hc.user_id = p_user_id
       and hc.spc_workout_id = p_spc_workout_id
  ) then
    raise exception 'She is not on the board for that session.';
  end if;

  select max(sc.instance) into v_instance
    from programming.session_completions sc
   where sc.user_id = p_user_id
     and sc.spc_workout_id = p_spc_workout_id
     and sc.week_number = p_week_number;

  -- Nothing logged for that week: there is nothing to make up.
  if v_instance is null then
    return null;
  end if;

  insert into programming.session_completions
    (user_id, spc_workout_id, week_number, instance, completed_at)
  values
    (p_user_id, p_spc_workout_id, p_week_number, v_instance + 1, now());

  return (v_instance + 1)::smallint;
end;
$$;

revoke all on function programming.hub_open_makeup(uuid, uuid, smallint) from public;
grant execute on function programming.hub_open_makeup(uuid, uuid, smallint) to authenticated;

/* ──────────────────────────────── 3. resolve_staged carries the intent ── */

-- Return type changes, so this is a DROP + CREATE. The body below is the live
-- 0104 definition with two additions and nothing else: sc.new_instance in the
-- `resolved` CTE and in the final select.
drop function if exists programming.hub_resolve_staged(uuid, date);

create function programming.hub_resolve_staged(p_staged_id uuid, p_on_date date default null)
returns table (
  user_id uuid,
  client_name text,
  session_number smallint,
  spc_workout_id uuid,
  week_number smallint,
  reason text,
  new_instance boolean
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
      sc.new_instance as newinst,
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
    end,
    r.newinst
  from resolved r
  left join programming.spc_workouts w
    on w.spc_block_id = r.bid
   and w.session_number = r.snum
   and w.status = 'published'
   and (r.format = 'sessions' or w.week_number = r.wnum)
  order by r.pos;
end;
$$;

revoke all on function programming.hub_resolve_staged(uuid, date) from public;
grant execute on function programming.hub_resolve_staged(uuid, date) to authenticated;

/* ─────────────────────────── 4. start_staged opens flagged make-ups ───── */

-- Identical to the live 0104 body apart from the hub_open_makeup call in the
-- insert loop. It runs AFTER the board rows are inserted, in the same
-- transaction, so hub_open_makeup's "is she on the board" check sees them.
create or replace function programming.hub_start_staged(p_staged_id uuid, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = programming, core, public
as $$
declare
  v_coach uuid;
  v_coach_name text;
  v_staged programming.hub_staged_sessions%rowtype;
  v_session uuid;
  v_pos smallint := 0;
  v_started jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  r record;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_pin is not null then
    select coach_id into v_coach from programming.hub_verify_pin(p_pin);
    if v_coach is null then
      raise exception 'That PIN did not match a coach.';
    end if;
  else
    v_coach := auth.uid();
    if v_coach is null then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;

  select * into v_staged from programming.hub_staged_sessions where id = p_staged_id;
  if v_staged.id is null then
    raise exception 'That staged session no longer exists.';
  end if;
  if v_staged.coach_id <> v_coach then
    raise exception 'That staged session belongs to another coach.';
  end if;
  if v_staged.started_at is not null then
    raise exception 'That staged session has already been started.';
  end if;

  for r in select * from programming.hub_resolve_staged(p_staged_id) loop
    if r.spc_workout_id is null then
      v_skipped := v_skipped || jsonb_build_object('name', r.client_name, 'reason', r.reason);
    else
      v_started := v_started || jsonb_build_object('name', r.client_name);
    end if;
  end loop;

  if jsonb_array_length(v_started) = 0 then
    raise exception 'Nobody in this group can start right now — their blocks have ended or nothing is published this week.';
  end if;

  -- One open session at a time (hub_sessions_one_open_idx enforces it too).
  -- The caller warns before this point when someone else is mid-session;
  -- by here the answer is already yes.
  update programming.hub_sessions set ended_at = now() where ended_at is null;

  select u.name into v_coach_name from core.users u where u.id = v_coach;

  insert into programming.hub_sessions (coach_id, coach_name)
  values (v_coach, coalesce(v_coach_name, v_staged.coach_name))
  returning id into v_session;

  for r in select * from programming.hub_resolve_staged(p_staged_id) loop
    continue when r.spc_workout_id is null;
    v_pos := v_pos + 1;
    insert into programming.hub_session_clients
      (hub_session_id, user_id, client_name, spc_workout_id, week_number, position)
    values (v_session, r.user_id, r.client_name, r.spc_workout_id, r.week_number, v_pos);

    -- She is on the board now, so this is permitted. A no-op when she turns
    -- out not to have logged that session this week.
    if r.new_instance then
      perform programming.hub_open_makeup(r.user_id, r.spc_workout_id, r.week_number);
    end if;
  end loop;

  update programming.hub_staged_sessions set started_at = now() where id = p_staged_id;

  return jsonb_build_object('sessionId', v_session, 'started', v_started, 'skipped', v_skipped);
end;
$$;

notify pgrst, 'reload schema';
