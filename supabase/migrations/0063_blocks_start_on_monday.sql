-- Every training block starts on a Monday.
--
-- WHY: a block's weeks are counted as flat 7-day chunks from
-- block_start_date (lib/programming/schedule.js's currentWeekNumber), but a
-- block's SESSIONS are assigned by weekday (sessionNumberForDate — Mon/Tue =
-- session 1, Wed/Thu = 2, Fri/Sat = 3, per each program's session_days from
-- migration 0011). Those two only agree when the block starts on a Monday.
-- Starting mid-week put a single calendar week's sessions into two different
-- block weeks — e.g. a Thursday-start block had Mon/Wed reading as week 1
-- while that same calendar week's Thursday was already week 2 — so sessions
-- were silently skipped or repeated with nobody doing anything wrong.
--
-- Two parts: snap the blocks that already exist, then a CHECK so no future
-- code path, migration, or hand-written SQL can reintroduce the problem.

-- 1. Snap existing blocks BACK to the Monday of the week they started in,
--    keeping their length in weeks (so block_end_date moves back with the
--    start and every block now ends on a Sunday).
--
--    Backward, not forward, for two reasons: the block keeps covering the
--    dates it already covered rather than opening a gap, and it's the
--    direction that disturbs live clients least. Checked against the real
--    data before running: today's week number is unchanged for every block
--    with sessions logged against it (LLYL wk3, Bob wk2, Dustin wk3, Terra
--    wk2) and for BWA and Ashley Mullett too. The one block that shifts
--    (Reviewer, Sunday start, week 1 -> 2) is the Apple review demo account
--    with nothing logged. Snapping forward instead would have pushed four
--    live clients backward a week.
--
--    Nothing historical is rewritten: session_completions keys off the
--    workout row (plus week_number for SPC) and logs key off date_performed,
--    so no completed session moves. Only the calendar-to-week-number mapping
--    changes from here forward.
--
--    A single UPDATE's SET expressions all read the OLD row, so the second
--    expression below sees the pre-snap block_start_date. That is deliberate.
--
--    Rollback, if this ever needs undoing (values as of 2026-08-15):
--      update programming.group_blocks set block_start_date='2026-07-22', block_end_date='2026-09-01' where id='9cf64fb0-77c3-48ae-bd83-6c3f94fdfe5f';
--      update programming.group_blocks set block_start_date='2026-08-01', block_end_date='2026-08-28' where id='68e95236-f168-4ba9-abf5-24097894d507';
--      update programming.spc_blocks   set block_start_date='2026-08-01', block_end_date='2026-08-28' where id='a7148f4b-0e7f-46ad-9292-cff41f6d3105';
--      update programming.spc_blocks   set block_start_date='2026-08-06', block_end_date='2026-09-02' where id='d1755d6c-1097-4701-bb20-ef4f22c51666';
--      update programming.spc_blocks   set block_start_date='2026-08-08', block_end_date='2026-09-04' where id='135213fc-9f0c-45e4-8f55-8de56294e223';
--      update programming.spc_blocks   set block_start_date='2026-08-09', block_end_date='2026-09-05' where id='a73866d0-7423-496d-9df8-77c6de06afd0';
--      update programming.spc_blocks   set block_start_date='2026-08-14', block_end_date='2026-10-08' where id='46ccebf6-adf2-4a82-8d96-efdbc7d6e9a6';
--    (the CHECK constraints below have to be dropped first).

update programming.group_blocks
set
  block_start_date = block_start_date - (extract(isodow from block_start_date)::int - 1),
  block_end_date   = block_start_date - (extract(isodow from block_start_date)::int - 1)
                     + (block_length_weeks * 7 - 1)
where extract(isodow from block_start_date) <> 1;

update programming.spc_blocks
set
  block_start_date = block_start_date - (extract(isodow from block_start_date)::int - 1),
  block_end_date   = block_start_date - (extract(isodow from block_start_date)::int - 1)
                     + (block_length_weeks * 7 - 1)
where extract(isodow from block_start_date) <> 1;

-- 2. Make it structural. The app snaps too (lib/boiseDate.js's
--    mondayOnOrBefore, applied in createBlock/createSpcBlock and mirrored in
--    supabase/functions/scan-spc-alerts), but a constraint is what actually
--    guarantees it — the app-side snap is there so a coach never SEES this
--    error, not to be the only thing standing between us and the bug.
--
--    isodow: 1 = Monday. extract(isodow from <date>) is immutable, so it is
--    valid in a CHECK (verified against this project before writing it —
--    to_char(..., 'ID') would NOT be, being lc_time-dependent).

alter table programming.group_blocks
  add constraint group_blocks_start_monday
  check (extract(isodow from block_start_date) = 1);

alter table programming.spc_blocks
  add constraint spc_blocks_start_monday
  check (extract(isodow from block_start_date) = 1);
