-- Blocks get their own length, and can extend rather than being replaced.
--
-- Two coach asks from the same conversation:
--   1. Set a block's length when creating it, instead of always inheriting
--      the program's default.
--   2. Extend a block that's already running — some clients keep doing the
--      same lifts indefinitely, and the workaround until now was to
--      duplicate the whole block every few weeks, by hand, forever.
--
-- --- group_blocks.block_length_weeks -----------------------------------
--
-- Group blocks never stored their own length: it was always read off
-- group_programs.block_length_weeks, with block_end_date computed from it
-- at creation. That makes a per-block length impossible — every week-number
-- calculation in the app (schedule.js's currentWeekNumber, which CLAMPS to
-- the length it's given) would use the program's number and silently
-- mis-number, or truncate, the weeks of any block that differs from it.
-- SPC has always had this column; group is being brought in line.
--
-- The backfill is exact, not a guess: every existing block's end date was
-- computed as start + length*7 - 1, so length is recoverable from the dates
-- with no reference to the program's current default (which may since have
-- been edited, making it the wrong source to backfill from).
alter table programming.group_blocks add column if not exists block_length_weeks smallint;

update programming.group_blocks
   set block_length_weeks = ((block_end_date - block_start_date) + 1) / 7
 where block_length_weeks is null;

-- Any block whose dates don't divide evenly into whole weeks would land on
-- a truncated value above; there shouldn't be any (every writer computes
-- end = start + n*7 - 1), but round up rather than leave a short block, and
-- never leave a null behind before the NOT NULL below.
update programming.group_blocks
   set block_length_weeks = greatest(block_length_weeks, 1)
 where block_length_weeks is null or block_length_weeks < 1;

alter table programming.group_blocks alter column block_length_weeks set not null;

-- --- auto_extend -------------------------------------------------------
--
-- A rolling block: instead of ending, it grows a week at a time as it
-- nears its end date, carrying the previous week's content forward. The
-- daily SPC scan (supabase/functions/scan-spc-alerts) does the extending,
-- and it deliberately extends INSTEAD OF auto-drafting a following block,
-- so a rolling block can never end up with a duplicate queued behind it.
-- Off by default: every existing block keeps ending exactly when it does
-- today, and turning it off again is just flipping this back to false.
alter table programming.group_blocks add column if not exists auto_extend boolean not null default false;
alter table programming.spc_blocks add column if not exists auto_extend boolean not null default false;

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New columns need the PostgREST schema-cache nudge — run this right after:
--   notify pgrst, 'reload schema';
