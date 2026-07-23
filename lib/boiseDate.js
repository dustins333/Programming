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
