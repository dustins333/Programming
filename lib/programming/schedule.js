import { todayInBoise, dayOfWeekInBoise } from "../boiseDate";

// Historical Flagship/BWA scheme (Mon/Tue = Session 1, Wed/Thu = Session
// 2, Fri/Sat = Session 3) — used only as a fallback for callers that
// haven't been updated to pass a specific program's own session_days
// (migration 0011). Every group program owns its own day map now instead
// of sharing this one globally, since a specialty program can run at a
// different frequency/schedule (e.g. 2x/week on different days).
export const DEFAULT_SESSION_DAYS = [[1, 2], [3, 4], [5, 6]];

// dayMap: array of arrays of weekday ints (0=Sunday..6=Saturday), index i
// = session (i+1)'s applicable weekdays — a program's
// group_programs.session_days. Returns null (no session today) when the
// date's weekday isn't in any session's list.
export function sessionNumberForDate(dateString = todayInBoise(), dayMap = DEFAULT_SESSION_DAYS) {
  const day = dayOfWeekInBoise(dateString);
  const index = dayMap.findIndex((days) => days.includes(day));
  return index === -1 ? null : index + 1;
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Mon/Tue" style caption for one session's entry in a day map — used
// wherever a session needs a human-readable "which days is this" label.
export function formatSessionDays(days) {
  if (!days || days.length === 0) return null;
  return days.map((d) => DAY_ABBR[d]).join("/");
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
