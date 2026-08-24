import { addDays, todayInBoise, hourInBoise } from "../boiseDate";
import { getCurrentBlock, listWorkoutsForWeek } from "./memberPlan";
import { currentWeekNumber, blockLengthWeeks, formatSessionDays } from "./schedule";

// "Preview next block" — the look-ahead at the seam between two blocks.
//
// The block overview (plan-block.js) only ever shows the block covering
// today, so on the last week of a block there was no way for a member to see
// what was coming, which is exactly when everyone looks. This fills that gap
// and nothing else: it is read-only, it covers next week only, and it goes
// away the moment the new block actually starts and becomes her normal view.
//
// ROLLING BLOCKS deliberately never show it, and that is the right answer
// rather than a gap:
//
//   * A rolling block (auto_extend, migration 0049) has no "next block" — it
//     grows a week at a time. supabase/functions/scan-spc-alerts runs daily
//     around 6-7am Boise and extends any rolling block once it is within
//     `alert_lead_time_days` (default 3) of its end date, so a block ending
//     Sunday grows on the Thursday before. By the time this window opens on
//     Sunday afternoon the block is already longer and its final week has
//     moved, so `isLastDayOfBlock` below is simply false.
//   * That extra week is a verbatim copy of the week she has just finished
//     (see _shared/extendBlock.ts — content, title and published state are
//     all carried forward), so a preview of it would show her what she just
//     did, and it is already visible on her block overview either way.
//   * The instant a coach turns rolling off and queues a real next block, the
//     button starts behaving exactly like every other program's.
//
// If a rolling block ever DOES reach its own last day unextended — the scan
// failed, or the lead time is 0 and the cron has not fired yet — the lookup
// below finds no different block behind it and returns null, so the button
// still stays away rather than promising something that is not there.

// The block's final Sunday is the day this opens, and PREVIEW_OPENS_HOUR is
// how far into it. Sunday morning still belongs to the old week — someone may
// be logging Saturday's session — so the seam is drawn in the afternoon.
export const PREVIEW_OPENS_HOUR = 16;

// Every block runs Monday–Sunday (migration 0063), so "today is the block's
// last day" IS "today is the final Sunday" — no weekday arithmetic needed,
// and it can't drift if a block's length changes underneath it.
export function nextBlockPreviewIsDue(blockEndDate, today = todayInBoise(), hour = hourInBoise()) {
  if (!blockEndDate) return false;
  return today === blockEndDate && hour >= PREVIEW_OPENS_HOUR;
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
