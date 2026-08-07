import { programming } from "../supabase/client";
import { listAssignments } from "./clients";
import { listGroupPrograms, listBlocksForProgram, listWorkoutsForBlock } from "./blocks";
import { currentWeekNumber, DEFAULT_SESSION_DAYS } from "./schedule";
import { isSpcActive } from "./spcClients";
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

// SPC's version of listCompletionsForWorkoutsAllUsers above. Unlike a group
// workout (one row shared across every client on the program), an SPC
// workout row already belongs to exactly one client via its block — but we
// still key on the full (user, workout, week) triple rather than just
// workout id, matching session_completions' own partial-unique-index shape
// (a workout id combined with week_number is what's actually unique here,
// since SPC's per-week progression means the same workout row recurs across
// every week of its block).
async function listSpcCompletionsForWorkoutsAllUsers(spcWorkoutIds) {
  if (!spcWorkoutIds.length) return new Set();
  const { data, error } = await programming
    .from("session_completions")
    .select("user_id, spc_workout_id, week_number")
    .in("spc_workout_id", spcWorkoutIds);
  if (error) throw error;
  return new Set(data.map((r) => `${r.user_id}:${r.spc_workout_id}:${r.week_number}`));
}

// SPC has no day-of-week routing (unlike group), so "is this due" can't use
// the same live-this-week check — instead this looks at the most recently
// *completed* week (weekNum - 1), only once a client is at least in week 2
// of their block, so a session flags as missed only after its whole week
// has fully passed, never mid-week. One-off workouts (no week_number/
// spc_block_id at all) are structurally excluded — they're never part of
// this query. Merges into the same flagsByUser map the group scan builds.
async function addSpcFlags(flagsByUser) {
  const { data: spcClients, error: clientsError } = await programming.from("spc_clients").select("*");
  if (clientsError) throw clientsError;
  const activeClients = spcClients.filter(isSpcActive);
  if (activeClients.length === 0) return;

  const today = todayInBoise();
  const userIds = activeClients.map((c) => c.user_id);

  const { data: blocks, error: blocksError } = await programming
    .from("spc_blocks")
    .select("id, spc_client_id, block_start_date, block_end_date, block_length_weeks")
    .in("spc_client_id", userIds);
  if (blocksError) throw blocksError;

  // { blockId: { userId, checkWeek, cap } } for clients whose most recently
  // completed week is worth checking.
  const checkByBlockId = {};
  for (const client of activeClients) {
    const currentBlock = blocks.find(
      (b) => b.spc_client_id === client.user_id && b.block_start_date <= today && today <= b.block_end_date
    );
    if (!currentBlock) continue;
    const weekNum = currentWeekNumber(currentBlock.block_start_date, currentBlock.block_length_weeks, today);
    const checkWeek = weekNum - 1;
    if (checkWeek < 1) continue;
    checkByBlockId[currentBlock.id] = { userId: client.user_id, checkWeek, cap: client.sessions_per_week };
  }

  const blockIds = Object.keys(checkByBlockId);
  if (blockIds.length === 0) return;

  const { data: workouts, error: workoutsError } = await programming
    .from("spc_workouts")
    .select("id, spc_block_id, week_number, session_number, status")
    .in("spc_block_id", blockIds);
  if (workoutsError) throw workoutsError;

  const relevantWorkouts = workouts.filter((w) => {
    const entry = checkByBlockId[w.spc_block_id];
    return entry && w.week_number === entry.checkWeek && w.status === "published" && w.session_number <= entry.cap;
  });

  const completions = await listSpcCompletionsForWorkoutsAllUsers(relevantWorkouts.map((w) => w.id));

  for (const workout of relevantWorkouts) {
    const entry = checkByBlockId[workout.spc_block_id];
    if (completions.has(`${entry.userId}:${workout.id}:${entry.checkWeek}`)) continue;
    const flags = flagsByUser.get(entry.userId) ?? [];
    flags.push({ programId: "spc", programName: "SPC", sessionNumber: workout.session_number, period: "last week" });
    flagsByUser.set(entry.userId, flags);
  }
}

// Roster-wide "missed session" flags: for every group program with an
// active block, finds this week's published sessions that are already due
// and checks which enrolled clients have no log for them — capped to each
// client's own sessions_per_week, since a 1x/week member was never expected
// to attend session 2 or 3. Also covers SPC (see addSpcFlags above), which
// has its own retrospective, day-of-week-agnostic timing rule. Returns a
// Map<userId, flag[]> so both the Clients list (just needs a count) and
// Client detail (needs the descriptive text) can read off the same computed
// pass.
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
      flags.push({ programId: entry.program.id, programName: entry.program.name, sessionNumber: workout.session_number, period: "this week" });
      flagsByUser.set(assignment.user_id, flags);
    }
  }

  await addSpcFlags(flagsByUser);
  return flagsByUser;
}
