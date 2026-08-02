import { dayOfWeekInBoise, todayInBoise } from "../boiseDate";

// Global check-in cycle shared by every client, not a per-client rollover
// day — the source Nutrition Tracker app's original per-client cycle
// (clients.check_in_day) caused real misfiled submissions; one shared
// anchor fixed it. Sunday is the anchor (0): the current week's window
// always ends on the most recent Sunday on/before today, so a Monday-Sunday
// window becomes "current" the moment today is a Sunday.
const ANCHOR_DAY = 0;

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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

export function deriveCheckinStatus(response) {
  if (!response) return "pending";
  if (!response.finalized_at) return "ready";
  return "completed";
}

const METRICS = [
  "weight",
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
    .sort((a, b) => (a.date < b.date ? -1 : 1));

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
