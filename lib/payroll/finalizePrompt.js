// "You haven't submitted your payroll yet" — the on-screen half of the
// deadline reminder push (supabase/functions/scan-payroll-deadline-
// reminders). The push fires twice and then it's gone; this stays up until
// the coach actually finalizes, which is the point. Rendered on the Log tab
// and on the coach dashboard.
//
// WHEN IT SHOWS, and how it relates to the push's own two windows:
//
//   * The previous period, from the moment it ends until it's finalized or
//     an admin closes it. Same target as the push's follow-up window, but
//     persistent rather than a single noon ping.
//   * The current period on its LAST day. The push waits until
//     payroll_deadline_time (20:00) that evening; the banner is up all day
//     instead. Deliberate: reading the setting and comparing Boise clock
//     time in two more places buys nothing here, and "payroll is due today"
//     is more useful in the morning than at 8pm.
//
// The previous period wins when both apply — it's the older debt.
//
// Gated on there actually being something to finalize, matching
// report.js's own `hasSomethingToFinalize`. Without that the banner would
// send a coach with an empty period to a disabled "Nothing to finalize
// yet" button, which teaches them to ignore it.
import { todayInBoise, addDays } from "../boiseDate";
import { getCurrentPeriodStart, computePeriodEnd, listPayPeriods } from "./periods";
import { listOwnFinalizations, isLocked } from "./finalizations";
import { listEntriesForPeriod } from "./entries";
import { listNutritionBillingForPeriod } from "./nutritionAssignments";

const PERIOD_LENGTH_DAYS = 14;

// Pure, so the rule can be exercised without a database.
export function pickDuePeriod({ periods, finalizations, currentPeriodStart, today }) {
  const rowFor = (start) => (periods || []).find((p) => p.start_date === start) ?? null;
  const owedOn = (start) => {
    if (rowFor(start)?.closed) return false;
    const own = (finalizations || []).find((f) => f.pay_period_start === start);
    return !isLocked(own);
  };

  const previousStart = addDays(currentPeriodStart, -PERIOD_LENGTH_DAYS);
  if (owedOn(previousStart)) {
    return { periodStart: previousStart, periodEnd: computePeriodEnd(previousStart), overdue: true };
  }

  const currentEnd = computePeriodEnd(currentPeriodStart);
  if (today === currentEnd && owedOn(currentPeriodStart)) {
    return { periodStart: currentPeriodStart, periodEnd: currentEnd, overdue: false };
  }

  return null;
}

// Returns null whenever there is nothing to nag about — no due period, or a
// due period this coach has no pay in. Callers render nothing on null.
export async function getFinalizePrompt(profile, today = todayInBoise()) {
  if (!profile?.id) return null;

  const [currentPeriodStart, periods, finalizations] = await Promise.all([
    getCurrentPeriodStart(today),
    listPayPeriods(),
    listOwnFinalizations(profile.id),
  ]);

  const due = pickDuePeriod({ periods, finalizations, currentPeriodStart, today });
  if (!due) return null;

  // Email too, for the same reason useOwnReport passes it: a coach's
  // pre-cutover rows carry only staff_email.
  const entries = await listEntriesForPeriod(profile.id, due.periodStart, profile.email);
  if (entries.length > 0) return { ...due, entryCount: entries.length };

  // A nutrition coach whose only pay this period is 1:1 billing has no
  // pay_entries rows yet — the finalize step is what writes them — so
  // gating on entries alone would hide the banner from exactly the person
  // who still owes a submission. Isolated: a nutrition roster failure must
  // not decide whether payroll gets submitted.
  const isNutritionCoach = profile.role === "admin" || Boolean(profile.can_view_nutrition);
  if (!isNutritionCoach) return null;
  try {
    const rows = await listNutritionBillingForPeriod({
      coachId: profile.id,
      periodStart: due.periodStart,
      periodEnd: due.periodEnd,
      entries,
    });
    if (rows.length > 0) return { ...due, entryCount: 0 };
  } catch {
    return null;
  }
  return null;
}
