-- Plan phases get a coach-set status: planned / now / done.
--
-- 0050 deliberately shipped without one ("delete to retire") on the theory
-- that position alone carries the timeline. The coach web v2 handoff's Plan
-- tab (screen 21) shows DONE and NOW badges on the phase cards, and that is
-- a genuinely different fact from order: order says which phase comes next,
-- status says which one she is actually in right now. A finished phase also
-- shouldn't have to be deleted to stop reading as upcoming — that threw away
-- the history of what the client had already worked through.
--
-- Deliberately a free column and not derived from position. "The first
-- not-done phase is the current one" looks tempting and is wrong the moment
-- a coach runs two themes side by side, or parks a phase mid-way.
--
-- 'planned' is the default so every existing row keeps rendering exactly as
-- it does today (no badge) with no backfill. The member's Today card slider
-- reads these too — see components/nutrition/TodayCardSlider.js — so 'done'
-- phases drop out of her slider without the coach deleting anything.
alter table programming.nutrition_plan_phases
  add column status text not null default 'planned'
    check (status in ('planned', 'now', 'done'));

-- Existing rows already carry the default; no separate update needed.
--
-- New columns need the same PostgREST schema-cache nudge new tables do —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
