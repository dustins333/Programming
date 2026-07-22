import { listAssignments, listMembers } from "./clients";
import { listGroupPrograms } from "./blocks";
import { getSpcRoster, checkAndAutoDraft } from "./spcDashboard";
import { getNutritionRoster } from "../nutrition/dashboard";

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

  const activeNutritionRoster = nutritionRoster.filter((c) => c.status !== "paused");
  const spcEnrolledIds = new Set(spcRoster.map((c) => c.userId));
  const nutritionEnrolledIds = new Set(nutritionRoster.map((c) => c.userId));
  const groupAssignedIds = new Set(assignments.filter((a) => a.group_program_id).map((a) => a.user_id));

  const unassignedCount = members.filter(
    (m) => !groupAssignedIds.has(m.id) && !spcEnrolledIds.has(m.id) && !nutritionEnrolledIds.has(m.id)
  ).length;

  return {
    totalMembers: members.length,
    flagshipCount,
    bwaCount,
    spcCount: spcRoster.length,
    spcDueSoon: spcRoster.filter((c) => c.dueSoon).length,
    spcOverdue: spcRoster.filter((c) => c.overdue).length,
    nutritionCount: activeNutritionRoster.length,
    nutritionAtRisk: activeNutritionRoster.filter((c) => c.needsAttention).length,
    checkinsToReview: activeNutritionRoster.filter((c) => c.checkinStatus === "ready").length,
    unassignedCount,
  };
}
