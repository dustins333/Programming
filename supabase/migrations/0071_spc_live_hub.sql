-- SPC Live Session Hub — a wall-mounted gym-floor touchscreen (1920x1080)
-- that shows up to 4 SPC clients' sessions side by side, live, and is itself
-- an input surface. A coach starts/ends the hub session from their phone
-- (app/(coach)/spc/live.js); the TV runs a dedicated "display" account.
--
-- Access model (decided with Terra 2026-08-19): the TV signs in once as its
-- own account (display@kovastrength.com) flagged core.users.is_gym_display.
-- New RLS scopes that account to ONLY the clients in the currently-open hub
-- session — no payroll, no roster, no other clients, and access to a client
-- evaporates the moment the session ends. Deliberately NOT a coach login.
--
-- ⚠ Flagged widening (see "staff manage … completions" below): coaches gain
-- write access to session_completions / exercise_completions for any client
-- (previously SELECT-only per 0007/0040), so a coach's phone can tick lifts
-- and finalize on a client's behalf during a hub session. This mirrors the
-- "staff manage logs" policy from 0004, which has always allowed staff to
-- write a client's sets.
--
-- MANUAL STEPS after running (one-time):
--   1. Supabase Dashboard → Authentication → Add user:
--      display@kovastrength.com with a strong password.
--   2. insert into core.users (id, name, email, role)
--        values ('<that auth user id>', 'Gym Display', 'display@kovastrength.com', 'member')
--        on conflict (id) do nothing;
--      update core.users set is_gym_display = true
--        where email = 'display@kovastrength.com';
--   3. Sign the TV's browser in once at the normal login page — it routes
--      itself to the display board and stays signed in.
--
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.

-- ---------------------------------------------------------------------------
-- 1. Display flag + helper (a boolean flag, not a new role enum value —
--    ALTER TYPE ADD VALUE can't be used in the same transaction it's added
--    in, and the SQL Editor runs a whole script as one transaction).
-- ---------------------------------------------------------------------------
alter table core.users add column is_gym_display boolean not null default false;

create function core.is_gym_display()
returns boolean
language sql
security definer
set search_path = core
stable
as $$
  select exists (
    select 1 from core.users where id = auth.uid() and is_gym_display
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables (all tables before any function/policy that references them —
--    CREATE POLICY resolves referenced tables at creation time, and the SQL
--    Editor's single transaction means a forward reference kills the whole
--    script; this exact ordering bug broke 0036 in production).
-- ---------------------------------------------------------------------------
create table programming.hub_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references core.users (id),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- At most ONE open hub session, guaranteed by the database — a race between
-- two coaches starting at once becomes a loud insert error, never two open
-- sessions. (startHubSession ends any open session before inserting.)
create unique index hub_sessions_one_open_idx
  on programming.hub_sessions ((true)) where ended_at is null;

create table programming.hub_session_clients (
  id uuid primary key default gen_random_uuid(),
  hub_session_id uuid not null references programming.hub_sessions (id) on delete cascade,
  user_id uuid not null references core.users (id) on delete cascade,
  -- Name snapshot so the display account never needs a core.users read
  -- policy at all — the TV's only name source is this row.
  client_name text not null,
  spc_workout_id uuid not null references programming.spc_workouts (id) on delete cascade,
  week_number smallint not null,
  position smallint not null check (position between 1 and 4),
  unique (hub_session_id, position),
  unique (hub_session_id, user_id)
);

create index hub_session_clients_session_idx
  on programming.hub_session_clients (hub_session_id);

-- Per-client, per-LIFT coaching note history ("killed this, go up in weight")
-- keyed on the RAW exercise_id — not the week-specific spc_workout_exercises
-- join-row id — so a note written in week 3 still surfaces in week 4, next
-- block, or a different session containing the same lift. exercise_id null =
-- a general note about the client's session, not tied to a lift.
-- spc_workout_id/week_number just record where it was written (set null on
-- workout delete — the note outlives the programming).
create table programming.exercise_coaching_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  exercise_id uuid references programming.exercises (id) on delete cascade,
  author_id uuid references core.users (id) on delete set null,
  spc_workout_id uuid references programming.spc_workouts (id) on delete set null,
  week_number smallint,
  body text not null,
  created_at timestamptz not null default now()
);

create index ecn_user_exercise_idx
  on programming.exercise_coaching_notes (user_id, exercise_id, created_at desc);

alter table programming.hub_sessions enable row level security;
alter table programming.hub_session_clients enable row level security;
alter table programming.exercise_coaching_notes enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------
-- True iff target is a client of the currently-open hub session. Security
-- definer so it can be used inside display policies on tables the display
-- account otherwise can't join through.
create function programming.hub_active_client(target uuid)
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
     where hs.ended_at is null and hc.user_id = target
  );
$$;

-- Reorder a hub-active session's lifts from the TV (equipment conflicts —
-- "Sarah and Sally both have leg press first"). An UPDATE policy can't be
-- restricted to one column, so this RPC is the display account's only write
-- path onto spc_workout_exercises: it touches ONLY position, ONLY rows of
-- the named workout, and only while that workout is in the open hub session.
-- Same shape as link_truecoach_import (0066): authz check in the body,
-- errcode 42501 on failure.
create function programming.hub_reorder_exercises(p_spc_workout_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = programming, core
as $$
declare
  item jsonb;
begin
  if not (
    core.is_staff()
    or (core.is_gym_display() and exists (
      select 1
        from programming.hub_session_clients hc
        join programming.hub_sessions hs on hs.id = hc.hub_session_id
       where hs.ended_at is null and hc.spc_workout_id = p_spc_workout_id
    ))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    update programming.spc_workout_exercises
       set position = (item->>'position')::smallint
     where id = (item->>'id')::uuid
       and spc_workout_id = p_spc_workout_id;
  end loop;
end;
$$;

-- End the open hub session. The display account has no UPDATE policy on
-- hub_sessions (an update policy would let it edit coach_id too), so ending
-- from the TV goes through this instead. Staff can also call it.
create function programming.hub_end_session()
returns void
language plpgsql
security definer
set search_path = programming, core
as $$
begin
  if not (core.is_staff() or core.is_gym_display()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update programming.hub_sessions set ended_at = now() where ended_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------------
-- Hub tables: SPC-module feature → can_access_spc() (0015's convention).
create policy "staff manage hub_sessions" on programming.hub_sessions
  for all using (core.can_access_spc()) with check (core.can_access_spc());
create policy "display reads open hub_sessions" on programming.hub_sessions
  for select using (core.is_gym_display() and ended_at is null);

create policy "staff manage hub_session_clients" on programming.hub_session_clients
  for all using (core.can_access_spc()) with check (core.can_access_spc());
create policy "display reads open hub_session_clients" on programming.hub_session_clients
  for select using (
    core.is_gym_display()
    and exists (
      select 1 from programming.hub_sessions hs
      where hs.id = hub_session_clients.hub_session_id and hs.ended_at is null
    )
  );

-- Display account writes the same logging data a member's own phone writes,
-- but only for clients in the open hub session.
create policy "display manages hub client logs" on programming.logs
  for all
  using (core.is_gym_display() and programming.hub_active_client(user_id))
  with check (core.is_gym_display() and programming.hub_active_client(user_id));

create policy "display manages hub client session completions" on programming.session_completions
  for all
  using (core.is_gym_display() and programming.hub_active_client(user_id))
  with check (core.is_gym_display() and programming.hub_active_client(user_id));

create policy "display manages hub client exercise completions" on programming.exercise_completions
  for all
  using (core.is_gym_display() and programming.hub_active_client(user_id))
  with check (core.is_gym_display() and programming.hub_active_client(user_id));

-- ⚠ Deliberate widening (see header): staff were SELECT-only on both
-- completion tables (0007/0040), which blocked a coach's phone from ticking
-- a lift or finalizing on a client's behalf in the hub. Mirrors 0004's
-- "staff manage logs". The existing "staff can read …" policies stay
-- (redundant but harmless).
create policy "staff manage session completions" on programming.session_completions
  for all using (core.is_staff()) with check (core.is_staff());
create policy "staff manage exercise completions" on programming.exercise_completions
  for all using (core.is_staff()) with check (core.is_staff());

-- Display reads of program structure — mirror the member published-only
-- policy shapes from 0006, with is_gym_display() + hub_active_client(...)
-- in place of "= auth.uid()".
create policy "display reads hub spc_clients" on programming.spc_clients
  for select using (core.is_gym_display() and programming.hub_active_client(user_id));

create policy "display reads hub spc_blocks" on programming.spc_blocks
  for select using (core.is_gym_display() and programming.hub_active_client(spc_client_id));

create policy "display reads hub published spc_workouts" on programming.spc_workouts
  for select using (
    core.is_gym_display()
    and status = 'published'
    and exists (
      select 1 from programming.spc_blocks sb
      where sb.id = spc_workouts.spc_block_id
        and programming.hub_active_client(sb.spc_client_id)
    )
  );

create policy "display reads hub published spc_workout_warmups" on programming.spc_workout_warmups
  for select using (
    core.is_gym_display()
    and exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_warmups.spc_workout_id
        and sw.status = 'published'
        and programming.hub_active_client(sb.spc_client_id)
    )
  );

create policy "display reads hub published spc_workout_exercises" on programming.spc_workout_exercises
  for select using (
    core.is_gym_display()
    and exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_exercises.spc_workout_id
        and sw.status = 'published'
        and programming.hub_active_client(sb.spc_client_id)
    )
  );
-- (programming.exercises needs no new policy — its read policy is already
-- "auth.uid() is not null and is_active", which covers the display account.)

-- Coaching notes: staff manage; member reads their own (they surface on the
-- member's own exercise card); display reads + writes for hub-active clients
-- (the TV's entry pad is where these get typed mid-session).
create policy "staff manage coaching notes" on programming.exercise_coaching_notes
  for all using (core.can_access_spc()) with check (core.can_access_spc());
create policy "member reads own coaching notes" on programming.exercise_coaching_notes
  for select using (user_id = auth.uid());
create policy "display reads hub coaching notes" on programming.exercise_coaching_notes
  for select using (core.is_gym_display() and programming.hub_active_client(user_id));
create policy "display writes hub coaching notes" on programming.exercise_coaching_notes
  for insert with check (core.is_gym_display() and programming.hub_active_client(user_id));

-- ---------------------------------------------------------------------------
-- 5. Grants — same Data-API permission dance as every schema-adding migration.
-- ---------------------------------------------------------------------------
grant execute on function programming.hub_reorder_exercises(uuid, jsonb) to authenticated;
grant execute on function programming.hub_end_session() to authenticated;

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
