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

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One date, spelled: "Aug 30". For a single date read as prose in a
// sentence of context ("Block 5 · Week 3 of 4 · ends Aug 30") rather than
// listed in a column, where MM-DD-YYYY would be three numbers too many.
export function formatDateShort(isoDate) {
  if (!isoDate) return "";
  const [, month, day] = isoDate.split("-");
  if (!month || !day) return isoDate;
  return `${MONTHS_SHORT[Number(month) - 1]} ${Number(day)}`;
}

// A date span as one phrase: "Aug 6 – 19" inside a month, "Jul 30 – Aug 12"
// across one. Used wherever a pay period is named as a heading rather than
// listed in a dense grid — the Log header, My Pay's band, the finalize
// sheet — which is why it spells the month instead of reusing formatDateMD's
// MM/DD (that stays for the calendar grids, where columns are tight).
//
// Split off the ISO string rather than parsed through Date: a bare
// `new Date("2026-08-06")` resolves at UTC midnight and renders as the
// previous day for anyone west of it.
export function formatDateRange(startIso, endIso) {
  if (!startIso || !endIso) return "";
  const [, sMonth, sDay] = startIso.split("-");
  const [, eMonth, eDay] = endIso.split("-");
  if (!sMonth || !eMonth) return "";
  const left = `${MONTHS_SHORT[Number(sMonth) - 1]} ${Number(sDay)}`;
  const right = sMonth === eMonth ? `${Number(eDay)}` : `${MONTHS_SHORT[Number(eMonth) - 1]} ${Number(eDay)}`;
  return `${left} – ${right}`;
}
