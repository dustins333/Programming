import { todayInBoise, dayOfWeekInBoise } from "../boiseDate";

// Mon/Tue = Session 1, Wed/Thu = Session 2, Fri/Sat = Session 3, Sunday = no
// session — matches the spec's shared block calendar for Flagship/BWA.
export function sessionNumberForDate(dateString = todayInBoise()) {
  const day = dayOfWeekInBoise(dateString);
  if (day === 1 || day === 2) return 1;
  if (day === 3 || day === 4) return 2;
  if (day === 5 || day === 6) return 3;
  return null;
}

// Shared by the builder (default-open "this week's" tab, Phase 2) and the
// client portal (current vs. look-ahead weeks, Phase 3) so both read the
// same date math — one implementation, not two independently-drifting
// copies. Clamped to the block's actual length.
export function currentWeekNumber(blockStartDate, blockLengthWeeks, today = todayInBoise()) {
  const start = new Date(`${blockStartDate}T12:00:00`);
  const now = new Date(`${today}T12:00:00`);
  const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const week = Math.floor(daysSince / 7) + 1;
  return Math.min(Math.max(week, 1), blockLengthWeeks);
}
