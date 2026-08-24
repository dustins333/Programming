-- 0083_hub_pin_and_roster.sql
--
-- Lets the wall display start a live SPC session by itself, and lets a coach
-- add or drop a client while one is already running.
--
-- WHY THIS IS SERVER-SIDE RATHER THAN A UI CHANGE
-- 0071 walls the display account off deliberately: it has NO read policy on
-- core.users at all, every SPC read it has is gated on hub_active_client()
-- (i.e. "this person is already on the board"), and it is select-only on
-- hub_sessions — which is why ending already goes through an RPC. Starting a
-- session needs the opposite of all three: a roster to pick from, and reads of
-- a client's block BEFORE she is on the board.
--
-- Widening the display's RLS to cover that would undo the containment — the
-- TV could then read every SPC client's programming instead of the four on
-- screen. So each new capability is a narrow security-definer function
-- instead, and the display's own policies are untouched by this migration.
--
-- THE PIN
-- Tapping the clock on the idle board asks for a 4-digit PIN. It does three
-- jobs at once: it hides the button, it is what names the coach on the
-- session (so coaching notes written at the wall are attributed — 0076), and
-- it stops a member pulling a client's goal and programming onto a screen the
-- whole gym can see. It unlocks the SESSION, not each action: once a coach is
-- in, adding and dropping need no further PIN, and ending needs none at all
-- (ending clears the wall, it does not delete anything anyone logged).
--
-- Coaches set their own PIN; no admin hands them out. A coach who has not set
-- one simply starts from their phone, which is unchanged and remains the
-- fallback for a forgotten PIN or a brand-new hire.
--
-- The hash is deterministic (plain sha256, no per-row salt) because the PIN
-- alone has to identify the coach, which means the hash column has to be
-- unique. A 4-digit space would be trivially brute-forced from a leaked hash,
-- so the hashes live in their own table that NOBODY can read but their owner:
-- no display policy, no staff-reads-all policy, and verification happens
-- inside a definer function that bypasses RLS. core.users was the obvious
-- home and is the wrong one — RLS cannot restrict a policy to a subset of
-- columns, so any coach could have selected every other coach's hash.

-- ---------------------------------------------------------------------------
-- 1. Table (before every function and policy that references it)
-- ---------------------------------------------------------------------------
create table if not exists programming.coach_display_pins (
  user_id uuid primary key references core.users (id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

-- Uniqueness is a real requirement, not hygiene: the PIN alone resolves to a
-- coach, so two coaches sharing one would make attribution ambiguous.
create unique index if not exists coach_display_pins_hash_idx
  on programming.coach_display_pins (pin_hash);

alter table programming.coach_display_pins enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Functions
-- ---------------------------------------------------------------------------
create or replace function programming.hash_display_pin(p_pin text)
returns text
language sql
immutable
set search_path = extensions, public
as $$
  select encode(extensions.digest(p_pin, 'sha256'), 'hex');
$$;

-- A coach sets (or changes) their own PIN. Never an admin action.
create or replace function programming.set_own_display_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = programming, core, extensions, public
as $$
declare
  v_hash text;
  v_owner uuid;
begin
  if not core.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'A PIN is exactly four digits.';
  end if;

  v_hash := programming.hash_display_pin(p_pin);
  select user_id into v_owner from programming.coach_display_pins where pin_hash = v_hash;
  if v_owner is not null and v_owner <> auth.uid() then
    raise exception 'That PIN is already taken — pick a different one.';
  end if;

  insert into programming.coach_display_pins (user_id, pin_hash, updated_at)
  values (auth.uid(), v_hash, now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

create or replace function programming.clear_own_display_pin()
returns void
language plpgsql
security definer
set search_path = programming, core, public
as $$
begin
  if not core.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from programming.coach_display_pins where user_id = auth.uid();
end;
$$;

-- Resolve a PIN to a coach. Returns zero rows on a miss — never an error, so
-- a wrong PIN and an unknown PIN are indistinguishable to the caller.
create or replace function programming.hub_verify_pin(p_pin text)
returns table (coach_id uuid, coach_name text)
language plpgsql
security definer
set search_path = programming, core, extensions, public
as $$
begin
  if not (core.is_gym_display() or core.is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.user_id, u.name
    from programming.coach_display_pins p
    join core.users u on u.id = p.user_id
    where p.pin_hash = programming.hash_display_pin(p_pin)
      and u.role in ('coach', 'admin');
end;
$$;

-- Every SPC client who could be put on the board right now, with the week
-- they are in and that week's published sessions. This is the server-side
-- equivalent of what the coach's phone does client-side in resolveSlot()
-- (components/hub/HubSessionSetup.js) — done here so the display never needs
-- a roster read of its own.
--
-- "Current block" mirrors getCurrentSpcBlock: prefer whichever overlapping
-- block actually has published content, then the most recently started.
-- Overlaps are refused at creation now (createSpcBlock), so this is a
-- belt-and-braces tiebreak rather than a common path.
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
  wk as (
    -- currentWeekNumber(): a flat day count from the block's start, clamped
    -- to its length. lib/programming/schedule.js is the reference.
    select
      blk.uid,
      blk.bid,
      least(
        greatest(floor((t.d - blk.block_start_date) / 7.0)::int + 1, 1),
        blk.block_length_weeks
      )::smallint as wnum
    from blk, t
  )
  select
    c.user_id,
    u.name,
    wk.bid,
    wk.wnum,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'spcWorkoutId', w.id,
          'sessionNumber', w.session_number,
          'title', w.title,
          'completed', exists (
            select 1 from programming.session_completions sc
            where sc.user_id = c.user_id
              and sc.spc_workout_id = w.id
              and sc.week_number = wk.wnum
          )
        ) order by w.session_number
      )
      from programming.spc_workouts w
      where w.spc_block_id = wk.bid
        and w.week_number = wk.wnum
        and w.status = 'published'
    ), '[]'::jsonb)
  from programming.spc_clients c
  join core.users u on u.id = c.user_id
  join wk on wk.uid = c.user_id
  where coalesce(c.status, '') <> 'paused'
  order by u.name;
end;
$$;

-- Shared validation: is this workout really a published session belonging to
-- this client? Stops the board being pointed at anyone else's programming.
create or replace function programming.hub_workout_belongs_to(p_user_id uuid, p_spc_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = programming, public
as $$
  select exists (
    select 1
    from programming.spc_workouts w
    join programming.spc_blocks b on b.id = w.spc_block_id
    where w.id = p_spc_workout_id
      and w.status = 'published'
      and b.spc_client_id = p_user_id
  );
$$;

-- Start a session from the wall. Takes the PIN rather than a coach id on
-- purpose: re-verifying here means the display cannot attribute a session (or
-- the coaching notes written during it) to a coach whose PIN it does not have.
create or replace function programming.hub_start_session(p_pin text, p_clients jsonb)
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

  -- One open session at a time (enforced by hub_sessions_one_open_idx too).
  update programming.hub_sessions set ended_at = now() where ended_at is null;

  insert into programming.hub_sessions (coach_id, coach_name)
  values (v_coach, v_coach_name)
  returning id into v_session;

  for v_client in select * from jsonb_array_elements(p_clients) loop
    v_user := (v_client ->> 'userId')::uuid;
    v_workout := (v_client ->> 'spcWorkoutId')::uuid;
    v_week := (v_client ->> 'weekNumber')::smallint;

    if not programming.hub_workout_belongs_to(v_user, v_workout) then
      raise exception 'That session does not belong to that client, or is not published.';
    end if;

    select name into v_name from core.users where id = v_user;
    if v_name is null then
      raise exception 'Unknown client.';
    end if;

    v_pos := v_pos + 1;
    insert into programming.hub_session_clients
      (hub_session_id, user_id, client_name, spc_workout_id, week_number, position)
    values (v_session, v_user, v_name, v_workout, v_week, v_pos);
  end loop;

  return v_session;
end;
$$;

-- Add someone who turned up after the session started. Takes the lowest free
-- slot; dropping earlier leaves a hole (positions 1,3,4) and that is fine —
-- the board renders whatever rows exist, in position order, and re-flows.
create or replace function programming.hub_add_client(p_user_id uuid, p_spc_workout_id uuid, p_week_number smallint)
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

  if not programming.hub_workout_belongs_to(p_user_id, p_spc_workout_id) then
    raise exception 'That session does not belong to that client, or is not published.';
  end if;

  select name into v_name from core.users where id = p_user_id;
  if v_name is null then
    raise exception 'Unknown client.';
  end if;

  insert into programming.hub_session_clients
    (hub_session_id, user_id, client_name, spc_workout_id, week_number, position)
  values (v_session, p_user_id, v_name, p_spc_workout_id, p_week_number, v_pos);
end;
$$;

-- Drop someone who did not show. Deletes only the board slot: everything she
-- logged stays on her session, and the display simply loses write access to
-- her rows (hub_active_client() stops matching), which is correct.
create or replace function programming.hub_remove_client(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = programming, core, public
as $$
declare
  v_session uuid;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select id into v_session from programming.hub_sessions where ended_at is null;
  if v_session is null then
    raise exception 'No session is running.';
  end if;

  delete from programming.hub_session_clients
  where hub_session_id = v_session and user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------
-- Own row only, and no display policy at all: the TV verifies through
-- hub_verify_pin(), which is definer and bypasses this.
drop policy if exists "staff manages own display pin" on programming.coach_display_pins;
create policy "staff manages own display pin" on programming.coach_display_pins
  for all
  using (user_id = auth.uid() and core.is_staff())
  with check (user_id = auth.uid() and core.is_staff());

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
grant execute on function programming.set_own_display_pin(text) to authenticated;
grant execute on function programming.clear_own_display_pin() to authenticated;
grant execute on function programming.hub_verify_pin(text) to authenticated;
grant execute on function programming.hub_startable_clients() to authenticated;
grant execute on function programming.hub_start_session(text, jsonb) to authenticated;
grant execute on function programming.hub_add_client(uuid, uuid, smallint) to authenticated;
grant execute on function programming.hub_remove_client(uuid) to authenticated;

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
