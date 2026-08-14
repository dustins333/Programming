import { dateInBoise, todayInBoise, addDays } from "./boiseDate";

// Explicit option lists for scheduling controls, rendered as a <select>
// pair on web and a NativePickerField pair on native.
//
// Deliberately NOT <input type="datetime-local"> — cross-browser behaviour
// for a combined date+time control with a `step` is genuinely inconsistent
// (Safari doesn't auto-close on date selection the way Chrome does), and it
// read as broken in practice. See app/(coach)/announcements/index.js, where
// this started life before events needed the same thing.
//
// Everything here reads the instant in BOISE, not device-local, so a coach
// travelling doesn't schedule against a clock the gym isn't on.

// scan-announcements only polls every 15 minutes (0025's cron schedule), so
// offering finer granularity would be a false promise of precision.
export function roundUpToQuarterHour(date) {
  const ms = 15 * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

export function toDateValue(date) {
  return dateInBoise(date);
}

export function toTimeValue(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Boise",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildTimeOptions() {
  const options = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 15, 30, 45]) {
      const pad = (n) => String(n).padStart(2, "0");
      const period = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      options.push({ value: `${pad(h)}:${pad(m)}`, label: `${h12}:${pad(m)} ${period}` });
    }
  }
  return options;
}

export const TIME_OPTIONS = buildTimeOptions();

// Built from the Boise date, so "Today" means today at the gym even when
// the coach's device disagrees.
export function buildDateOptions(daysAhead, { includeNone = false, noneLabel = "No date" } = {}) {
  const options = includeNone ? [{ value: "", label: noneLabel }] : [];
  const today = todayInBoise();
  for (let i = 0; i < daysAhead; i += 1) {
    const value = addDays(today, i);
    // Parsed at noon so the weekday label can't roll to the wrong day.
    const label =
      i === 0
        ? "Today"
        : i === 1
        ? "Tomorrow"
        : new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    options.push({ value, label });
  }
  return options;
}
