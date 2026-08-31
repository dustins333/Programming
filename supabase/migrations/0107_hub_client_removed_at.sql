-- Taking a client off the live board is a soft delete now, not a hard one.
--
-- Why: coaches run back-to-back groups on one board — a client finishes, she
-- is dropped, the next one is added into the freed slot. hub_remove_client
-- did a literal DELETE, so the client who just trained for an hour vanished
-- from that board's roster entirely. Her sets were never at risk (they live
-- in programming.logs, keyed on the workout and the day), but the board's own
-- history could not show who had actually been on it, which is exactly what
-- the review screen exists to answer.
--
-- ⚠ Past removals are NOT recoverable. Those rows were deleted outright and
-- nothing recorded them. This only fixes it going forward.
--
-- The two UNIQUE constraints both have to become partial, and each for its
-- own reason:
--   (hub_session_id, position)  a soft-deleted row still occupies its slot,
--                               so the next client in would be pushed to
--                               position 3 — or refused once four swaps had
--                               happened, since the board caps at four.
--   (hub_session_id, user_id)   a client swapped out and later swapped back
--                               in (she stepped out, she came back) would be
--                               blocked by her own removed row.
--
-- Access has to evaporate on removal exactly as it does when a session ends:
-- hub_active_client and the two group predicates gate every display policy on
-- logs / completions / coaching notes (0071, 0106), so a removed client must
-- stop matching them or the TV keeps write access to someone who is no longer
-- on the board.
--
-- Run in the Supabase SQL Editor (or supabase db query --linked -f), then:
--   NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table programming.hub_session_clients
  add column if not exists removed_at timestamptz;

-- Added WITHOUT a default and only then given one, deliberately: a plain
-- `default now()` would stamp every pre-existing row with the migration's own
-- timestamp, which is a made-up join time. Existing rows stay null, meaning
-- "she was on it from the start, or we don't know" — the honest answer.
alter table programming.hub_session_clients
  add column if not exists added_at timestamptz;
alter table programming.hub_session_clients
  alter column added_at set default now();

comment on column programming.hub_session_clients.removed_at is
  'When a coach took her off the board (migration 0107). Null = still on it. Rows are never deleted, so a board''s history shows everyone who was actually on it.';
comment on column programming.hub_session_clients.added_at is
  'When she was put on the board. Null on rows predating 0107 — not backfilled, because the real time is unknown.';

-- ---------------------------------------------------------------------------
-- 2. Uniqueness, scoped to who is still on the board
-- ---------------------------------------------------------------------------
alter table programming.hub_session_clients
  drop constraint if exists hub_session_clients_hub_session_id_position_key;
create unique index if not exists hub_session_clients_active_position_idx
  on programming.hub_session_clients (hub_session_id, position)
  where removed_at is null;

alter table programming.hub_session_clients
  drop constraint if exists hub_session_clients_hub_session_id_user_id_key;
create unique index if not exists hub_session_clients_active_user_idx
  on programming.hub_session_clients (hub_session_id, user_id)
  where removed_at is null;

-- ---------------------------------------------------------------------------
-- 3. Predicates behind every display policy
-- ---------------------------------------------------------------------------
create or replace function programming.hub_active_client(target uuid)
returns boolean language sql stable security definer set search_path = programming as $$
  select exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
     where hs.ended_at is null and hc.removed_at is null and hc.user_id = target
  );
$$;

create or replace function programming.hub_active_group_workout(target uuid)
returns boolean language sql stable security definer set search_path = programming as $$
  select exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
      join programming.group_workouts w on w.id = hc.group_workout_id
     where hs.ended_at is null
       and hc.removed_at is null
       and w.status = 'published'
       and w.id = target
  );
$$;

create or replace function programming.hub_active_group_block(target uuid)
returns boolean language sql stable security definer set search_path = programming as $$
  select exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
      join programming.group_workouts w on w.id = hc.group_workout_id
     where hs.ended_at is null
       and hc.removed_at is null
       and w.block_id = target
  );
$$;

-- The TV must stop seeing her the moment she comes off, same as when the
-- session ends. Coaches keep the full roster through "staff manage".
drop policy if exists "display reads open hub_session_clients" on programming.hub_session_clients;
create policy "display reads open hub_session_clients" on programming.hub_session_clients
  for select using (
    core.is_gym_display()
    and removed_at is null
    and exists (
      select 1 from programming.hub_sessions hs
       where hs.id = hub_session_clients.hub_session_id and hs.ended_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Remove = stamp, not delete
-- ---------------------------------------------------------------------------
create or replace function programming.hub_remove_client(p_user_id uuid)
returns void language plpgsql security definer
set search_path = programming, core, public as $$
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

  update programming.hub_session_clients
     set removed_at = now()
   where hub_session_id = v_session
     and user_id = p_user_id
     and removed_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Adding counts only who is on the board now
-- ---------------------------------------------------------------------------
create or replace function programming.hub_add_client(
  p_user_id uuid,
  p_spc_workout_id uuid,
  p_week_number smallint,
  p_group_workout_id uuid default null
)
returns void language plpgsql security definer
set search_path = programming, core, public as $$
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
end;
$$;
