-- Two independent nutrition asks, one migration.
--
-- 1. Closing out a check-in a client is never going to file.
-- 2. Naming the phase a client is in, week by week, on the Weeks tab.
--
-- ---------------------------------------------------------------------
-- 1. Check-in close-out
-- ---------------------------------------------------------------------
-- A client who doesn't check in shows as "Awaiting client check-in"
-- (urgent, red) on the roster until the week rolls over on its own. There
-- was no way to resolve that — a coach who already knows the check-in
-- isn't coming had to sit on a red row for the rest of the cycle.
--
-- Deliberately NOT modelled as a fabricated public.checkin_responses row
-- with empty answers. That table is shared with the standalone Nutrition
-- Tracker app, and a blank response would render there (and on Kova's own
-- Check-In tab) as though the client had answered. This is Kova-specific
-- coach state about a check-in that did NOT happen, so it lives in
-- programming.* — same reasoning as nutrition_checkin_reopens (0028),
-- which it deliberately mirrors in shape.
--
-- Staff-only in every direction, with no member policy at all: this is the
-- coach's own bookkeeping and it deliberately does NOT gate the member.
-- A closed-out week stays submittable — if the client does get to it, the
-- real response arrives and simply wins over the close-out everywhere it's
-- read (see deriveCheckinStatus). Blocking her instead would turn a tidy-up
-- into a lockout.
create table programming.nutrition_checkin_closeouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  week_start date not null,
  closed_at timestamptz not null default now(),
  closed_by uuid references core.users (id),
  -- One close-out per week. Makes the write an idempotent upsert, so a
  -- double-tap can't leave two rows a later "undo" would only half remove.
  unique (user_id, week_start)
);

create index nutrition_checkin_closeouts_user_idx
  on programming.nutrition_checkin_closeouts (user_id, week_start);

alter table programming.nutrition_checkin_closeouts enable row level security;

create policy "staff manage nutrition_checkin_closeouts" on programming.nutrition_checkin_closeouts
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

-- ---------------------------------------------------------------------
-- 2. Week phases
-- ---------------------------------------------------------------------
-- "Put a client in a diet on 8/10, and have the Weeks tab count it: Diet 1,
-- Diet 2, Diet 3..."
--
-- NOT the same thing as programming.nutrition_plan_phases (0050). That one
-- is the coach's undated "what we're working on" map — an ordered list of
-- themes with bullet items, surfaced on the Plan tab and the member's Today
-- slider, where `position` IS the timeline and nothing is tied to a date.
-- This is dated: it says which named phase a client was in during a given
-- calendar week, and it counts the weeks. Two different facts that happen
-- to share a word.
--
-- One row per phase CHANGE, not per week. A row means "from this week
-- onward, the phase is X" and it holds until the next row. That is what
-- makes the counter free — the number on a week's pill is just how many
-- weeks it sits after the marker that covers it — and it means a coach
-- setting a phase once doesn't have to keep setting it every Monday.
--
-- `phase` is nullable on purpose: a null row is an explicit "no phase from
-- here", which is how a phase ENDS without deleting the history of it
-- having run. No row at all (before the first marker) simply shows no pill.
create table programming.nutrition_week_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  week_start date not null,
  phase text,
  set_at timestamptz not null default now(),
  set_by uuid references core.users (id),
  -- One marker per week, so "set the phase from this week" is an upsert
  -- rather than a read-then-write that two clicks could race.
  unique (user_id, week_start),
  -- The Weeks tab enumerates Monday-Sunday calendar weeks, so every
  -- week_start written here is a Monday. Asserting it means a marker can
  -- never land half a week off the grid it's drawn on, where it would
  -- silently cover no week at all. Same guard group_blocks/spc_blocks got
  -- in 0063, for the same reason.
  constraint nutrition_week_phases_start_monday check (extract(isodow from week_start) = 1)
);

create index nutrition_week_phases_user_idx
  on programming.nutrition_week_phases (user_id, week_start);

alter table programming.nutrition_week_phases enable row level security;

-- Staff-only, no member policy: phases are coach shorthand for how a block
-- of training is being run, not something written for the client to read.
create policy "staff manage nutrition_week_phases" on programming.nutrition_week_phases
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New tables need the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
