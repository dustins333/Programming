import { dayOfWeekInBoise } from "./boiseDate";

// Pure calendar-grid math on plain year/month integers — deliberately never
// touches a Date object for anything beyond dayOfWeekInBoise's own internal
// noon-anchored parse, matching this app's standing "never trust device
// local time for date math" rule (lib/boiseDate.js).
//
// Extracted out of DateCalendarPicker so the Monday-only photo-schedule
// picker builds its grid from the identical implementation rather than a
// second copy that could drift.

export const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  // month is 1-12
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function buildMonthGrid(year, month) {
  const monthStart = `${year}-${pad2(month)}-01`;
  const firstWeekday = dayOfWeekInBoise(monthStart); // 0=Sun
  const total = daysInMonth(year, month);

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

// Steps a viewed year/month by `delta` months, wrapping the year.
export function stepMonth(year, month, delta) {
  let m = month + delta;
  let y = year;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  return { year: y, month: m };
}
