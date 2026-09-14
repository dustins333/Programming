import { addDays, todayInBoise } from "../boiseDate";
import { getCurrentBlock, listWorkoutsForWeek } from "./memberPlan";
import { currentWeekNumber, blockLengthWeeks, formatSessionDays } from "./schedule";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "./spcBlocks";

// "Preview next block" / "Preview next program": the look-ahead at the seam
// between a program that is ending and the one that picks up the day after.
//
// The block overview (plan-block.js) only ever shows the block covering
// today, so on the last week of a block there was no way for a member to see
// what was coming, which is exactly when everyone looks. This fills that gap
// and nothing else: it is read-only, it covers the first week only, and it
// goes away the moment the new block actually starts and becomes her normal
// view.
//
// It only exists when BOTH are true: the current program has a real end date
// that falls this week, and a published program starts the very next day. A
// gap between the two, an ongoing SPC program (no end date, 0103) and a
// rolling group block all show nothing.
//
// ROLLING GROUP BLOCKS deliberately never show it, and that is the right
// answer rather than a gap:
//
//   * A rolling block (auto_extend, migration 0049) has no "next block" — it
//     grows a week at a time. supabase/functions/scan-spc-alerts runs daily
//     and extends any rolling block once it is within `alert_lead_time_days`
//     (default 3) of its end date, so its final week keeps moving.
//   * That extra week is a verbatim copy of the week she has just finished
//     (see _shared/extendBlock.ts), so a preview of it would show her what she
//     just did.
//   * If the lookup lands on the same block, it returns null, so the button
//     stays away rather than promising something that is not there.

// The whole final week, Monday through Sunday (Terra, 2026-09-13). It used to
// open at 4pm on the final Sunday only. Every block runs Monday–Sunday
// (migration 0063), so "the final week" is just the six days before the end
// date plus the end date itself — no weekday arithmetic.
export function nextBlockPreviewIsDue(blockEndDate, today = todayInBoise()) {
  if (!blockEndDate) return false;
  return today >= addDays(blockEndDate, -6) && today <= blockEndDate;
}

// Whether it's worth looking the next block up at all. Cheap client-side
// check off data My Week already has, so the extra round trip below only
// happens during a block's final week rather than on every load, all cycle.
export function isFinalWeekOfBlock(weekNumber, lengthWeeks) {
  return Number(weekNumber) > 0 && Number(weekNumber) >= Number(lengthWeeks);
}

// The first week of whatever block picks up the day after this one ends.
// Returns null — never a half-populated object — whenever there is nothing
// worth showing: no block queued, the same block continuing (rolling), or a
// next block whose first week the coach hasn't published anything in yet.
// "if they are not published, no button" is enforced here, at the source,
// rather than left to the UI to remember.
export async function getNextBlockPreview({ program, block }) {
  if (!program?.id || !block?.block_end_date) return null;

  // Blocks end Sunday, so this is always the Monday the next one would start.
  // Derived from the block's own end date rather than from today, so the
  // lookup is the same answer on any day of the final week.
  const firstDay = addDays(block.block_end_date, 1);

  // Reuses the member's own "which block covers this date" resolver — it
  // already carries the prefer-whichever-has-published-content tiebreak for
  // the case where a coach has two overlapping blocks on file.
  const next = await getCurrentBlock(program.id, firstDay);
  if (!next || next.id === block.id) return null;

  const lengthWeeks = blockLengthWeeks(next, program);
  const weekNumber = currentWeekNumber(next.block_start_date, lengthWeeks, firstDay);
  // RLS already filters this to published rows, so an unpublished session
  // slot simply doesn't come back (migration 0004's member read policy has no
  // date restriction, which is what makes reading a future block legal at
  // all).
  const workouts = await listWorkoutsForWeek(next.id, weekNumber);
  if (workouts.length === 0) return null;

  // Every slot the program runs gets a row, published or not — the same rule
  // My Week's own stripes follow. A half-published week reads honestly as
  // "session 3 isn't ready yet" instead of quietly looking like a 2x week.
  const slots = program.sessions_per_week ?? workouts.length;
  const rows = Array.from({ length: slots }, (_, i) => i + 1).map((sessionNumber) => {
    const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
    return {
      key: `next-session-${sessionNumber}`,
      sessionNumber,
      workoutId: workout?.id ?? null,
      published: !!workout,
      label: `Session ${sessionNumber}`,
      sessionLabel: `S${sessionNumber}`,
      // Null rather than "Untitled session": the row falls back to its own
      // "Session 2" heading, same convention the preview openers use.
      title: workout?.title || null,
      caption: formatSessionDays(program.session_days?.[sessionNumber - 1]),
    };
  });

  return {
    blockId: next.id,
    startDate: next.block_start_date,
    endDate: next.block_end_date,
    lengthWeeks,
    weekNumber,
    weekStartDate: firstDay,
    weekEndDate: addDays(firstDay, 6),
    rows,
  };
}

// The SPC equivalent. A member can only read a queued SPC program's sessions
// from the Monday of the week before it starts (migration 0131 widened 0102's
// start-date gate by exactly seven days), which is the same window this
// preview is offered in.
//
// SPC has no day-of-week routing, so the rows carry no caption, and a
// sessions-format program has one row per session for the whole run, so
// "the first week" is simply every published session.
export async function getNextSpcProgramPreview({ userId, block, sessionsPerWeek }) {
  // No end date = an ongoing program, which never hands off to anything.
  if (!userId || !block?.block_end_date) return null;

  const firstDay = addDays(block.block_end_date, 1);
  const next = await getCurrentSpcBlock(userId, firstDay);
  // getCurrentSpcBlock's lapsed fallback can hand back the CURRENT program
  // when nothing covers firstDay, so the id check is what rules out "nothing
  // queued". The start-date check rules out anything but a clean hand-off.
  if (!next || next.id === block.id || next.block_start_date !== firstDay) return null;

  const workouts = await listSpcWorkoutsForWeek(next.id, 1, next);
  if (workouts.length === 0) return null;

  const ongoing = next.block_end_date == null;
  const slots = Math.max(sessionsPerWeek ?? 0, ...workouts.map((w) => w.session_number));
  const rows = Array.from({ length: slots }, (_, i) => i + 1).map((sessionNumber) => {
    const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
    return {
      key: `next-spc-session-${sessionNumber}`,
      sessionNumber,
      workoutId: workout?.id ?? null,
      published: !!workout,
      label: `Session ${sessionNumber}`,
      sessionLabel: `S${sessionNumber}`,
      title: workout?.title || null,
      caption: null,
    };
  });

  return {
    blockId: next.id,
    startDate: next.block_start_date,
    endDate: next.block_end_date,
    lengthWeeks: ongoing ? null : next.block_length_weeks,
    weekNumber: 1,
    weekStartDate: firstDay,
    weekEndDate: addDays(firstDay, 6),
    rows,
  };
}
