-- Hanging-folder tabs along the top of each week on the Weeks tab.
--
-- The metaphor is Terra's: the tabs that stick up out of a hanging folder,
-- so a coach scanning eleven weeks can see at a glance what was going on in
-- each one without opening it. Three kinds of tab:
--
--   Phase           the run this week belongs to ("Diet 3"), now colour-coded
--   Targets changed  derived, nothing stored, see below
--   a free label     "Mexico trip", "family vacation"
--
-- Only the first and third need schema. The middle one is computed from
-- programming/public target history and simply moved from a divider drawn
-- BETWEEN two weeks onto the week the change actually landed in, which is
-- what prompted the whole idea: a mid-week target change rendered above the
-- week read as belonging to the week above it.
--
-- ---------------------------------------------------------------------
-- 1. A colour on each phase marker
-- ---------------------------------------------------------------------
-- Stored on the MARKER (one row per phase change, see 0111), not in a
-- registry keyed on the phase name. Two reasons: phase names are free text
-- with no table behind them, so a registry would need renames kept in sync
-- for a purely visual concern; and a coach who wants this run of Diet drawn
-- differently from the last one can have it.
--
-- Consistency for the common case is handled in the app instead: picking a
-- name that has been used before prefills the colour that name last used,
-- so "Diet" stays the same colour by default without anything enforcing it.
--
-- The value is a palette KEY ("clay", "olive", ...), never a hex, so the
-- palette can be retuned without touching a single row. Deliberately no
-- CHECK against the known keys: colour is a display concern, an unknown key
-- falls back to the default in the app (see PHASE_COLORS in
-- lib/nutrition/weekPhases.js), and a CHECK would mean a migration every
-- time a colour is added. Null means "never set" and reads as the default.
alter table programming.nutrition_week_phases
  add column if not exists color text;

-- ---------------------------------------------------------------------
-- 2. Free-text tabs on a week
-- ---------------------------------------------------------------------
-- "Just so looking over the weeks its easy to see what was going on."
--
-- Deliberately NOT another column on nutrition_week_phases, even though
-- both hang off (user, week). A phase marker is a RUN — it holds until the
-- next marker — while a note is about ONE week and nothing else. Folding
-- them together would mean writing a note on a week created a phase marker
-- there, which would silently end whatever phase was running.
--
-- Several notes per week are allowed (a trip AND an illness), so the key is
-- a plain id rather than (user_id, week_start): the tab strip wraps, and
-- capping it at one would only push a coach into cramming two things into
-- one label.
create table if not exists programming.nutrition_week_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  week_start date not null,
  label text not null,
  created_at timestamptz not null default now(),
  created_by uuid references core.users (id),
  -- The Weeks tab enumerates Monday-Sunday calendar weeks, so every
  -- week_start written here is a Monday. Same guard nutrition_week_phases
  -- got in 0111, for the same reason: a note half a week off the grid it is
  -- drawn on would silently attach to no week at all.
  constraint nutrition_week_notes_start_monday check (extract(isodow from week_start) = 1)
);

create index if not exists nutrition_week_notes_user_idx
  on programming.nutrition_week_notes (user_id, week_start);

alter table programming.nutrition_week_notes enable row level security;

-- Staff-only in every direction, with no member policy at all — same as
-- nutrition_week_phases. This is the coach's own shorthand about what was
-- going on in a week, written for a coach's eye.
drop policy if exists "staff manage nutrition_week_notes" on programming.nutrition_week_notes;
create policy "staff manage nutrition_week_notes" on programming.nutrition_week_notes
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New table needs the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
