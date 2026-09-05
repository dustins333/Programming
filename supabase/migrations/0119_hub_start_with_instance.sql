-- 0119_hub_start_with_instance.sql
--
-- 0118 gave a board slot an instance, and the app stamped it as a SECOND
-- write immediately after the slot was created. That left a window, and the
-- board's poll fell into it: hub_add_client inserts the slot at instance 1,
-- the poll picks the new roster up (the roster changed, so it refreshes), and
-- only then does hub_open_makeup stamp instance 2. From that moment the
-- roster's signature never changes again, so the board holds instance 1 for
-- the rest of the session — reads the earlier completion, and opens the
-- make-up finalized. Exactly what 0118 was meant to stop.
--
-- The signature is being widened alongside this (useHubBoard's
-- clientsSignature now covers instance), but a window that only closes
-- because a poll happens to look again is not closed. So the two RPCs that
-- create board slots now do the whole thing themselves: the slot is inserted
-- and its instance resolved before either function returns, and there is no
-- intermediate state for a poll to see.
--
-- hub_start_staged already did this (0117). startHubSession — the coach's own
-- phone, which inserts rows directly rather than through an RPC — still calls
-- hub_open_makeup afterwards, and is covered by the widened signature.
--
-- hub_add_client's new argument is DEFAULTED, so a browser tab still running
-- the previous JS keeps resolving the 4-argument call it knows about. Same
-- reasoning as 0106's own addition to this function.
--
-- Rollback: re-create both functions from 0106 (hub_start_session,
-- hub_add_client) — the make-up lines are the only difference.

-- Adding a parameter makes a NEW function, not a replacement — Postgres keys
-- on the argument list. Both would then match a 4-argument call and PostgREST
-- has no way to choose, so the old one has to go. A stale tab's 4-argument
-- call still resolves: it lands on this one and takes the default.
drop function if exists programming.hub_add_client(uuid, uuid, smallint, uuid);

create or replace function programming.hub_add_client(
  p_user_id uuid,
  p_spc_workout_id uuid,
  p_week_number smallint,
  p_group_workout_id uuid default null,
  p_new_instance boolean default false
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

  -- Active rows only, so swapping someone back in after she stepped out works.
  if exists (
    select 1 from programming.hub_session_clients
     where hub_session_id = v_session and user_id = p_user_id and removed_at is null
  ) then
    raise exception 'She is already on the board.';
  end if;

  -- Likewise: a vacated slot is free again. Without this, four swaps would
  -- fill all four positions with people who already went home.
  select min(p) into v_pos
  from generate_series(1, 4) as p
  where p not in (
    select position from programming.hub_session_clients
     where hub_session_id = v_session and removed_at is null
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

  -- Before returning, so the board never sees this slot at instance 1 and
  -- cache it. A no-op when she has nothing logged for that week.
  if p_new_instance and p_spc_workout_id is not null then
    perform programming.hub_open_makeup(p_user_id, p_spc_workout_id, p_week_number);
  end if;
end;
$$;

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

    -- Read off the client object, so no signature change is needed and a
    -- stale tab that omits the key simply gets the old behaviour.
    if coalesce((v_client ->> 'newInstance')::boolean, false) and v_workout is not null then
      perform programming.hub_open_makeup(v_user, v_workout, v_week);
    end if;
  end loop;

  return v_session;
end;
$$;

notify pgrst, 'reload schema';
