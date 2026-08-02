import { listAssignments, listMembers } from "./clients";
import { listGroupPrograms, listBlocksForProgram, listWorkoutsForBlock, addDays } from "./blocks";
import { currentWeekNumber } from "./schedule";
import { todayInBoise } from "../boiseDate";
import { getSpcRoster, checkAndAutoDraft } from "./spcDashboard";
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

  const activeNutritionRoster = nutritionRoster.filter((c) => c.status !== "paused");
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
