import { listAssignments, listMembers } from "./clients";
import { listGroupPrograms, listBlocksForProgram, listWorkoutsForBlock, addDays } from "./blocks";
import { currentWeekNumber, blockLengthWeeks } from "./schedule";
import { todayInBoise, dateInBoise } from "../boiseDate";
import { getSpcRosterDetail } from "./spcRoster";
import { NEXT_STEP } from "./spcState";
import { getNutritionRoster } from "../nutrition/dashboard";

function daysBetween(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
}

// Per-program "is this week/next week actually ready" check for the
// dashboard's Group tile — lighter than blocks/index.js's full 6-week grid
// (loadProgramData), since the dashboard only ever needs the current and
// next-week rows, not a whole look-ahead calendar.
async function getGroupProgramDashboard() {
  const programs = await listGroupPrograms();
  const today = todayInBoise();
  const nextWeekDate = addDays(today, 7);

  return Promise.all(
    programs.map(async (program) => {
      const blocks = await listBlocksForProgram(program.id);
      const currentBlock = blocks.find((b) => b.block_start_date <= today && today <= b.block_end_date) ?? null;
      const nextWeekBlock =
        blocks.find((b) => b.block_start_date <= nextWeekDate && nextWeekDate <= b.block_end_date) ?? null;

      const daysUntilEnd = currentBlock ? daysBetween(today, currentBlock.block_end_date) : null;

      const workoutsByBlockId = {};
      for (const block of [currentBlock, nextWeekBlock]) {
        if (block && !workoutsByBlockId[block.id]) {
          workoutsByBlockId[block.id] = await listWorkoutsForBlock(block.id);
        }
      }

      const unpublishedThisWeek = currentBlock
        ? workoutsByBlockId[currentBlock.id]
            .filter(
              (w) => w.week_number === currentWeekNumber(currentBlock.block_start_date, blockLengthWeeks(currentBlock, program), today)
            )
            .some((w) => w.status !== "published")
        : false;
      const unpublishedNextWeek = nextWeekBlock
        ? workoutsByBlockId[nextWeekBlock.id]
            .filter(
              (w) =>
                w.week_number ===
                currentWeekNumber(nextWeekBlock.block_start_date, blockLengthWeeks(nextWeekBlock, program), nextWeekDate)
            )
            .some((w) => w.status !== "published")
        : false;

      return {
        programId: program.id,
        name: program.name,
        daysUntilEnd,
        hasActiveBlock: Boolean(currentBlock),
        // "Ongoing" in the UI — auto_extend (0049). The nightly scan grows it
        // a week at a time, so it has no successor by design.
        rolling: Boolean(currentBlock?.auto_extend),
        hasNextWeekBlock: Boolean(nextWeekBlock),
        unpublishedThisWeek,
        unpublishedNextWeek,
      };
    })
  );
}

// Single source of truth for the coach dashboard's stats, shared by the
// native Home screen (app/(coach)/index.js) and the web dashboard
// (app/(coach)/index.web.js) so neither duplicates this fetch. Every field
// is a client-side aggregation over data that already exists — no new
// tables, no new RLS.
export async function getCoachDashboardStats() {
  const [members, assignments, programs] = await Promise.all([
    listMembers(),
    listAssignments(),
    listGroupPrograms(),
  ]);

  // One entry per group program, resolved from whatever actually exists
  // rather than by hardcoded name. This used to look up exactly "Flagship"
  // and "Better With Age" by string, which (a) hid every specialty program
  // from the roster row and (b) silently zeroed the tile the moment a
  // program was renamed. Programs are coach-creatable (migration 0010), so
  // there is no fixed set to hardcode.
  const groupProgramCounts = programs
    .map((p) => ({
      id: p.id,
      name: p.name,
      count: assignments.filter((a) => a.group_program_id === p.id).length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Each isolated from the others on purpose — SPC/nutrition live behind
  // their own migrations, which might not always be present, and one
  // domain's failure shouldn't take down the whole dashboard. Same pattern
  // used throughout the Clients page and member Today screen.
  // getSpcRosterDetail, not the lighter getSpcRoster: the dashboard used to
  // roll its own SPC state here (a draft row exists / days-until-end vs a
  // lead time) and that second definition had drifted badly from
  // deriveSpcState. It fired for a client on an ONGOING program, for a
  // PAUSED client, and 26 days ahead of a program that still had a month to
  // run — 7 attention rows where 1 was real. Aligning on the roster's own
  // derived state (the follow-up CLAUDE.md flagged after the SPC rework)
  // kills that whole class rather than patching each case.
  let spcRoster = [];
  try {
    spcRoster = await getSpcRosterDetail();
  } catch {
    // leave spcRoster empty
  }

  let nutritionRoster = [];
  try {
    nutritionRoster = await getNutritionRoster();
  } catch {
    // leave nutritionRoster empty
  }

  let groupDashboard = [];
  try {
    groupDashboard = await getGroupProgramDashboard();
  } catch {
    // leave groupDashboard empty
  }

  // The missed-session flag scan used to run here purely to feed the
  // "N clients missed a session" attention row. That row is gone (it was
  // watchlist, see computeAttentionItems), and the scan is expensive — a
  // batched pass over every group program's due sessions plus every active
  // SPC client's previous week. Dropping it takes real work off every
  // dashboard load. The scan itself is untouched and still runs where it's
  // actually acted on: the Clients roster's flag column and filter chip,
  // and a client's own detail page.

  // The one thing on the SPC roster that is a task: her program is inside its
  // final week or already over with nothing queued. deriveSpcState hands that
  // back as NEXT_STEP.publish, so this is one predicate covering every case
  // the ad-hoc version got wrong — paused resolves to `resume`, an ongoing
  // program and a queued next one both resolve to `none`, and a client who
  // has never been programmed resolves to `start` (deliberately excluded,
  // same call migration 0084 made for the hub picker: they are un-programmed,
  // not behind, and there are 50-odd of them).
  const spcDue = spcRoster
    .filter((c) => c.nextStep === NEXT_STEP.publish)
    .map((c) => ({
      userId: c.userId,
      name: c.name,
      coachName: c.coachName,
      reason: c.reason,
      hasDraft: Boolean(c.draftBlock),
      severity: c.state === "dueNow" ? 0 : 1,
    }))
    .sort((a, b) => a.severity - b.severity || a.name.localeCompare(b.name));

  const activeNutritionRoster = nutritionRoster.filter((c) => c.status === "active");
  const spcEnrolledIds = new Set(spcRoster.map((c) => c.userId));
  const nutritionEnrolledIds = new Set(nutritionRoster.map((c) => c.userId));
  const groupAssignedIds = new Set(assignments.filter((a) => a.group_program_id).map((a) => a.user_id));

  const unassignedCount = members.filter(
    (m) => !groupAssignedIds.has(m.id) && !spcEnrolledIds.has(m.id) && !nutritionEnrolledIds.has(m.id)
  ).length;

  // The source Nutrition Tracker app's "Pending Setup" (account not
  // created yet) and "Onboarding" (logged in, working through objective
  // tracking/questionnaire/first progress photos) aren't things this app
  // tracks — that content is part of the deferred full port, not the
  // one-time core-loop port this module is (see CLAUDE.md). Until that
  // lands, both collapse into "not set up yet", keyed off the one signal
  // this app actually has: whether a target has been assigned. Buckets are
  // mutually exclusive and sum to `active`, same priority-order pattern as
  // lib/nutrition/dashboard.js's deriveRosterStatus.
  let nutritionNotSetUp = 0;
  let nutritionPendingCheckin = 0;
  let nutritionReadyForCheckin = 0;
  let nutritionCheckinCompleted = 0;
  for (const c of activeNutritionRoster) {
    if (!c.hasTarget) nutritionNotSetUp += 1;
    else if (c.checkinStatus === "pending") nutritionPendingCheckin += 1;
    else if (c.checkinStatus === "ready") nutritionReadyForCheckin += 1;
    else nutritionCheckinCompleted += 1;
  }

  return {
    totalMembers: members.length,
    groupProgramCounts,
    spcCount: spcRoster.length,
    nutritionCount: activeNutritionRoster.length,
    nutritionAtRisk: activeNutritionRoster.filter((c) => c.needsAttention).length,
    checkinsToReview: activeNutritionRoster.filter((c) => c.checkinStatus === "ready").length,
    // Named rosters (not just counts) for the specific attention rows below
    // — {userId, name} pairs so computeAttentionItems can name who actually
    // needs the thing, and deep-link straight to their page, instead of a
    // bare count that dumps the coach on a roster to go find them.
    //
    // Both of these are the same set now. They used to be two: one keyed on
    // "an unsent draft exists", the other on a separate days-until-end
    // reckoning, so the same client could appear twice or, worse, appear on
    // the strength of a stale draft left behind by a program that has since
    // been published.
    spcNeedsNewProgram: spcDue,
    spcIssues: spcDue,
    nutritionReadyForCheckin: activeNutritionRoster
      .filter((c) => c.checkinStatus === "ready")
      .map((c) => ({ userId: c.userId, name: c.name })),
    nutritionBreakdown: {
      active: activeNutritionRoster.length,
      notSetUp: nutritionNotSetUp,
      pendingCheckin: nutritionPendingCheckin,
      readyForCheckin: nutritionReadyForCheckin,
      checkinCompleted: nutritionCheckinCompleted,
    },
    groupDashboard,
    unassignedCount,
  };
}

// A rollup of the Nutrition/SPC/Group tiles' own warning states, shared by
// both dashboards so native and web can't drift out of sync on what counts
// as "needs attention" (this used to be web-only, computed inline in
// index.web.js). Returns plain route strings rather than onPress closures
// so each platform can build navigation with its own router.
// This list is a TASK LIST, not a watchlist. That distinction is the whole
// design and three generators were deleted to enforce it:
//
//   - checkin-*        one row per submitted-not-finalized nutrition client.
//                      Real work, but it fires for essentially the entire
//                      active nutrition roster every check-in Monday, and
//                      the Review launch card already counts it while the
//                      Nutrition module home already IS a queue built to
//                      work through them one at a time. Listing it here too
//                      was a worse copy of a better screen.
//   - nutrition-risk-* one row per client behind on logging.
//   - missed-sessions  one aggregated row of clients who missed a session.
//
// The last two are watchlist items: they scale with the roster, never empty,
// and nobody sits watching a dashboard all day for them to matter. They
// buried the tasks — which are the part that can actually be finished. Both
// still exist where you'd go LOOKING for them: the Clients roster has a
// Quiet 7+ days chip and a flag column. Pull, not push.
//
// What's left is bounded by programs and by real work, not by headcount.
export function computeAttentionItems(stats) {
  // Named, one row per person — same shape as the group-program rows below
  // (one per program, not "N programs need attention"). SPC's due-soon/
  // overdue counts are deliberately not surfaced separately here:
  // scan-spc-alerts (nightly) creates the next block as a draft, and that
  // draft is what spcNeedsNewProgram reads.
  //
  // `signature` is an opaque key for programming.dashboard_dismissals, so it
  // keeps the old name on purpose — renaming it would silently un-dismiss
  // every row a coach has already cleared.
  return [
    ...stats.spcNeedsNewProgram.map((c) => ({
      key: `spc-new-program-${c.userId}`,
      signature: "new_program_asap",
      title: `${c.name} needs a new SPC program`,
      // The derived reason, not a fixed sentence — "Ended Aug 24, nothing
      // queued" and "3 days left, nothing queued" are different jobs. A
      // started draft is context on top of that, never the trigger for it.
      subtitle: c.hasDraft ? `${c.reason} · draft already started` : c.reason,
      route: `/(coach)/spc/${c.userId}`,
    })),
    ...stats.groupDashboard
      .filter((p) => p.unpublishedThisWeek)
      .map((p) => ({
        key: `group-unpub-${p.programId}`,
        signature: "unpublished",
        title: `${p.name}: this week isn't published`,
        subtitle: "Sessions are still drafts",
        route: `/(coach)/blocks?program=${p.programId}`,
      })),
    ...stats.groupDashboard
      // A rolling block doesn't end — scan-spc-alerts adds a week to it every
      // night as it nears its end date, so "nothing queued to start after it"
      // is not a problem, it's the setting working. Without this the gym's
      // ongoing programs raised the same alarm every day, for good.
      .filter((p) => p.hasActiveBlock && !p.rolling && p.daysUntilEnd <= 7 && !p.hasNextWeekBlock)
      .map((p) => ({
        key: `group-gap-${p.programId}`,
        signature: String(p.daysUntilEnd),
        title: `${p.name}: block ends in ${p.daysUntilEnd} day${p.daysUntilEnd === 1 ? "" : "s"}`,
        subtitle: "Nothing queued to start after it",
        route: `/(coach)/blocks?program=${p.programId}`,
      })),
    stats.unassignedCount > 0 && {
      key: "unassigned",
      signature: String(stats.unassignedCount),
      title: `${stats.unassignedCount} client${stats.unassignedCount === 1 ? "" : "s"} not enrolled in anything`,
      subtitle: "Linked but not assigned to a program or nutrition",
      route: "/(coach)/clients?program=unassigned",
    },
  ].filter(Boolean);
}

// Dismiss ("x") support: an item stays hidden only while its underlying
// severity hasn't changed AND it's still the same Boise calendar day it was
// dismissed on. Either the signature moving (e.g. missed-day count going up,
// a block's days-until-end ticking down) or a new day starting brings it
// back — "bad behavior continuing" always wins over a stale dismissal.
// `dismissals` is the {key: {signature, dismissedAt}} map from
// listDismissals(); `today` is a todayInBoise() string.
export function filterDismissedItems(items, dismissals, today) {
  return items.filter((item) => {
    const dismissal = dismissals[item.key];
    if (!dismissal) return true;
    if (dismissal.signature !== item.signature) return true;
    return dateInBoise(new Date(dismissal.dismissedAt)) !== today;
  });
}
