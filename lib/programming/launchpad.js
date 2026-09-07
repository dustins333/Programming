import { todayInBoise } from "../boiseDate";
import { getGymToday } from "./gymToday";
import { listMyStagedSessions } from "./hubStaging";
import { matchesCoachFilter, COACH_FILTER_MINE } from "./spcRoster";
import { getCurrentPeriodStart, computePeriodEnd, listStaff } from "../payroll/periods";
import { listFinalizationsForPeriod, getOwnFinalization, isLocked } from "../payroll/finalizations";
import { listEntriesForPeriod } from "../payroll/entries";
import { getFinalizePrompt } from "../payroll/finalizePrompt";

// The extra reads behind the coach dashboard, on top of getCoachDashboardStats.
//
// This used to also build the desktop Resume hero and four launch cards
// (design_handoff_coach_web_v2). Both are gone as of
// design_handoff_coach_dashboard: the hero guessed at intent and was usually
// wrong, and the cards were a menu duplicating the sidebar. Dropping them
// took getResumeTarget's whole query fan-out off every dashboard load —
// lib/programming/resume.js went with it, which is why nothing reads
// group_workouts.last_edited_by (migration 0052) any more.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Tones map to the app's existing semantic colours rather than new ones:
// urgent = the same clay-red as StatusBadge's urgent, warn = the amber
// used for "needs action", ok = the olive that means done everywhere else.
export const CARD_TONES = { urgent: "#b23a22", warn: "#8a5a2e", ok: "#4d6142" };

// "Closes Sunday" on the dashboard's payroll row. A pay period's end date is
// a plain YYYY-MM-DD, so it's parsed at local midnight rather than through
// Date's UTC path, which would name the wrong day west of Greenwich.
export function weekdayOf(dateString) {
  return WEEKDAYS[new Date(`${dateString}T00:00:00`).getDay()];
}

function canSeeSpc(profile) {
  if (!profile) return false;
  return profile.role === "admin" || Boolean(profile.can_view_spc);
}

export async function getLaunchpadExtras(profile) {
  const today = todayInBoise();
  const settle = async (fn, fallback) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  // Every branch is isolated: a coach whose payroll query fails still gets
  // the gym band and every module section, the same "one domain's failure
  // shouldn't hide another" rule the rest of this app's dashboards follow.
  const [gym, stagedCount, payroll, finalizePrompt] = await Promise.all([
    settle(() => getGymToday(today), { sessions: null, sessionsWeek: null, membersWeek: null, membersNotSeen: null, week: null, nutrition: null, prs: null, unread: null, quiet: null }),
    // How many boards this coach has queued up for later, so the SPC action
    // row can say "2 staged for later" instead of a generic invitation.
    // Scoped to her own, same as the live screen's Stage tab — a coach's
    // staged groups are hers.
    settle(async () => (canSeeSpc(profile) ? (await listMyStagedSessions(profile?.id, today)).length : 0), null),
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

  return { gym, stagedCount, payroll, finalizePrompt, today };
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
