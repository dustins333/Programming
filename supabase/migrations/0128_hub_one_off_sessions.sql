-- 0128: one-off sessions on the SPC live board.
--
-- A one-off (0008) is a single session copied onto one client, open until she
-- finishes it. The main reason this exists is letting a prospect try SPC, so
-- the board has to be able to run one — and a prospect is by definition not
-- an SPC client yet, which is why the startable-clients arm below is not gated
-- on spc_clients at all.
--
-- What changes:
--   1. hub_session_clients.one_off_workout_id, and the XOR check widens from
--      two workout kinds to three.
--   2. hub_one_off_belongs_to() / hub_active_one_off_workout(), the same pair
--      of security-definer predicates the group arm has (0106) and for the
--      same reason: a policy ON a table cannot select that table.
--   3. Display read policies on the three one_off tables, scoped to what is on
--      the open board. Writes need nothing new: the display's logs,
--      session_completions, exercise_completions and coaching-note policies
--      are all keyed on hub_active_client(user_id), which covers one-off rows.
--   4. hub_startable_clients() gains a one-off arm. The SPC and group arms are
--      byte-identical to the live definition (generated from
--      pg_get_functiondef, not retyped).
--   5. hub_start_session() reads 'oneOffWorkoutId' off each client object (no
--      signature change). hub_add_client() gains p_one_off_workout_id, so the
--      old 5-argument overload is DROPPED in the same migration — adding a
--      defaulted parameter creates a second function rather than replacing
--      the first, and both would match a 5-argument call (the 0119 lesson).
--
-- A one-off has no week, and hub_session_clients.week_number is NOT NULL, so a
-- one-off slot carries 1. Nothing reads it for a one-off (the board branches
-- on the slot's kind first).
--
-- Staging is untouched: a staged slot stores an SPC session number (0090), so
-- a one-off cannot be staged ahead, same as a group program.

set local lock_timeout = '4s';

alter table programming.hub_session_clients
  add column if not exists one_off_workout_id uuid
    references programming.one_off_workouts (id) on delete cascade;

alter table programming.hub_session_clients drop constraint if exists hub_session_clients_one_workout;
alter table programming.hub_session_clients add constraint hub_session_clients_one_workout check (
  (spc_workout_id is not null)::int + (group_workout_id is not null)::int + (one_off_workout_id is not null)::int = 1
);

create or replace function programming.hub_one_off_belongs_to(p_user_id uuid, p_one_off_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'programming', 'public'
as $$
  select exists (
    select 1
    from programming.one_off_workouts w
    where w.id = p_one_off_workout_id
      and w.user_id = p_user_id
      and w.status = 'published'
  );
$$;

create or replace function programming.hub_active_one_off_workout(target uuid)
returns boolean
language sql
stable
security definer
set search_path to 'programming'
as $$
  select exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
     where hs.ended_at is null
       and hc.removed_at is null
       and hc.one_off_workout_id = target
  );
$$;

revoke all on function programming.hub_one_off_belongs_to(uuid, uuid) from public;
revoke all on function programming.hub_active_one_off_workout(uuid) from public;
grant execute on function programming.hub_one_off_belongs_to(uuid, uuid) to authenticated;
grant execute on function programming.hub_active_one_off_workout(uuid) to authenticated;

drop policy if exists "display reads hub one_off_workouts" on programming.one_off_workouts;
create policy "display reads hub one_off_workouts" on programming.one_off_workouts
  for select using (core.is_gym_display() and status = 'published' and programming.hub_active_one_off_workout(id));

drop policy if exists "display reads hub one_off_warmups" on programming.one_off_warmups;
create policy "display reads hub one_off_warmups" on programming.one_off_warmups
  for select using (core.is_gym_display() and programming.hub_active_one_off_workout(one_off_workout_id));

drop policy if exists "display reads hub one_off_exercises" on programming.one_off_exercises;
create policy "display reads hub one_off_exercises" on programming.one_off_exercises
  for select using (core.is_gym_display() and programming.hub_active_one_off_workout(one_off_workout_id));

CREATE OR REPLACE FUNCTION programming.hub_startable_clients()
 RETURNS TABLE(user_id uuid, name text, block_id uuid, week_number smallint, sessions jsonb, program_kind text, program_id uuid, program_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'programming', 'core', 'public'
AS $function$
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
    -- 0108: three enrolment states now. 'inactive' means she is no longer
    -- an SPC client at all, so the test is positive rather than "not
    -- paused" — otherwise a switched-off client keeps appearing on the
    -- wall display's picker. Identical for the active/paused pair.
    where c.status = 'active'
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
            ),
            -- Newest finalize of this session, anywhere in the run. Same
            -- scope as loggedCount, so "3 times, last on the 28th" is one
            -- consistent answer. Null when she has never logged it.
            'lastLoggedAt', (
              select max(sc3.completed_at)
              from programming.session_completions sc3
              where sc3.user_id = j.uid
                and sc3.spc_workout_id = w.id
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
            ),
            'lastLoggedAt', (
              select max(sc3.completed_at)
              from programming.spc_workouts w3
              join programming.session_completions sc3
                on sc3.spc_workout_id = w3.id
               and sc3.week_number = w3.week_number
              where w3.spc_block_id = j.bid
                and w3.session_number = w.session_number
                and sc3.user_id = j.uid
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
            ),
            'lastLoggedAt', (
              select max(sc3.completed_at)
              from programming.group_workouts w3
              join programming.session_completions sc3
                on sc3.group_workout_id = w3.id
              where w3.block_id = g.bid
                and w3.session_number = w.session_number
                and sc3.user_id = g.uid
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
  union all

  -- ── one-off arm (0128) ───────────────────────────────────────────────────
  -- Anyone with a sent (published) one-off she has not finished. Not gated
  -- on SPC enrolment on purpose: a one-off is how a prospect tries SPC, and
  -- she is by definition not an SPC client yet. No block and no week — a
  -- one-off is open until done, so both come back null and the picker knows
  -- not to read that as "between blocks".
  select
    o.uid,
    o.uname,
    null::uuid,
    null::smallint,
    o.sessions,
    'one_off'::text,
    null::uuid,
    null::text
  from (
    select
      w.user_id as uid,
      u.name as uname,
      jsonb_agg(
        jsonb_build_object(
          'spcWorkoutId', null,
          'oneOffWorkoutId', w.id,
          'sessionNumber', null,
          'title', w.title,
          'weekNumber', null,
          'movedFromWeek', null,
          'completed', false,
          'loggedCount', 0,
          'lastLoggedAt', null
        ) order by w.created_at
      ) as sessions
    from programming.one_off_workouts w
    join core.users u on u.id = w.user_id
    where w.status = 'published'
      and not exists (
        select 1 from programming.session_completions c
        where c.one_off_workout_id = w.id
      )
    group by w.user_id, u.name
  ) o
  order by 2, 6;
end;
$function$;

CREATE OR REPLACE FUNCTION programming.hub_start_session(p_pin text, p_clients jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'programming', 'core', 'extensions', 'public'
AS $function$
declare
  v_coach uuid;
  v_coach_name text;
  v_session uuid;
  v_client jsonb;
  v_user uuid;
  v_workout uuid;
  v_group_workout uuid;
  v_one_off uuid;
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
    v_one_off := (v_client ->> 'oneOffWorkoutId')::uuid;
    -- A one-off has no week; the column is NOT NULL, so it carries 1.
    v_week := coalesce((v_client ->> 'weekNumber')::smallint, 1);

    if (v_workout is not null)::int + (v_group_workout is not null)::int + (v_one_off is not null)::int <> 1 then
      raise exception 'Each client needs exactly one session.';
    end if;

    if v_one_off is not null then
      if not programming.hub_one_off_belongs_to(v_user, v_one_off) then
        raise exception 'That session does not belong to that client, or is not sent yet.';
      end if;
    elsif v_group_workout is not null then
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
      (hub_session_id, user_id, client_name, spc_workout_id, group_workout_id, one_off_workout_id, week_number, position)
    values (v_session, v_user, v_name, v_workout, v_group_workout, v_one_off, v_week, v_pos);

    -- Read off the client object, so no signature change is needed and a
    -- stale tab that omits the key simply gets the old behaviour.
    if coalesce((v_client ->> 'newInstance')::boolean, false) and v_workout is not null then
      perform programming.hub_open_makeup(v_user, v_workout, v_week);
    end if;
  end loop;

  return v_session;
end;
$function$;

drop function if exists programming.hub_add_client(uuid, uuid, smallint, uuid, boolean);

CREATE OR REPLACE FUNCTION programming.hub_add_client(p_user_id uuid, p_spc_workout_id uuid, p_week_number smallint, p_group_workout_id uuid DEFAULT NULL::uuid, p_new_instance boolean DEFAULT false, p_one_off_workout_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'programming', 'core', 'public'
AS $function$
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

  if (p_spc_workout_id is not null)::int + (p_group_workout_id is not null)::int + (p_one_off_workout_id is not null)::int <> 1 then
    raise exception 'Pick exactly one session.';
  end if;

  if p_one_off_workout_id is not null then
    if not programming.hub_one_off_belongs_to(p_user_id, p_one_off_workout_id) then
      raise exception 'That session does not belong to that client, or is not sent yet.';
    end if;
  elsif p_group_workout_id is not null then
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
    (hub_session_id, user_id, client_name, spc_workout_id, group_workout_id, one_off_workout_id, week_number, position)
  values (v_session, p_user_id, v_name, p_spc_workout_id, p_group_workout_id, p_one_off_workout_id, coalesce(p_week_number, 1), v_pos);

  -- Before returning, so the board never sees this slot at instance 1 and
  -- cache it. A no-op when she has nothing logged for that week.
  if p_new_instance and p_spc_workout_id is not null then
    perform programming.hub_open_makeup(p_user_id, p_spc_workout_id, p_week_number);
  end if;
end;
$function$;

grant execute on function programming.hub_add_client(uuid, uuid, smallint, uuid, boolean, uuid) to authenticated;

notify pgrst, 'reload schema';
