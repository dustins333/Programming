import { todayInBoise } from "../boiseDate";
import { listActiveBlockReadiness } from "./blockReadiness";
import { getResumeTarget } from "./resume";
import { getGymToday } from "./gymToday";
import { listCoaches } from "./clients";
import { getCurrentPeriodStart, computePeriodEnd, listStaff } from "../payroll/periods";
import { listFinalizationsForPeriod, getOwnFinalization, isLocked } from "../payroll/finalizations";
import { listEntriesForPeriod } from "../payroll/entries";

// The coach-web launchpad's model (design_handoff_coach_web_v2, 1a/2a/2b).
//
// The four launch cards are generated from permissions rather than being a
// fixed grid — a nutrition coach gets two real cards instead of four with
// two dead ones, which was the "tiles dropped in to fill things out"
// complaint the whole redesign came out of.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Tones map to the app's existing semantic colours rather than new ones:
// urgent = the same clay-red as StatusBadge's urgent, warn = the amber
// used for "needs action", ok = the olive that means done everywhere else.
export const CARD_TONES = { urgent: "#b23a22", warn: "#8a5a2e", ok: "#4d6142" };

function weekdayOf(dateString) {
  return WEEKDAYS[new Date(`${dateString}T00:00:00`).getDay()];
}

// Does this person have a job in programming?
//
// There is deliberately no `can_view_programs` flag — the handoff is
// explicit that seeing the grid isn't the same as having a job in it, and
// Group Programs stays in everyone's sidebar. So the programming cards key
// off the programming-side permissions that DO exist: a coach who can
// neither manage SPC nor manage the exercise library is not the person
// building sessions, and showing them "3 sessions unbuilt" is noise about
// someone else's work. Admin always programs.
//
// This is the one inference in this file rather than a stored fact — if it
// reads wrong for a real coach, this is the line to change.
function programsSessions(profile) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return Boolean(profile.can_view_spc || profile.can_view_exercise_library);
}

export async function getLaunchpadExtras(profile, stats) {
  const today = todayInBoise();
  const settle = async (fn, fallback) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  // Every branch is isolated: a coach whose payroll query fails should
  // still get their resume card and their programming cards, the same
  // "one domain's failure shouldn't hide another" rule the rest of this
  // app's dashboards follow.
  const [blocks, resume, gym, coaches, payroll] = await Promise.all([
    settle(() => listActiveBlockReadiness(today), []),
    settle(
      () =>
        getResumeTarget(profile?.id, {
          nutritionQueue: (stats?.nutritionReadyForCheckin ?? []).map((c) => ({ ...c, daysWaiting: null })),
        }),
      null
    ),
    settle(() => getGymToday(today), { sessions: null, nutrition: null, prs: null, unread: null, quiet: null }),
    settle(() => listCoaches(), []),
    settle(async () => {
      const periodStart = await getCurrentPeriodStart(today);
      const periodEnd = computePeriodEnd(periodStart);
      const [staff, finalizations, own, ownEntries] = await Promise.all([
        listStaff(),
        listFinalizationsForPeriod(periodStart),
        profile?.id ? getOwnFinalization(profile.id, periodStart) : null,
        // Email passed too, so this count matches the coach's own Pay Stubs
        // tab — see listEntriesForPeriod on why user_id alone misses their
        // pre-cutover rows.
        profile?.id ? listEntriesForPeriod(profile.id, periodStart, profile.email) : [],
      ]);
      return {
        periodStart,
        periodEnd,
        staffCount: staff.length,
        // isLocked, not a bare reopened_at check — a coach who was sent
        // back and then re-finalized is in again, and reopened_at is still
        // set on their row.
        submittedCount: finalizations.filter(isLocked).length,
        ownFinalized: isLocked(own),
        ownEntryCount: ownEntries.length,
      };
    }, null),
  ]);

  return { blocks, resume, gym, coachCount: coaches.length, payroll, today };
}

function programCard(blocks) {
  const withBlocks = blocks.filter((b) => b.readiness);
  if (!withBlocks.length) return null;
  const unbuilt = withBlocks.reduce((sum, b) => sum + b.readiness.unbuilt.length, 0);
  const empty = withBlocks.reduce((sum, b) => sum + b.readiness.empty, 0);
  return {
    key: "program",
    priority: 2,
    order: 1,
    eyebrow: "PROGRAM",
    title: "Build a session",
    tone: empty > 0 ? "urgent" : unbuilt > 0 ? "warn" : "ok",
    status:
      unbuilt === 0
        ? "Every session is published"
        : `${unbuilt} session${unbuilt === 1 ? "" : "s"} unbuilt`,
    action: "Open the grid →",
    route: "/(coach)/blocks",
  };
}

function shipCard(blocks) {
  // The block closest to ending is the one worth naming — that's the one
  // whose members run out of programming first.
  const ending = blocks
    .filter((b) => b.block && b.readiness)
    .sort((a, b) => a.daysUntilEnd - b.daysUntilEnd)[0];
  if (!ending) return null;
  const { readiness, daysUntilEnd, program } = ending;
  return {
    key: "ship",
    priority: 3,
    order: 2,
    eyebrow: "SHIP",
    title: "Finalize a block",
    tone: daysUntilEnd <= 3 ? "urgent" : daysUntilEnd <= 7 ? "warn" : "ok",
    status: `${program.name} ends in ${daysUntilEnd} day${daysUntilEnd === 1 ? "" : "s"}`,
    action: `${readiness.published} of ${readiness.total} published →`,
    route: `/(coach)/blocks?program=${program.id}`,
  };
}

function reviewCard(stats) {
  const waiting = stats?.checkinsToReview ?? 0;
  return {
    key: "review",
    priority: 5,
    order: 3,
    eyebrow: "REVIEW",
    title: "Check-ins",
    tone: waiting > 0 ? "warn" : "ok",
    status: waiting === 0 ? "Nothing waiting" : `${waiting} waiting on review`,
    action: "Open the queue →",
    route: "/(coach)/nutrition",
  };
}

function payCard(profile, payroll) {
  const isAdmin = profile?.role === "admin";
  if (!payroll) {
    return {
      key: "pay",
      priority: 1,
      order: 4,
      eyebrow: "PAY",
      title: isAdmin ? "Approve payroll" : "Log my hours",
      tone: "ok",
      status: "This pay period",
      action: isAdmin ? "Review the period →" : "Add this week →",
      route: isAdmin ? "/(coach)/payroll/admin/periods" : "/(coach)/payroll/entries",
    };
  }

  const closesOn = weekdayOf(payroll.periodEnd);
  if (isAdmin) {
    const outstanding = payroll.staffCount - payroll.submittedCount;
    return {
      key: "pay",
      priority: 1,
      order: 4,
      eyebrow: "PAY",
      title: "Approve payroll",
      tone: outstanding > 0 ? "urgent" : "ok",
      status: `Closes ${closesOn} · ${payroll.submittedCount} of ${payroll.staffCount} in`,
      action: "Review the period →",
      route: "/(coach)/payroll/admin/periods",
    };
  }

  return {
    key: "pay",
    priority: 1,
    order: 4,
    eyebrow: "PAY",
    title: "Log my hours",
    tone: payroll.ownFinalized ? "ok" : "warn",
    status: payroll.ownFinalized
      ? `${payroll.ownEntryCount} entr${payroll.ownEntryCount === 1 ? "y" : "ies"} in · submitted`
      : `${payroll.ownEntryCount} entr${payroll.ownEntryCount === 1 ? "y" : "ies"} in · due ${closesOn}`,
    action: payroll.ownFinalized ? "Review the period →" : "Add this week →",
    route: "/(coach)/payroll/entries",
  };
}

function runTheGymCard(coachCount) {
  return {
    key: "gym",
    priority: 4,
    order: 5,
    eyebrow: "RUN THE GYM",
    title: "Staff & settings",
    tone: "ok",
    status: `${coachCount} coach${coachCount === 1 ? "" : "es"} on the team`,
    action: "Permissions →",
    route: "/(coach)/settings",
  };
}

function spcCard(stats) {
  const needing = stats?.spcNeedsNewProgram?.length ?? 0;
  return {
    key: "spc",
    priority: 4,
    order: 5,
    eyebrow: "YOUR MODULE",
    title: "SPC coverage",
    tone: needing > 0 ? "urgent" : "ok",
    status:
      needing === 0
        ? `${stats?.spcCount ?? 0} client${(stats?.spcCount ?? 0) === 1 ? "" : "s"} covered`
        : `${needing} need${needing === 1 ? "s" : ""} a new program`,
    action: `See all ${stats?.spcCount ?? 0} →`,
    route: "/(coach)/spc",
  };
}

// Up to four cards. Everything is scored twice: `priority` decides what
// survives the cap (Pay always does — it's the one thing that's genuinely
// theirs), `order` decides how the survivors read left to right.
export function buildLaunchCards({ profile, stats, extras }) {
  const isAdmin = profile?.role === "admin";
  const canNutrition = isAdmin || Boolean(profile?.can_view_nutrition);
  const canSpc = isAdmin || Boolean(profile?.can_view_spc);

  const candidates = [
    programsSessions(profile) && programCard(extras.blocks ?? []),
    programsSessions(profile) && shipCard(extras.blocks ?? []),
    canNutrition && reviewCard(stats),
    payCard(profile, extras.payroll),
    isAdmin ? runTheGymCard(extras.coachCount ?? 0) : canSpc && spcCard(stats),
  ].filter(Boolean);

  return candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4)
    .sort((a, b) => a.order - b.order);
}


// "Sorted by what breaks first" — the Needs You list's own promise. The
// attention items already carry a route and a signature; this adds the
// severity ordering and the short verb the design puts on each row's
// button, both derived from the item's key rather than stored.
const ACTION_VERBS = [
  [/^group-unpub-/, "Open grid", 0],
  [/^group-gap-/, "Open grid", 1],
  [/^spc-new-program-/, "Build it", 2],
  [/^checkin-/, "Review", 3],
  [/^missed-sessions$/, "See who", 4],
  [/^nutrition-risk-/, "Message", 5],
  [/^unassigned$/, "Assign", 6],
];

export function decorateAttentionItems(items) {
  return items
    .map((item) => {
      const match = ACTION_VERBS.find(([pattern]) => pattern.test(item.key));
      return {
        ...item,
        verb: match ? match[1] : "Open",
        severity: match ? match[2] : 9,
        tone: match && match[2] <= 2 ? "urgent" : "warn",
      };
    })
    .sort((a, b) => a.severity - b.severity);
}
