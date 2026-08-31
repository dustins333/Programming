-- 0106_hub_group_programs.sql
--
-- A group program can go on the live board. Built for LLYL: four (soon more)
-- women who all lift the SAME program, which is precisely why it was set up
-- as a group rather than as four parallel SPC clients. Their programming does
-- not move — this only teaches the hub to read a group workout.
--
-- Opt-in per program (group_programs.hub_enabled, default false), NOT for
-- every group type. A boolean rather than a name test: this repo already has
-- a scar from "Flagship" being hardcoded in the dashboard lookup, which
-- silently hid LLYL and Trial Group from Coach Home.
--
-- ── Which code path a group program follows ────────────────────────────────
-- Until today SPC was also a week grid, so this would have been the same
-- branch. 0102/0105 moved SPC to the sessions format (one row per session,
-- recurring, calendar week computed) and converted every live client, which
-- left 0104's WEEKLY arm with no users at all. A group program revives it:
-- group_workouts is still one row per (block, week, session), which is
-- exactly what that arm resolves. So the group arms below are modelled on
-- the weekly arm, NOT on the sessions arm, and nothing here should ever be
-- "unified" with the sessions-format path.
--
-- ── Three things that differ from SPC, each forced by the model ────────────
-- 1 ▸ Four clients share ONE group_workouts row. Everything per-client is
--     keyed on user_id (logs, session_completions, exercise_completions,
--     coaching notes), so their logging stays separate with no new keys.
--     What is NOT per-client is position — so reorder is hidden for group
--     columns in the UI and gets no group RPC here. Dragging a lift would
--     rewrite that week's session for every member of the program.
--
-- 2 ▸ A group completion carries NO week number. 0040's check constraint
--     requires week_number IS NULL on the group variant, because the join
--     row is already week-specific. SPC just went the opposite way (sessions
--     format files completions UNDER the calendar week), so the two write
--     paths genuinely diverge here. hub_session_clients.week_number is
--     therefore display-only for a group slot.
--
-- 3 ▸ No ongoing programs and no lapsed fallback. 0103's "runs until you set
--     an end date" is sessions-format only, and the weekly arm requires
--     block_end_date >= today. When a group block ends with nothing queued,
--     its members drop off the picker until a new block exists. That is the
--     pre-existing weekly behaviour, deliberately not changed here.
--
-- Staging is deliberately NOT extended to group programs. hub_staged_clients
-- stores a session NUMBER and resolves it against SPC at start time (0090/
-- 0091), so a group arm would need a program reference on the staged row plus
-- arms in hub_resolve_staged and hub_start_staged. Terra doesn't need it, so
-- the picker's program selector only renders where a board is about to run.
--
-- exercise_coaching_notes needs nothing: 0087 already gave it
-- group_workout_id.
--
-- Run in the Supabase SQL Editor (or supabase db query --linked -f), then:
--   NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 1. Opt-in flag
-- ---------------------------------------------------------------------------
alter table programming.group_programs
  add column if not exists hub_enabled boolean not null default false;

comment on column programming.group_programs.hub_enabled is
  'Members of this program can be put on the SPC live board (migration 0106). Off for every program until an admin turns it on in the program settings modal.';

-- ---------------------------------------------------------------------------
-- 2. A board slot can point at a group workout instead of an SPC one
-- ---------------------------------------------------------------------------
alter table programming.hub_session_clients
  add column if not exists group_workout_id uuid
    references programming.group_workouts (id) on delete cascade;

alter table programming.hub_session_clients
  alter column spc_workout_id drop not null;

-- Exactly one of the two, same XOR shape session_completions (0007/0008) and
-- exercise_completions (0040) already use for their workout kinds.
alter table programming.hub_session_clients
  drop constraint if exists hub_session_clients_one_workout;
alter table programming.hub_session_clients
  add constraint hub_session_clients_one_workout check (
    (spc_workout_id is not null and group_workout_id is null)
    or (spc_workout_id is null and group_workout_id is not null)
  );

-- ---------------------------------------------------------------------------
-- 3. Authz for a group pick — the group twin of hub_workout_belongs_to
-- ---------------------------------------------------------------------------
-- "Is this client actually assigned to the hub-enabled program that owns this
-- published workout?" Checked server-side on every start/add, so a crafted
-- payload can't put someone on a board against programming that isn't hers.
create or replace function programming.hub_group_workout_belongs_to(p_user_id uuid, p_group_workout_id uuid)
returns boolean
language sql
security definer
set search_path = programming, public
stable
as $$
  select exists (
    select 1
    from programming.group_workouts w
    join programming.group_blocks b on b.id = w.block_id
    join programming.group_programs p on p.id = b.group_program_id
    join programming.client_program_assignments cpa
      on cpa.group_program_id = p.id and cpa.user_id = p_user_id
    where w.id = p_group_workout_id
      and w.status = 'published'
      and p.hub_enabled
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. The roster the picker works from, now with a group arm
-- ---------------------------------------------------------------------------
-- DROP + CREATE rather than CREATE OR REPLACE: the return type gains three
-- columns and Postgres won't replace a function's OUT columns in place.
--
-- The SPC arms (weekly, sessions, lapsed) are 0104's byte-for-byte. The three
-- new columns tag each row with where it came from, which is what lets one
-- picker show an SPC segment and an LLYL segment without two rosters that can
-- disagree about who is startable.
drop function if exists programming.hub_startable_clients();

create function programming.hub_startable_clients()
returns table (
  user_id uuid,
  name text,
  block_id uuid,
  week_number smallint,
  sessions jsonb,
  program_kind text,
  program_id uuid,
  program_name text
)
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
$$;

-- ---------------------------------------------------------------------------
-- 5. Start / add, taking either kind of workout
-- ---------------------------------------------------------------------------
-- Both DROP + CREATE with the new argument defaulted, so a browser tab still
-- running yesterday's JS keeps resolving: PostgREST matches a call whose named
-- params are a subset of the signature as long as the rest have defaults.
drop function if exists programming.hub_start_session(text, jsonb);

create function programming.hub_start_session(p_pin text, p_clients jsonb)
returns uuid
language plpgsql
security definer
set search_path = programming, core, extensions, public
as $$
declare
  v_coach uuid;
  v_coach_name text;
  v_session uuid;
  v_client jsonb;
  v_user uuid;
  v_workout uuid;
  v_group_workout uuid;
  v_week smallint;
  v_name text;
  v_pos smallint := 0;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coach_id, coach_name into v_coach, v_coach_name
  from programming.hub_verify_pin(p_pin);
  if v_coach is null then
    raise exception 'That PIN did not match a coach.';
  end if;

  if jsonb_typeof(p_clients) <> 'array' or jsonb_array_length(p_clients) = 0 then
    raise exception 'Pick at least one client.';
  end if;
  if jsonb_array_length(p_clients) > 4 then
    raise exception 'The board holds four clients.';
  end if;

  update programming.hub_sessions set ended_at = now() where ended_at is null;

  insert into programming.hub_sessions (coach_id, coach_name)
  values (v_coach, v_coach_name)
  returning id into v_session;

  for v_client in select * from jsonb_array_elements(p_clients) loop
    v_user := (v_client ->> 'userId')::uuid;
    v_workout := (v_client ->> 'spcWorkoutId')::uuid;
    v_group_workout := (v_client ->> 'groupWorkoutId')::uuid;
    v_week := (v_client ->> 'weekNumber')::smallint;

    if (v_workout is null) = (v_group_workout is null) then
      raise exception 'Each client needs exactly one session.';
    end if;

    if v_group_workout is not null then
      if not programming.hub_group_workout_belongs_to(v_user, v_group_workout) then
        raise exception 'That session does not belong to that client, or is not published.';
      end if;
    else
      if not programming.hub_workout_belongs_to(v_user, v_workout) then
        raise exception 'That session does not belong to that client, or is not published.';
      end if;
    end if;

    select name into v_name from core.users where id = v_user;
    if v_name is null then
      raise exception 'Unknown client.';
    end if;

    v_pos := v_pos + 1;
    insert into programming.hub_session_clients
      (hub_session_id, user_id, client_name, spc_workout_id, group_workout_id, week_number, position)
    values (v_session, v_user, v_name, v_workout, v_group_workout, v_week, v_pos);
  end loop;

  return v_session;
end;
$$;

drop function if exists programming.hub_add_client(uuid, uuid, smallint);

create function programming.hub_add_client(
  p_user_id uuid,
  p_spc_workout_id uuid,
  p_week_number smallint,
  p_group_workout_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = programming, core, public
as $$
declare
  v_session uuid;
  v_name text;
  v_pos smallint;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select id into v_session from programming.hub_sessions where ended_at is null;
  if v_session is null then
    raise exception 'No session is running.';
  end if;

  if exists (select 1 from programming.hub_session_clients where hub_session_id = v_session and user_id = p_user_id) then
    raise exception 'She is already on the board.';
  end if;

  select min(p) into v_pos
  from generate_series(1, 4) as p
  where p not in (
    select position from programming.hub_session_clients where hub_session_id = v_session
  );
  if v_pos is null then
    raise exception 'The board holds four — drop someone first.';
  end if;

  if (p_spc_workout_id is null) = (p_group_workout_id is null) then
    raise exception 'Pick exactly one session.';
  end if;

  if p_group_workout_id is not null then
    if not programming.hub_group_workout_belongs_to(p_user_id, p_group_workout_id) then
      raise exception 'That session does not belong to that client, or is not published.';
    end if;
  else
    if not programming.hub_workout_belongs_to(p_user_id, p_spc_workout_id) then
      raise exception 'That session does not belong to that client, or is not published.';
    end if;
  end if;

  select name into v_name from core.users where id = p_user_id;
  if v_name is null then
    raise exception 'Unknown client.';
  end if;

  insert into programming.hub_session_clients
    (hub_session_id, user_id, client_name, spc_workout_id, group_workout_id, week_number, position)
  values (v_session, p_user_id, v_name, p_spc_workout_id, p_group_workout_id, p_week_number, v_pos);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. What the wall display may read
-- ---------------------------------------------------------------------------
-- The TV had no read on group programming at all, so today it literally
-- cannot render one of these columns.
--
-- Scoped to the BLOCK a board workout belongs to, not to "any program a board
-- client is on". Tighter than the SPC equivalent, and deliberately so: the
-- plain Group programme has 94 members, and the day one of them lands on the
-- board a program-wide policy would open every one of their sessions to the
-- wall. The block scope is what the lift-history strip needs (every week of
-- the current block) and nothing beyond it.
-- Two security-definer predicates, for the same reason hub_active_client
-- exists (0071): a policy ON group_workouts cannot itself SELECT
-- group_workouts to find out which block the board is showing — that is
-- infinite recursion, and Postgres says so (42P17). A definer function reads
-- underneath RLS and ends the loop.
create or replace function programming.hub_active_group_workout(target uuid)
returns boolean
language sql
security definer
set search_path = programming
stable
as $$
  select exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
      join programming.group_workouts w on w.id = hc.group_workout_id
     where hs.ended_at is null
       and w.status = 'published'
       and w.id = target
  );
$$;

-- Any workout of this block is on the open board. Wider than the one above by
-- exactly one block, which is what the lift-history strip needs: "what did she
-- do on this lift in week 3" has to reach weeks that aren't on screen.
create or replace function programming.hub_active_group_block(target uuid)
returns boolean
language sql
security definer
set search_path = programming
stable
as $$
  select exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
      join programming.group_workouts w on w.id = hc.group_workout_id
     where hs.ended_at is null
       and w.block_id = target
  );
$$;

create policy "display reads hub group_workouts" on programming.group_workouts
  for select using (
    core.is_gym_display()
    and status = 'published'
    and programming.hub_active_group_block(block_id)
  );

create policy "display reads hub group_workout_exercises" on programming.group_workout_exercises
  for select using (
    core.is_gym_display()
    and programming.hub_active_group_workout(group_workout_id)
  );

create policy "display reads hub group_workout_warmups" on programming.group_workout_warmups
  for select using (
    core.is_gym_display()
    and programming.hub_active_group_workout(group_workout_id)
  );

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
grant execute on function programming.hub_group_workout_belongs_to(uuid, uuid) to authenticated;
grant execute on function programming.hub_active_group_workout(uuid) to authenticated;
grant execute on function programming.hub_active_group_block(uuid) to authenticated;
grant execute on function programming.hub_startable_clients() to authenticated;
grant execute on function programming.hub_start_session(text, jsonb) to authenticated;
grant execute on function programming.hub_add_client(uuid, uuid, smallint, uuid) to authenticated;

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- NOTIFY pgrst, 'reload schema';
