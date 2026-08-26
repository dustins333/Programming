-- 0090_hub_staged_sessions.sql
--
-- Staging: build tomorrow's board tonight.
--
-- A coach running a 5am session was picking four clients on a wall
-- touchscreen at 4:55am, which is both the worst moment to do it and the
-- worst place — the reviewing you actually want to do (what did she move
-- last week, which session is she on) happens on the couch the night
-- before. So the picking moves to the phone, ahead of time, and the board
-- becomes: PIN, tap "5:00 (4)", go.
--
-- WHAT A STAGED SLOT STORES, AND WHY IT IS NOT A WORKOUT ROW.
-- hub_session_clients points at one spc_workouts row — a specific week of a
-- specific session. That is right for a session starting now and wrong for
-- one staged twelve hours ahead: the block's week rolls over at midnight,
-- and a coach may publish or re-write between staging and 5am. So a staged
-- slot holds the SESSION NUMBER, which is stable for the life of the block,
-- and the workout row is resolved at start (hub_resolve_staged). Stage
-- "Session 2" tonight, get week 4's Session 2 in the morning.
--
-- FINALIZED vs DRAFT. Staging is assembled one client at a time across the
-- roster and the preview sheet, so there has to be a moment that says "this
-- group is done" — otherwise a half-built group is indistinguishable from a
-- finished one and the board would offer both. finalized_at is that moment.
-- Only finalized groups reach the wall. It is not a lock: a finalized group
-- can still be edited, and only disappears if it is emptied or started.
--
-- ONE DRAFT PER COACH (partial unique index below) so "resume where I left
-- off" is unambiguous when the roster reopens, and half-built groups cannot
-- accumulate.
--
-- THE DISPLAY GETS NO POLICIES ON THESE TABLES AT ALL. Everything the wall
-- can see or do goes through a PIN-verified security-definer function, the
-- same shape as 0083's hub_start_session: the board cannot enumerate a
-- coach's staged sessions, only the coach who just proved a PIN can. Names
-- are snapshotted onto the slot row for the same reason they are on
-- hub_session_clients — the display account has no core.users read at all.
--
-- ORDER MATTERS: tables, then functions, then policies. A policy resolves
-- every table it names at CREATE POLICY time (this exact ordering bug broke
-- 0036 in production).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table programming.hub_staged_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references core.users (id) on delete cascade,
  -- Snapshot, same reason as hub_sessions.coach_name (0076): the wall names
  -- the coach without reading core.users.
  coach_name text,
  -- The morning this is FOR. Staging is a night-before act, so a group is
  -- pinned to a date rather than "today", and the board only ever offers
  -- today's — which is also the expiry rule, with nothing to sweep up.
  scheduled_date date not null,
  scheduled_time time not null,
  title text,
  finalized_at timestamptz,
  started_at timestamptz,
  created_at timestamptz not null default now()
);

create index hub_staged_sessions_coach_idx
  on programming.hub_staged_sessions (coach_id, scheduled_date);

create unique index hub_staged_sessions_one_draft_idx
  on programming.hub_staged_sessions (coach_id)
  where finalized_at is null and started_at is null;

create table programming.hub_staged_clients (
  id uuid primary key default gen_random_uuid(),
  staged_session_id uuid not null references programming.hub_staged_sessions (id) on delete cascade,
  user_id uuid not null references core.users (id) on delete cascade,
  client_name text not null,
  -- Stable across the block. See the header.
  session_number smallint not null,
  position smallint not null check (position between 1 and 4),
  unique (staged_session_id, position),
  unique (staged_session_id, user_id)
);

create index hub_staged_clients_session_idx
  on programming.hub_staged_clients (staged_session_id);

alter table programming.hub_staged_sessions enable row level security;
alter table programming.hub_staged_clients enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Functions
-- ---------------------------------------------------------------------------
-- Turn a staged group's session NUMBERS into the spc_workouts rows they mean
-- today, or a reason they mean nothing. Mirrors hub_startable_clients (0084)
-- exactly — same "current block" rule, same week arithmetic, same
-- published-only gate — so a client the picker calls startable and a client
-- this resolves can never disagree.
--
-- A null spc_workout_id is not an error: a staged group where one of four
-- can't start should start the other three and say who was dropped, at 5am,
-- rather than refuse the session over it.
create or replace function programming.hub_resolve_staged(p_staged_id uuid)
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
  with t as (select (now() at time zone 'America/Boise')::date as d),
  sc as (
    select * from programming.hub_staged_clients where staged_session_id = p_staged_id
  ),
  -- Same rule as getCurrentSpcBlock: prefer whichever overlapping block
  -- actually has published content, then the most recently started. A draft
  -- block (0089) has no dates, so the date test excludes it on its own; the
  -- status test is here so that stays true if drafts ever gain dates.
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
      when w.id is null then 'Nothing published this week'
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

-- What the wall offers after a PIN: that coach's finalized, unstarted groups
-- FOR TODAY. Each client carries whether it currently resolves, so "Rae has
-- nothing published this week" is visible on the card before anyone taps
-- Start rather than reported afterwards.
create or replace function programming.hub_staged_for_pin(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = programming, core, public
as $$
declare
  v_coach uuid;
  v_out jsonb;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coach_id into v_coach from programming.hub_verify_pin(p_pin);
  if v_coach is null then
    raise exception 'That PIN did not match a coach.';
  end if;

  select coalesce(jsonb_agg(x order by x ->> 'scheduledTime'), '[]'::jsonb)
    into v_out
  from (
    select jsonb_build_object(
      'id', s.id,
      'scheduledTime', to_char(s.scheduled_time, 'HH24:MI'),
      'title', s.title,
      'clients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'userId', r.user_id,
            'name', r.client_name,
            'sessionNumber', r.session_number,
            'resolvable', r.spc_workout_id is not null,
            'reason', r.reason
          )
        )
        from programming.hub_resolve_staged(s.id) r
      ), '[]'::jsonb)
    ) as x
    from programming.hub_staged_sessions s
    where s.coach_id = v_coach
      and s.finalized_at is not null
      and s.started_at is null
      and s.scheduled_date = (now() at time zone 'America/Boise')::date
  ) q;

  return v_out;
end;
$$;

-- "Lauren has 6:00 staged — start it?" straight after a session ends at the
-- wall. Count only: the board already knows whose session it just ended (it
-- can read the open session's coach), and starting still needs the PIN.
create or replace function programming.hub_staged_count_for_coach(p_coach_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = programming, core, public
as $$
declare
  v_n integer;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select count(*) into v_n
  from programming.hub_staged_sessions s
  where s.coach_id = p_coach_id
    and s.finalized_at is not null
    and s.started_at is null
    and s.scheduled_date = (now() at time zone 'America/Boise')::date;
  return v_n;
end;
$$;

-- Start a staged group. Takes the PIN when the wall is asking (re-verified
-- here, so the board cannot attribute a session to a coach whose PIN it does
-- not have) and nothing when the coach's own phone is, where they are already
-- signed in.
--
-- Resolution happens BEFORE the open session is ended: a staged group that
-- resolves to nobody must fail loudly having changed nothing, not take the
-- running board down with it.
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
  end loop;

  update programming.hub_staged_sessions set started_at = now() where id = p_staged_id;

  return jsonb_build_object('sessionId', v_session, 'started', v_started, 'skipped', v_skipped);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------
-- Own groups only. A coach staging their 5am has no reason to edit anyone
-- else's, and the wall reaches these rows through the PIN-verified functions
-- above rather than through any policy here.
create policy "staff manage own staged sessions" on programming.hub_staged_sessions
  for all using (core.can_access_spc() and coach_id = auth.uid())
  with check (core.can_access_spc() and coach_id = auth.uid());

create policy "staff manage own staged clients" on programming.hub_staged_clients
  for all using (
    core.can_access_spc()
    and exists (
      select 1 from programming.hub_staged_sessions s
      where s.id = staged_session_id and s.coach_id = auth.uid()
    )
  )
  with check (
    core.can_access_spc()
    and exists (
      select 1 from programming.hub_staged_sessions s
      where s.id = staged_session_id and s.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
grant execute on function programming.hub_resolve_staged(uuid) to authenticated;
grant execute on function programming.hub_staged_for_pin(text) to authenticated;
grant execute on function programming.hub_staged_count_for_coach(uuid) to authenticated;
grant execute on function programming.hub_start_staged(uuid, text) to authenticated;

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
