import { programming } from "../supabase/client";
import { listAssignments } from "./clients";
import { listGroupPrograms, listBlocksForProgram, listWorkoutsForBlock } from "./blocks";
import { currentWeekNumber, DEFAULT_SESSION_DAYS } from "./schedule";
import { todayInBoise, dayOfWeekInBoise } from "../boiseDate";

// A session is "due" once its last scheduled weekday has passed (or is
// today) — e.g. a Fri/Sat session ([5,6]) isn't due until Friday. This is
// necessarily approximate near a block's start (weeks are block-relative,
// not calendar-Sunday-aligned — same rolling-week quirk every other
// "this week" view in this app already has), which is fine for a coach
// heads-up flag, not a strict SLA.
function isSessionDue(sessionDays, todayWeekday) {
  if (!sessionDays || sessionDays.length === 0) return true;
  return Math.max(...sessionDays) <= todayWeekday;
}

// Which (user, group_workout) pairs already have a completion, across every
// client at once — batches the roster-wide flag scan into one query instead
// of one per client, same reasoning as every other "100+ clients" batch
// getter in this codebase (listWorkoutExercisesForWorkouts etc.).
async function listCompletionsForWorkoutsAllUsers(groupWorkoutIds) {
  if (!groupWorkoutIds.length) return new Set();
  const { data, error } = await programming
    .from("session_completions")
    .select("user_id, group_workout_id")
    .in("group_workout_id", groupWorkoutIds);
  if (error) throw error;
  return new Set(data.map((r) => `${r.user_id}:${r.group_workout_id}`));
}

// Roster-wide "missed session" flags: for every group program with an
// active block, finds this week's published sessions that are already due
// and checks which enrolled clients have no log for them — capped to each
// client's own sessions_per_week, since a 1x/week member was never expected
// to attend session 2 or 3. Returns a Map<userId, flag[]> so both the
// Clients list (just needs a count) and Client detail (needs the
// descriptive text) can read off the same computed pass.
export async function getMissedSessionFlagsByUser() {
  const [programs, assignments] = await Promise.all([listGroupPrograms(), listAssignments()]);
  const today = todayInBoise();
  const todayWeekday = dayOfWeekInBoise(today);

  const dueWorkoutsByProgramId = {};
  const allDueWorkoutIds = [];

  await Promise.all(
    programs.map(async (program) => {
      const blocks = await listBlocksForProgram(program.id);
      const currentBlock = blocks.find((b) => b.block_start_date <= today && today <= b.block_end_date);
      if (!currentBlock) return;

      const weekNum = currentWeekNumber(currentBlock.block_start_date, program.block_length_weeks, today);
      const workouts = await listWorkoutsForBlock(currentBlock.id);
      const sessionDays = program.session_days ?? DEFAULT_SESSION_DAYS;

      const due = workouts.filter(
        (w) =>
          w.week_number === weekNum &&
          w.status === "published" &&
          isSessionDue(sessionDays[w.session_number - 1], todayWeekday)
      );
      if (due.length > 0) {
        dueWorkoutsByProgramId[program.id] = { program, workouts: due };
        allDueWorkoutIds.push(...due.map((w) => w.id));
      }
    })
  );

  const completions = await listCompletionsForWorkoutsAllUsers(allDueWorkoutIds);

  const flagsByUser = new Map();
  for (const assignment of assignments) {
    const entry = dueWorkoutsByProgramId[assignment.group_program_id];
    if (!entry) continue;
    const cap = assignment.sessions_per_week ?? entry.program.sessions_per_week;
    for (const workout of entry.workouts) {
      if (workout.session_number > cap) continue;
      if (completions.has(`${assignment.user_id}:${workout.id}`)) continue;
      const flags = flagsByUser.get(assignment.user_id) ?? [];
      flags.push({ programId: entry.program.id, programName: entry.program.name, sessionNumber: workout.session_number });
      flagsByUser.set(assignment.user_id, flags);
    }
  }
  return flagsByUser;
}
