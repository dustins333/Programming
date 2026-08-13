// Settings behind scan-payroll-deadline-reminders (see that Edge Function
// for the full behavior). Two reminders per pay period, both anchored to
// the period's own boundary rather than to a weekday — the weekday-only
// version fired mid-period too, a week before anything was due, which is
// the bug 0058 fixed.
//
// The function is the source of truth for these defaults; they're repeated
// here so the admin screen shows the same values the scan would actually
// use when a settings row doesn't exist yet. Keep the two in sync.
import { getSetting, updateSetting } from "../settings";
import { todayInBoise, addDays } from "../boiseDate";
import { formatDateMDY } from "../formatDate";
import { computePeriodStart, computePeriodEnd, getPeriodAnchor } from "./periods";

export const DEADLINE_DEFAULTS = {
  enabled: true,
  deadlineTime: "20:00",
  followupTime: "12:00",
};

export async function getDeadlineReminderSettings() {
  const [enabled, deadlineTime, followupTime, anchor] = await Promise.all([
    getSetting("notify_payroll_deadline_reminders", DEADLINE_DEFAULTS.enabled),
    getSetting("payroll_deadline_time", DEADLINE_DEFAULTS.deadlineTime),
    getSetting("payroll_deadline_followup_time", DEADLINE_DEFAULTS.followupTime),
    getPeriodAnchor(),
  ]);
  return { enabled, deadlineTime, followupTime, anchor };
}

export async function saveDeadlineReminderSettings({ deadlineTime, followupTime }) {
  await Promise.all([
    updateSetting("payroll_deadline_time", deadlineTime),
    updateSetting("payroll_deadline_followup_time", followupTime),
  ]);
}

// Separate from saveDeadlineReminderSettings so the toggle can commit
// immediately on flip (same as every other notification switch in this app)
// while the two time pickers batch behind one Save button.
export async function setDeadlineRemindersEnabled(enabled) {
  await updateSetting("notify_payroll_deadline_reminders", enabled);
}

// "20:00" -> "8:00 PM". Bare formatter, no timezone conversion — these
// strings are already Boise-local, which is exactly what the Edge Function
// compares against.
export function formatTimeLabel(value) {
  const [h, m] = String(value || "").split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour)) return value;
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${period}`;
}

// Hour granularity only, deliberately. The cron job polls on the hour, so
// offering :15/:30/:45 would be a false promise — a 20:15 setting would
// really fire at 21:00. Same honesty reasoning as settings.js's own
// quarter-hour TIME_OPTIONS, which match a 15-minute poll.
export function buildHourOptions() {
  return Array.from({ length: 24 }, (_, h) => ({
    value: `${String(h).padStart(2, "0")}:00`,
    label: formatTimeLabel(`${String(h).padStart(2, "0")}:00`),
  }));
}

// What the admin screen shows under the pickers: the real dates the next
// reminders land on, so the schedule is visible while it's being set rather
// than having to be derived from "the pay period" in your head. Mirrors the
// Edge Function's own window logic.
//
// The two lines can describe different periods on exactly one day of the
// cycle: the first day of a new period is also the follow-up day for the
// period that just ended, so a follow-up is still due that day even though
// the next deadline is a fortnight out. Returned sorted by date so that
// reads correctly rather than looking like the follow-up precedes the
// reminder it follows.
export function describeNextReminders({ anchor, deadlineTime, followupTime, today = todayInBoise() }) {
  const periodStart = computePeriodStart(today, anchor);
  const periodEnd = computePeriodEnd(periodStart);

  // today always falls inside [periodStart, periodEnd], so this period's
  // own final reminder is always still ahead.
  const items = [{ kind: "final", date: periodEnd, time: deadlineTime }];

  // Day one of a period == day after the previous period ended, so that
  // period's follow-up hasn't happened yet.
  const followupDate = today === periodStart ? today : addDays(periodEnd, 1);
  items.push({ kind: "followup", date: followupDate, time: followupTime });

  return items
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((i) => ({
      ...i,
      label: `${i.kind === "final" ? "Deadline" : "Follow-up"} — ${formatDateMDY(i.date)} at ${formatTimeLabel(i.time)}`,
    }));
}
