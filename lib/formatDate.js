// Display-only transform: ISO "YYYY-MM-DD" → "MM-DD-YYYY". Every internal
// use of a date (Supabase storage, todayInBoise() comparisons, block-length
// math in schedule.js/memberPlan.js/spcBlocks.js) must stay ISO since those
// rely on lexicographic string ordering — never feed this output back into
// a query, comparison, or date constructor. Text rendering only.
export function formatDateMDY(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${month}-${day}-${year}`;
}

// Compact "MM/DD" (no year) — used for the Group Programs / SPC calendar
// grids' week-range row labels, where the row's relative label ("Current
// week", "3 weeks out") already establishes which year/era it's in.
export function formatDateMD(isoDate) {
  if (!isoDate) return "";
  const [, month, day] = isoDate.split("-");
  if (!month || !day) return isoDate;
  return `${month}/${day}`;
}
