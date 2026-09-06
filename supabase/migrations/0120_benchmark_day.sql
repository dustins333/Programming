-- Benchmark Day — the gym's quarterly self-test (pull ups, push ups, squats),
-- brought in from the physical neon board on the wall. Four times a year a
-- member places one kettlebell per movement on a tier row and keys the number
-- she hit onto the bell.
--
-- Two tables, and the split between them is the whole design:
--
--   benchmark_events   the coach's three dates. Admin-managed, exactly like
--                      programming.events (0061) — a gym-wide broadcast is a
--                      bigger blast radius than the rest of the coach surface.
--
--   benchmark_entries  one row per (event, member, movement, slot). `slot` is
--                      the part worth understanding: the member's screen has
--                      TWO columns, "This time" and "Last time", and BOTH are
--                      editable. 'this' is what she did today. 'last' is an
--                      OVERRIDE of what the previous event says she did.
--
-- Why 'last' is an override rather than a write back onto the previous event's
-- row: the Last column exists mostly for her FIRST benchmark, when there is no
-- history to prefill and she is typing in what she remembers. Letting that edit
-- reach back and rewrite a completed benchmark would mean a finished record can
-- change months later with nothing saying so. So the app reads the previous
-- event's 'this' row as the default, and only writes a 'last' row here once she
-- actually changes something — same override-or-default shape as
-- programming.spc_workout_week_titles. A benchmark that was right stores nothing.

-- --------------------------------------------------------------------
-- benchmark_events
-- --------------------------------------------------------------------
-- The three dates drive everything the member sees, with no status column:
--   show_from     .. the My Week button appears, counting down
--   benchmark_day .. logging opens, the kettlebells go live
--   hide_after    .. the button comes off My Week
-- Which of the three button states shows is derived from today against these,
-- so there is no "publish" step to forget and no half-live state.
create table if not exists programming.benchmark_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  show_from date not null,
  benchmark_day date not null,
  hide_after date not null,
  created_by uuid references core.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmark_events_dates_ordered check (
    show_from <= benchmark_day and benchmark_day <= hide_after
  )
);

create index if not exists benchmark_events_window_idx
  on programming.benchmark_events (benchmark_day desc);

alter table programming.benchmark_events enable row level security;

drop policy if exists "admin manage benchmark events" on programming.benchmark_events;
create policy "admin manage benchmark events" on programming.benchmark_events
  for all using (core.is_admin()) with check (core.is_admin());

-- Any signed-in staff member reads them (a coach standing at the board needs to
-- know when the window is), and so does every member — but only once the window
-- has opened. `auth.uid() is not null` is load-bearing: `to public` includes
-- anon, and an unauthenticated read of the gym's calendar is not intended.
-- Same guard the 2026-08-21 audit added across the announcement/event policies.
drop policy if exists "read benchmark events in window" on programming.benchmark_events;
create policy "read benchmark events in window" on programming.benchmark_events
  for select using (
    auth.uid() is not null
    and (
      core.is_staff()
      or (
        show_from <= (now() at time zone 'America/Boise')::date
        and hide_after >= (now() at time zone 'America/Boise')::date
      )
    )
  );

-- --------------------------------------------------------------------
-- benchmark_entries
-- --------------------------------------------------------------------
-- `value` and `load` are TEXT, not numeric, on purpose. What goes on the bell
-- is whatever she keys in (the app strips it to at most 4 digits), and the unit
-- differs per tier — tier 2 pull ups is seconds of an iso hold, tier 4 is reps.
-- Storing it as the string she typed keeps the record equal to the sticker on
-- the physical kettlebell, which is the whole point of the feature.
--
-- `tier` is nullable because a row can exist for the note alone: she can write
-- how it felt before she has decided where the bell goes.
create table if not exists programming.benchmark_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references programming.benchmark_events (id) on delete cascade,
  user_id uuid not null references core.users (id) on delete cascade,

  movement text not null check (movement in ('pull', 'push', 'squat')),
  slot text not null default 'this' check (slot in ('this', 'last')),

  tier smallint check (tier between 1 and 4),
  value text,
  load text,
  -- 0 = the assisted / adjusted variation, 1 = the harder one. Pull ups have no
  -- variations and always sit at 0.
  variant smallint not null default 0 check (variant in (0, 1)),
  note text,

  -- Only ever set on a 'this' row — it is what "Mark pull ups complete" writes,
  -- and what the hub counts for its 0/3 progress.
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, user_id, movement, slot)
);

create index if not exists benchmark_entries_user_idx
  on programming.benchmark_entries (user_id, event_id);
create index if not exists benchmark_entries_event_idx
  on programming.benchmark_entries (event_id, movement);

alter table programming.benchmark_entries enable row level security;

-- Staff read every member's entries (the coach at the board, and any future
-- results view) but do not write them — apart from admin, below. This is her
-- record of what she did.
drop policy if exists "staff read benchmark entries" on programming.benchmark_entries;
create policy "staff read benchmark entries" on programming.benchmark_entries
  for select using (core.is_staff());

drop policy if exists "admin manage benchmark entries" on programming.benchmark_entries;
create policy "admin manage benchmark entries" on programming.benchmark_entries
  for all using (core.is_admin()) with check (core.is_admin());

drop policy if exists "members read own benchmark entries" on programming.benchmark_entries;
create policy "members read own benchmark entries" on programming.benchmark_entries
  for select using (user_id = auth.uid());

-- Writing is bounded to the event's own logging window: from benchmark day
-- through the hide date. Deliberately NOT "benchmark day only", even though the
-- UI locks the bells the morning after — a member who finishes at 11:58pm and
-- taps complete at 12:01am must not hit a wall, and a stale browser tab must
-- not be able to write into a benchmark from three months ago.
drop policy if exists "members write own benchmark entries" on programming.benchmark_entries;
create policy "members write own benchmark entries" on programming.benchmark_entries
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from programming.benchmark_events e
      where e.id = benchmark_entries.event_id
        and e.benchmark_day <= (now() at time zone 'America/Boise')::date
        and e.hide_after >= (now() at time zone 'America/Boise')::date
    )
  );

drop policy if exists "members update own benchmark entries" on programming.benchmark_entries;
create policy "members update own benchmark entries" on programming.benchmark_entries
  for update using (
    user_id = auth.uid()
    and exists (
      select 1 from programming.benchmark_events e
      where e.id = benchmark_entries.event_id
        and e.benchmark_day <= (now() at time zone 'America/Boise')::date
        and e.hide_after >= (now() at time zone 'America/Boise')::date
    )
  ) with check (user_id = auth.uid());

-- No member delete policy. Removing a kettlebell clears the tier on the row it
-- already owns; there is nothing a member needs to delete outright.

-- Delete is granted at the table level but reachable only through the admin
-- `for all` policies above: neither members nor plain staff have a delete
-- policy, so RLS refuses it regardless of the grant.
grant select, insert, update, delete on programming.benchmark_events to authenticated;
grant select, insert, update, delete on programming.benchmark_entries to authenticated;
