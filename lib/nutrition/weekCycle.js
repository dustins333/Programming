import { addDays, dayOfWeekInBoise, todayInBoise } from "../boiseDate";
import { loggedCalories } from "./targets";

// Global check-in cycle shared by every client, not a per-client rollover
// day — the source Nutrition Tracker app's original per-client cycle
// (clients.check_in_day) caused real misfiled submissions; one shared
// anchor fixed it. Sunday is the anchor (0): the current week's window
// always ends on the most recent Sunday on/before today, so a Monday-Sunday
// window becomes "current" the moment today is a Sunday.
const ANCHOR_DAY = 0;



export function computeWeekWindows(today = todayInBoise()) {
  const daysSinceAnchor = (dayOfWeekInBoise(today) - ANCHOR_DAY + 7) % 7;
  const currentWeekEnd = addDays(today, -daysSinceAnchor);
  const currentWeekStart = addDays(currentWeekEnd, -6);
  const lastWeekEnd = addDays(currentWeekStart, -1);
  const lastWeekStart = addDays(lastWeekEnd, -6);
  return {
    currentWeek: { start: currentWeekStart, end: currentWeekEnd },
    lastWeek: { start: lastWeekStart, end: lastWeekEnd },
  };
}

// The Monday-Sunday week that actually contains `today` — distinct from
// computeWeekWindows' "currentWeek", which intentionally lags behind (a
// week only becomes "current" for check-in-filing purposes once it's fully
// over, staying so all the way through the following week). That lag is
// correct for check-in filing but wrong for "what week is today in,"
// needed by daily-log summaries (Weeks tab, this-week-vs-last-week,
// member Weekly tab) — those must use this instead, or "today" silently
// has nowhere to show up for 6 of every 7 days.
export function currentCalendarWeek(today = todayInBoise()) {
  const daysSinceMonday = (dayOfWeekInBoise(today) + 6) % 7;
  const start = addDays(today, -daysSinceMonday);
  const end = addDays(start, 6);
  return { start, end };
}

// Cycle-independent "week" used for the roster trend/adherence glance —
// always the 7 days ending today vs. the 7 before that, so it stays live
// mid-cycle rather than only updating at the Sunday rollover (unlike
// computeWeekWindows, which governs check-in filing specifically).
export function rollingWeekWindows(today = todayInBoise()) {
  const recentStart = addDays(today, -6);
  const priorEnd = addDays(recentStart, -1);
  const priorStart = addDays(priorEnd, -6);
  return {
    recent: { start: recentStart, end: today },
    prior: { start: priorStart, end: priorEnd },
  };
}

// Forward counterpart to enumerateRecentWeeks above — the next
// `count` weeks after (not including) currentWeek, nearest first. Used by
// the per-client check-in timeline's "Upcoming" section.
export function enumerateUpcomingWeeks(currentWeek, addDays, count) {
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(currentWeek.start, 7 * (i + 1));
    const end = addDays(start, 6);
    return { start, end };
  });
}

// --- Check-in Monday <-> stored week start ----------------------------
//
// A coach thinks in "check-in Mondays": the Monday she actually picks the
// check-in up and reviews it. Everything STORED is keyed to the Monday that
// starts the week being checked in about — seven days earlier. A Mon-Sun
// week becomes current on its own Sunday (ANCHOR_DAY above), the client is
// notified and submits that Sunday, and the coach reviews it the next day.
// So: checkinMonday === week.start + 7 === week.end + 1, verified against
// every day of the cycle.
//
// These convert at UI boundaries ONLY. Nothing stored moves, and
// isPhotoRequirementWeek and friends keep working purely in week.start
// terms, so no call site of theirs has to change.
export function checkinMondayForWeek(weekStart) {
  return addDays(weekStart, 7);
}

export function weekStartForCheckinMonday(checkinMonday) {
  return addDays(checkinMonday, -7);
}

// The first Monday on or after `date`.
//
// Legacy photo-cadence anchors were typed as free text and are often not
// Mondays. Snapping them FORWARD is provably a no-op: isPhotoRequirementWeek
// computes floor((week - anchor)/7), which yields an identical sequence for
// any anchor in the 7 days ending on a given Monday. Snapping BACKWARD to
// the containing Monday would instead flip the phase and move every
// biweekly/monthly/bimonthly client's photo weeks by 7 days. Used on the
// picker's read path only — there is no data migration.
export function mondayOnOrAfter(date) {
  const dow = dayOfWeekInBoise(date); // 0=Sun
  return addDays(date, (8 - dow) % 7);
}

export function deriveCheckinStatus(response) {
  if (!response) return "pending";
  if (!response.finalized_at) return "ready";
  return "completed";
}

const METRICS = [
  "weight",
  "calories",
  "protein_g",
  "carb_g",
  "fat_g",
  "fiber_g",
  "steps",
  "sleep_hours",
  "sleep_quality",
  "hunger",
  "energy",
];

function average(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

// days/adherence/null-filtered averages for a this-week-vs-last-week table.
// Averages filter out null/undefined per metric rather than treating a
// missing value as 0, so partial logging doesn't skew the average down.
export function summarizeWeek(logs, start, end) {
  const days = logs
    .filter((log) => log.date >= start && log.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    // Calories are never a stored column (see targets.js). Deriving it once
    // here lets both the per-day cell and the week average read `calories`
    // like any other metric, instead of every consumer re-deriving it.
    .map((log) => ({ ...log, calories: loggedCalories(log) }));

  const averages = {};
  for (const metric of METRICS) {
    const values = days.map((d) => d[metric]).filter((v) => v !== null && v !== undefined);
    averages[metric] = average(values);
  }

  return { days, adherence: days.length / 7, averages };
}

// Two-sided tolerance: within +/-10% of target is "on track" (green),
// outside it is "off track" (red) — used for macros/weight/sleep, where
// both overshoot and undershoot matter.
export function colorForTarget(actual, target, tolerance = 0.1) {
  if (actual === null || actual === undefined || !target) return null;
  const diff = Math.abs(actual - target) / target;
  return diff <= tolerance ? "green" : "red";
}

// One-sided: meeting or exceeding the goal is always green, any shortfall is
// red — steps are "more is fine", not "hit exactly", unlike macros.
export function colorForStepsTarget(actual, target) {
  if (actual === null || actual === undefined || !target) return null;
  return actual >= target ? "green" : "red";
}

// Computes the last `count` Monday-Sunday weeks (most recent first) —
// shared enumeration so the member and coach screens can't drift apart.
export function enumerateRecentWeeks(currentWeek, addDays, count) {
  return Array.from({ length: count }, (_, i) => {
    const end = addDays(currentWeek.end, -7 * i);
    const start = addDays(end, -6);
    return { start, end };
  });
}
