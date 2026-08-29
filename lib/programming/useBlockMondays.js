import { useEffect, useMemo, useState } from "react";
import { todayInBoise, mondayOnOrBefore, addDays } from "../boiseDate";
import { rangesOverlap } from "../dateRange";

// The Monday-picking rules a block dialog needs, in one place. Extracted from
// SendSpcBlockModal when MoveSpcBlockModal needed the identical arithmetic —
// two copies of "which Mondays would collide" is exactly how a dialog ends up
// offering a date the write then refuses.
//
// How far ahead the calendar has an answer for. Every Monday past this is
// pickable, which is fine: the write still refuses a real overlap, and nobody
// schedules a training block three years out.
const WINDOW_WEEKS = 160;

function mondayWindow(blocks) {
  const thisMonday = mondayOnOrBefore(todayInBoise());
  const earliest = blocks.reduce((min, b) => (b.block_start_date < min ? b.block_start_date : min), thisMonday);
  return Array.from({ length: WINDOW_WEEKS }, (_, i) => addDays(mondayOnOrBefore(earliest), i * 7));
}

// visible        remount/reset signal — the opening default is applied on the
//                transition to true and never again, so it can't stomp a date
//                the coach has already picked
// lengthWeeks    the block being placed
// existingBlocks this client's other blocks
// excludeBlockId the block being MOVED — its own current range must not count
//                as a collision with itself
// initialStart   where to open (a move opens on the block's current start);
//                null opens on the first Monday from this week on that fits
export function useBlockMondays({ visible, lengthWeeks, existingBlocks = [], excludeBlockId = null, initialStart = null }) {
  const [startDate, setStartDate] = useState(mondayOnOrBefore(todayInBoise()));

  const scheduled = useMemo(
    () => existingBlocks.filter((b) => b.block_start_date && b.id !== excludeBlockId),
    [existingBlocks, excludeBlockId]
  );
  const mondays = useMemo(() => mondayWindow(scheduled), [scheduled]);

  // Mondays sitting inside a block that already exists — marked rather than
  // just refused, so an occupied stretch reads as a solid run.
  const takenMondays = useMemo(
    () => mondays.filter((m) => scheduled.some((b) => b.block_start_date <= m && m <= b.block_end_date)),
    [mondays, scheduled]
  );

  // A superset of the taken ones: starting in a free week is still no good if
  // this block's full length would run into the next one.
  const blockedMondays = useMemo(() => {
    if (!(lengthWeeks >= 1)) return takenMondays;
    return mondays.filter((m) =>
      scheduled.some((b) => rangesOverlap(m, addDays(m, lengthWeeks * 7 - 1), b.block_start_date, b.block_end_date))
    );
  }, [mondays, scheduled, lengthWeeks, takenMondays]);

  useEffect(() => {
    if (!visible) return;
    if (initialStart) return setStartDate(mondayOnOrBefore(initialStart));
    const thisMonday = mondayOnOrBefore(todayInBoise());
    setStartDate(mondays.find((m) => m >= thisMonday && !blockedMondays.includes(m)) ?? thisMonday);
    // Deliberately not keyed on the memos' identity — this is the OPENING
    // default, and re-running it would stomp a date the coach had picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return {
    startDate,
    setStartDate,
    takenMondays,
    blockedMondays,
    overlaps: blockedMondays.includes(startDate),
    endDate: lengthWeeks >= 1 ? addDays(startDate, lengthWeeks * 7 - 1) : startDate,
  };
}
