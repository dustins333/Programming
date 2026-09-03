import { todayInBoise } from "../boiseDate";
import { listActiveBlockReadiness } from "./blockReadiness";
import { getResumeTarget } from "./resume";
import { getGymToday } from "./gymToday";
import { listCoaches } from "./clients";
import { matchesCoachFilter, COACH_FILTER_MINE } from "./spcRoster";
import { getCurrentPeriodStart, computePeriodEnd, listStaff } from "../payroll/periods";
import { listFinalizationsForPeriod, getOwnFinalization, isLocked } from "../payroll/finalizations";
import { listEntriesForPeriod } from "../payroll/entries";
import { getFinalizePrompt } from "../payroll/finalizePrompt";

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
// off the programming-side permissions that DO exist: a coach who neither
// builds SPC nor reviews the exercise library is not the person building
// sessions, and showing them "3 sessions unbuilt" is noise about someone
// else's work. Admin always programs.
//
// can_view_exercise_library changed meaning in 0094 (it used to gate the
// library outright; it now marks a reviewer) and this still holds — a
// reviewer is by definition somebody deep enough in the programming to be
// trusted curating it.
//
// This is the one inference in this file rather than a stored fact — if it
// reads wrong for a real coach, this is the line to change.
function programsSessions(profile) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return Boolean(profile.can_view_spc || profile.can_view_exercise_library);
}

function canSeeNutrition(profile) {
  if (!profile) return false;
  return profile.role === "admin" || Boolean(profile.can_view_nutrition);
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
  const [blocks, resume, gym, coaches, payroll, finalizePrompt] = await Promise.all([
    settle(() => listActiveBlockReadiness(today), []),
    settle(
      () =>
        getResumeTarget(profile?.id, {
          // The check-in queue is only a "where was I" for a coach who can
          // actually see nutrition. getCoachDashboardStats returns it for
          // everyone (the roster tile is permission-agnostic), so without
          // this gate a fitness-only coach's resume card pointed at a
          // nutrition client's check-in — a page they don't have.
          nutritionQueue: canSeeNutrition(profile)
            ? (stats?.nutritionReadyForCheckin ?? []).map((c) => ({ ...c, daysWaiting: null }))
            : [],
        }),
      null
    ),
    settle(() => getGymToday(today), { sessions: null, sessionsWeek: null, membersWeek: null, nutrition: null, prs: null, unread: null, quiet: null }),
    settle(() => listCoaches(), []),
    settle(async () => {
      const periodStart = await getCurrentPeriodStart(today);
      const periodEnd = computePeriodEnd(periodStart);
      // Who's-submitted is admin-only, and it's gated HERE rather than just
      // hidden in the UI. A coach has no business holding the rest of the
      // team's payroll state in memory, and listFinalizationsForPeriod is
      // admin-only per RLS anyway — for a coach it returns an empty set,
      // which would have rendered as "nobody has submitted" rather than as
      // "you can't see this". Not fetching it at all is both safer and
      // truer.
      const isAdmin = profile?.role === "admin";
      const [staff, finalizations, own, ownEntries] = await Promise.all([
        isAdmin ? listStaff() : Promise.resolve([]),
        isAdmin ? listFinalizationsForPeriod(periodStart) : Promise.resolve([]),
        profile?.id ? getOwnFinalization(profile.id, periodStart) : null,
        // Email passed too, so this count matches the coach's own Pay Stubs
        // tab — see listEntriesForPeriod on why user_id alone misses their
        // pre-cutover rows.
        profile?.id ? listEntriesForPeriod(profile.id, periodStart, profile.email) : [],
      ]);
      // isLocked, not a bare reopened_at check — a coach who was sent
      // back and then re-finalized is in again, and reopened_at is still
      // set on their row.
      const lockedByUser = new Set(finalizations.filter(isLocked).map((f) => f.user_id));
      return {
        periodStart,
        periodEnd,
        staffCount: staff.length,
        submittedCount: lockedByUser.size,
        // Named, so the dashboard's payroll popup can say WHO is still out
        // rather than just how many. null (not []) for a non-admin, so a
        // caller can tell "not allowed to see this" apart from "nobody on
        // staff", which an empty array would blur.
        staffStatus: isAdmin
          ? staff.map((s) => ({ id: s.id, name: s.name ?? s.email, submitted: lockedByUser.has(s.id) }))
          : null,
        ownFinalized: isLocked(own),
        ownEntryCount: ownEntries.length,
      };
    }, null),
    // Deliberately its own lookup rather than derived from the block above:
    // that one is about the CURRENT period (what's accruing), and the nag
    // is almost always about the previous one (what's owed). Re-fetching a
    // couple of small indexed reads keeps the "when do we nag" rule in the
    // single place both the dashboard and the Log tab read it from.
    settle(() => getFinalizePrompt(profile, today), null),
  ]);

  return { blocks, resume, gym, coachCount: coaches.length, payroll, finalizePrompt, today };
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
// checkin-*, missed-sessions and nutrition-risk-* were removed from
// computeAttentionItems (see its header — task list, not watchlist), so
// their verbs are gone too rather than left as dead patterns.
const ACTION_VERBS = [
  [/^group-unpub-/, "Open grid", 0],
  [/^group-gap-/, "Open grid", 1],
  [/^spc-new-program-/, "Build it", 2],
  [/^unassigned$/, "Assign", 3],
];

// computeAttentionItems is pure and knows nothing about who's looking, so a
// coach with SPC switched off still got "Roxy needs a new SPC program" —
// a row about someone else's job, routing to a page they can't open. The
// nav and RLS were already gated; this list never was.
//
// Only SPC rows need it today: nutrition rows are gone (watchlist), and
// group programs aren't behind a permission flag anywhere in the app.
export function filterAttentionByPermission(items, profile) {
  if (profile?.role === "admin") return items;
  const canSpc = Boolean(profile?.can_view_spc);
  return items.filter((item) => (item.key.startsWith("spc-") ? canSpc : true));
}

// Whose work is this? A coach sees a client assigned to her, plus anyone
// with no assigned coach at all — nobody owns those, so nobody would pick
// them up if they were hidden from everyone. Admin sees the lot.
//
// Applied ONCE, in useCoachDashboard, to the spcNeedsNewProgram/spcIssues
// rows on `stats` — not per surface. Everything downstream (the Needs You
// attention rows, the SPC launch card's count, the mobile SPC tile and its
// sheet) is built from those two arrays, so scoping them at the source is
// what stops the four surfaces disagreeing about how many clients are
// behind. That drift is exactly what the dashboard's own second definition
// of SPC state cost before it was aligned on deriveSpcState.
//
// Deliberately NOT applied to the group-program or unassigned-client rows:
// a group program has no coach of its own, and "N clients not enrolled in
// anything" is by definition about people nobody has picked up yet.
export function scopeSpcToCoach(rows, profile) {
  if (!rows?.length) return rows ?? [];
  if (profile?.role === "admin") return rows;
  // The SPC roster's own "Mine + unassigned" filter, reused rather than
  // reimplemented — the dashboard telling a coach three clients are behind
  // and the roster she lands on showing four is exactly the drift a second
  // copy of this rule produces.
  return rows.filter((row) => matchesCoachFilter(row, COACH_FILTER_MINE, profile?.id));
}

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
