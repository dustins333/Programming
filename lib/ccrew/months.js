// Period helpers. A CCrew period is always the FIRST of a calendar month —
// Terra pulls Kilo 1st-to-last-day and runs it on the 1st or 2nd of the
// following month, and the range never includes the new month's dates.
//
// All arithmetic is on the plain ISO string, never through `new Date`, for
// the same reason as lib/boiseDate.js: parsing a bare date and reading it
// back shifts the day for anyone west of UTC.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function periodLabel(period) {
  if (!period) return "";
  const [y, m] = String(period).split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${y}` : String(period);
}

export function periodShort(period) {
  if (!period) return "";
  const [y, m] = String(period).split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name.slice(0, 3)} ${y.slice(2)}` : String(period);
}

export function toPeriod(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

/** The month that just ended, in Boise terms — the one Terra is about to upload. */
export function previousPeriod(todayIso) {
  const [y, m] = String(todayIso).split("-").map(Number);
  return m === 1 ? toPeriod(y - 1, 11) : toPeriod(y, m - 2);
}

/** Recent periods, newest first, for the upload screen's month picker. */
export function recentPeriods(todayIso, count = 18) {
  const [y, m] = String(todayIso).split("-").map(Number);
  const out = [];
  let year = y;
  let idx = m - 1; // 0-based index of the current month
  for (let i = 0; i < count; i += 1) {
    out.push(toPeriod(year, idx));
    idx -= 1;
    if (idx < 0) { idx = 11; year -= 1; }
  }
  return out;
}

export { MONTH_NAMES };
