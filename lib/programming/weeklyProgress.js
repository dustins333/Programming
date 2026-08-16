import { todayInBoise } from "../boiseDate";
import { currentWeekNumber, blockLengthWeeks } from "./schedule";
import { listMyAssignments, getCurrentBlock, listWorkoutsForWeek } from "./memberPlan";
import { listGroupCompletionsForWorkouts, listSpcCompletionDetailsForWorkouts } from "./sessionCompletions";
import { getSpcClient, isSpcActive } from "./spcClients";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "./spcBlocks";

// Per-program completed/target — the finalize plate
// (design_handoff_member_finalize_v1) counts against the ONE program a
// member just finalized a session in, not a figure blended across every
// program they hold. A dual-program member (e.g. SPC 2x/week plus a 1x/week
// group membership) finalizing an SPC session must see SPC's own 1/2, not a
// combined 1/3 padded by an unrelated group program — that combined number
// is what My Week's hero and ProgressRing intentionally show (it's
// answering "what's left for me this week, overall"), but pairing it with a
// plate whose eyebrow names one specific session reads as a bug, not a
// feature. Recomputed here via fresh queries rather than read off in-memory
// state, since My Fitness's own `groups`/`spc` state (app/(member)/plan.js)
// only tracks the single session currently in view, not a per-program
// weekly completed count the way My Week's `rows` arrays do.
export async function getGroupWeeklyProgress(userId, groupProgramId, today = todayInBoise()) {
  const assignments = await listMyAssignments(userId);
  const assignment = assignments.find((a) => a.group_programs?.id === groupProgramId);
  if (!assignment) return { completed: 0, target: 0 };
  const program = assignment.group_programs;

  const block = await getCurrentBlock(program.id, today);
  if (!block) return { completed: 0, target: 0 };
  const weekNumber = currentWeekNumber(block.block_start_date, blockLengthWeeks(block, program), today);
  const workouts = await listWorkoutsForWeek(block.id, weekNumber);
  const completedIds = await listGroupCompletionsForWorkouts(userId, workouts.map((w) => w.id));
  return {
    completed: workouts.filter((w) => completedIds.has(w.id)).length,
    target: assignment.sessions_per_week ?? program.sessions_per_week,
  };
}

export async function getSpcWeeklyProgress(userId, today = todayInBoise()) {
  const spcClient = await getSpcClient(userId);
  if (!isSpcActive(spcClient)) return { completed: 0, target: 0 };
  const block = await getCurrentSpcBlock(userId, today);
  if (!block) return { completed: 0, target: 0 };
  const weekNumber = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
  const workouts = await listSpcWorkoutsForWeek(block.id, weekNumber);
  if (workouts.length === 0) return { completed: 0, target: 0 };
  const sessionsPerWeek = spcClient.sessions_per_week;
  const relevant = workouts.slice(0, sessionsPerWeek);
  const completedDetails = await listSpcCompletionDetailsForWorkouts(userId, relevant.map((w) => w.id));
  return {
    completed: relevant.filter((w) => completedDetails.has(`${w.id}:${weekNumber}`)).length,
    target: sessionsPerWeek,
  };
}
