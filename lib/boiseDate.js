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
  return `${datePart} ${formatTimeInBoise(isoTimestamp)}`;
}

// Just the clock half of the above — for a list that is already scoped to
// one day, where repeating the date on every row says nothing. Same
// formatter, so the two can never disagree about how a time is written.
export function formatTimeInBoise(isoTimestamp) {
  if (!isoTimestamp) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(isoTimestamp));
}

// The instant at which a given Boise wall-clock date + time occurs, as an
// ISO string. Everything scheduled in this app is picked in gym time, but
// `new Date("2026-08-12T06:00:00")` parses in the *device's* zone — so a
// coach on a laptop set to another timezone scheduled an announcement for
// the wrong gym-local hour, and the History line (which does render in
// Boise) then disagreed with what they picked.
//
// Solved by measuring rather than hardcoding an offset, so DST is handled:
// interpret the wall time as UTC, see what Boise time that instant actually
// is, and correct by the difference. Two passes, because a first correction
// can cross a DST boundary and change the offset that applies.
export function boiseInstantFrom(dateString, timeString) {
  const target = Date.parse(`${dateString}T${timeString}:00Z`);
  if (Number.isNaN(target)) throw new Error(`Invalid date/time: ${dateString} ${timeString}`);

  let instant = target;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(instant));
    const get = (type) => parts.find((p) => p.type === type).value;
    // What that instant reads as on a Boise clock, expressed as a UTC
    // timestamp so it can be differenced against the target directly.
    const asBoiseWallClock = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}:${get("second")}Z`
    );
    instant += target - asBoiseWallClock;
  }
  return new Date(instant).toISOString();
}

// Plain ISO-string date math — same implementation already duplicated in
// lib/programming/blocks.js and spcBlocks.js, but those are coach-only
// modules; this copy lives here so member-side code (the My Week overview's
// Monday-Sunday nutrition strip) doesn't need to reach into coach lib files
// for basic date arithmetic.
// All arithmetic in UTC, deliberately. The old implementation parsed
// `${dateString}T00:00:00` as *device-local* midnight and then formatted
// with toISOString(), which is UTC — so on any device at a positive UTC
// offset local midnight is the previous day in UTC and the whole function
// was off by one (on UTC+2, addDays("2026-08-12", 1) returned
// "2026-08-12"). Correct in the Americas, wrong for a member travelling.
// Parsing "YYYY-MM-DD" with no time part is defined as UTC midnight, so
// Date.UTC/setUTCDate/toISOString are consistent end to end.
export function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The Monday of the week `dateString` falls in — i.e. snap backward, and a
// Monday returns itself. The forward counterpart is mondayOnOrAfter() in
// lib/nutrition/weekCycle.js, which anchors a check-in cadence; this one
// exists for training blocks, which snap BACK so the block still covers the
// date the coach asked for rather than leaving a gap until next week.
//
// Every training block starts on a Monday (migration 0063) so that a block
// week and a calendar week are the same seven days. They weren't before:
// currentWeekNumber() counts flat 7-day chunks from block_start_date while
// sessionNumberForDate() assigns sessions by weekday, so a block starting
// mid-week put one calendar week's sessions in two different block weeks.
export function mondayOnOrBefore(dateString) {
  const dow = dayOfWeekInBoise(dateString); // 0=Sun..6=Sat
  return addDays(dateString, dow === 0 ? -6 : 1 - dow);
}

// dateA - dateB, in whole days — e.g. daysBetween(today, aPastDate) is
// positive. Same T00:00:00 local-midnight parsing as addDays above, so the
// two stay consistent with each other.
export function daysBetween(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00Z`);
  const b = new Date(`${dateB}T00:00:00Z`);
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

// The hour (0-23) it currently is on a Boise clock. Everything else in this
// app is date-only, so this is the one place a time of day matters: the
// "preview next block" button opens partway through the block's final
// Sunday rather than at midnight, because Sunday morning is still the old
// week (someone may still be logging Saturday's session).
//
// hourCycle h23 rather than hour12:false — the latter renders midnight as
// "24" under some ICU versions (see boiseInstantFrom's own guard for the
// same trap), so the modulo below is belt and braces.
export function hourInBoise(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "hour")?.value;
  const hour = Number(raw);
  return Number.isFinite(hour) ? hour % 24 : 0;
}
