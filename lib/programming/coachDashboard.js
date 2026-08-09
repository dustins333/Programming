import { listAssignments, listMembers } from "./clients";
import { listGroupPrograms, listBlocksForProgram, listWorkoutsForBlock, addDays } from "./blocks";
import { currentWeekNumber } from "./schedule";
import { todayInBoise, dateInBoise } from "../boiseDate";
import { getSpcRoster, checkAndAutoDraft } from "./spcDashboard";
import { getMissedSessionFlagsByUser } from "./flags";
import { getNutritionRoster } from "../nutrition/dashboard";
import { STATUS_ORDER as SPC_STATUS_ORDER } from "./spcStatus";

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
              (w) => w.week_number === currentWeekNumber(currentBlock.block_start_date, program.block_length_weeks, today)
            )
            .some((w) => w.status !== "published")
        : false;
      const unpublishedNextWeek = nextWeekBlock
        ? workoutsByBlockId[nextWeekBlock.id]
            .filter(
              (w) =>
                w.week_number ===
                currentWeekNumber(nextWeekBlock.block_start_date, program.block_length_weeks, nextWeekDate)
            )
            .some((w) => w.status !== "published")
        : false;

      return {
        programId: program.id,
        name: program.name,
        daysUntilEnd,
        hasActiveBlock: Boolean(currentBlock),
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

  const flagshipId = programs.find((p) => p.name === "Flagship")?.id;
  const bwaId = programs.find((p) => p.name === "Better With Age")?.id;
  const flagshipCount = assignments.filter((a) => a.group_program_id === flagshipId).length;
  const bwaCount = assignments.filter((a) => a.group_program_id === bwaId).length;

  // Each isolated from the others on purpose — SPC/nutrition live behind
  // their own migrations, which might not always be present, and one
  // domain's failure shouldn't take down the whole dashboard. Same pattern
  // used throughout the Clients page and member Today screen.
  let spcRoster = [];
  try {
    await checkAndAutoDraft();
    spcRoster = await getSpcRoster();
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

  // Missed-session flags (group + SPC) finally reach the dashboard — the
  // scan already existed for the Clients list but its result never
  // surfaced here, so a coach could see "all caught up" while a third of
  // the roster had skipped sessions. Same isolation as the rosters above.
  let missedSessionClientCount = 0;
  let missedSessionFlagTotal = 0;
  try {
    const flagsByUser = await getMissedSessionFlagsByUser();
    missedSessionClientCount = flagsByUser.size;
    for (const flags of flagsByUser.values()) missedSessionFlagTotal += flags.length;
  } catch {
    // leave counts at 0
  }

  const activeNutritionRoster = nutritionRoster.filter((c) => c.status === "active");
  const spcEnrolledIds = new Set(spcRoster.map((c) => c.userId));
  const nutritionEnrolledIds = new Set(nutritionRoster.map((c) => c.userId));
  const groupAssignedIds = new Set(assignments.filter((a) => a.group_program_id).map((a) => a.user_id));

  const unassignedCount = members.filter(
    (m) => !groupAssignedIds.has(m.id) && !spcEnrolledIds.has(m.id) && !nutritionEnrolledIds.has(m.id)
  ).length;

  const spcByStatus = Object.fromEntries(
    SPC_STATUS_ORDER.map((status) => [status, spcRoster.filter((c) => c.status === status).length])
  );

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
    flagshipCount,
    flagshipProgramId: flagshipId ?? null,
    bwaCount,
    bwaProgramId: bwaId ?? null,
    spcCount: spcRoster.length,
    spcDueSoon: spcRoster.filter((c) => c.dueSoon).length,
    spcOverdue: spcRoster.filter((c) => c.overdue).length,
    spcByStatus,
    nutritionCount: activeNutritionRoster.length,
    nutritionAtRisk: activeNutritionRoster.filter((c) => c.needsAttention).length,
    checkinsToReview: activeNutritionRoster.filter((c) => c.checkinStatus === "ready").length,
    // Named rosters (not just counts) for the specific attention rows below
    // — {userId, name} pairs so computeAttentionItems can name who actually
    // needs the thing, and deep-link straight to their page, instead of a
    // bare count that dumps the coach on a roster to go find them.
    spcNeedsNewProgram: spcRoster.filter((c) => c.status === "new_program_asap").map((c) => ({ userId: c.userId, name: c.name })),
    nutritionReadyForCheckin: activeNutritionRoster
      .filter((c) => c.checkinStatus === "ready")
      .map((c) => ({ userId: c.userId, name: c.name })),
    nutritionAtRiskClients: activeNutritionRoster
      .filter((c) => c.needsAttention)
      .map((c) => ({ userId: c.userId, name: c.name, missedDays: c.missedDays })),
    nutritionBreakdown: {
      active: activeNutritionRoster.length,
      notSetUp: nutritionNotSetUp,
      pendingCheckin: nutritionPendingCheckin,
      readyForCheckin: nutritionReadyForCheckin,
      checkinCompleted: nutritionCheckinCompleted,
    },
    groupDashboard,
    unassignedCount,
    missedSessionClientCount,
    missedSessionFlagTotal,
  };
}

// A rollup of the Nutrition/SPC/Group tiles' own warning states, shared by
// both dashboards so native and web can't drift out of sync on what counts
// as "needs attention" (this used to be web-only, computed inline in
// index.web.js). Returns plain route strings rather than onPress closures
// so each platform can build navigation with its own router.
export function computeAttentionItems(stats) {
  // Named, one row per person — same shape as the group-program rows below
  // (one per program, not "N programs need attention"). SPC's due-soon/
  // overdue counts are deliberately not surfaced separately here:
  // checkAndAutoDraft() (run just before these stats are computed) already
  // converts them into "New Program ASAP" status, which spcNeedsNewProgram
  // already reflects.
  return [
    ...stats.spcNeedsNewProgram.map((c) => ({
      key: `spc-new-program-${c.userId}`,
      signature: "new_program_asap",
      title: `${c.name} needs a new SPC program`,
      subtitle: "Blank draft auto-created — ready to fill in",
      route: `/(coach)/spc/${c.userId}`,
    })),
    ...stats.nutritionReadyForCheckin.map((c) => ({
      key: `checkin-${c.userId}`,
      signature: "ready",
      title: `${c.name}'s check-in is ready to review`,
      subtitle: "Submitted this week, awaiting your notes",
      route: `/(coach)/nutrition/clients/${c.userId}`,
    })),
    ...stats.nutritionAtRiskClients.map((c) => ({
      key: `nutrition-risk-${c.userId}`,
      signature: String(c.missedDays),
      title: `${c.name} missed ${c.missedDays} logging day${c.missedDays === 1 ? "" : "s"} this week`,
      subtitle: "Nutrition — worth a check-in",
      route: `/(coach)/nutrition/clients/${c.userId}`,
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
      .filter((p) => p.hasActiveBlock && p.daysUntilEnd <= 7 && !p.hasNextWeekBlock)
      .map((p) => ({
        key: `group-gap-${p.programId}`,
        signature: String(p.daysUntilEnd),
        title: `${p.name}: block ends in ${p.daysUntilEnd} day${p.daysUntilEnd === 1 ? "" : "s"}`,
        subtitle: "Nothing queued to start after it",
        route: `/(coach)/blocks?program=${p.programId}`,
      })),
    // One aggregated row, not one per client — at a 210-client roster a
    // per-person listing would drown every other attention item. The
    // signature is the total flag count so a *new* miss resurrects a
    // dismissed row.
    stats.missedSessionClientCount > 0 && {
      key: "missed-sessions",
      signature: String(stats.missedSessionFlagTotal),
      title: `${stats.missedSessionClientCount} client${stats.missedSessionClientCount === 1 ? "" : "s"} missed a session`,
      subtitle: "Group this week, SPC last week — tap for the list",
      route: "/(coach)/clients?filter=flagged",
    },
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
