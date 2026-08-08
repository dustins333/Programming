const TIMEZONE = "America/Boise";

// Boise-local YYYY-MM-DD for an arbitrary instant — never slice a
// timestamptz's ISO string directly for this (that gives the UTC date,
// which is already "tomorrow" for anything logged in the Boise evening).
export function dateInBoise(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Never trust device/client local time for "today" — an evening in Boise
// can already be "tomorrow" elsewhere, and a traveling coach/client's
// device timezone shouldn't shift which session or week they see. Same
// lesson the Nutrition Tracker app already learned the hard way.
export function todayInBoise() {
  return dateInBoise(new Date());
}

// 0=Sunday..6=Saturday. Re-parses the already-resolved Boise date string at
// noon (not midnight) so a second timezone conversion during parsing can't
// roll it over to the wrong day.
export function dayOfWeekInBoise(dateString = todayInBoise()) {
  return new Date(`${dateString}T12:00:00`).getDay();
}

// Boise-local "MM/DD HH:MM AM/PM" for a timestamptz — e.g. when a check-in
// was actually submitted. Never derive this by slicing the ISO string
// directly, same timezone-conversion rule as dateInBoise/todayInBoise above.
export function formatDateTimeInBoise(isoTimestamp) {
  if (!isoTimestamp) return "";
  const instant = new Date(isoTimestamp);
  const datePart = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, month: "2-digit", day: "2-digit" }).format(instant);
  const timePart = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(instant);
  return `${datePart} ${timePart}`;
}

// Plain ISO-string date math — same implementation already duplicated in
// lib/programming/blocks.js and spcBlocks.js, but those are coach-only
// modules; this copy lives here so member-side code (the My Week overview's
// Monday-Sunday nutrition strip) doesn't need to reach into coach lib files
// for basic date arithmetic.
export function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// dateA - dateB, in whole days — e.g. daysBetween(today, aPastDate) is
// positive. Same T00:00:00 local-midnight parsing as addDays above, so the
// two stay consistent with each other.
export function daysBetween(dateA, dateB) {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}
