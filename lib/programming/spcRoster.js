import { core, programming } from "../supabase/client";
import { todayInBoise, daysBetween, dateInBoise } from "../boiseDate";
import { labelBlocks } from "./spcBlocks";
import { currentWeekNumber } from "./schedule";

// The SPC roster, sorted by time remaining (design_handoff_coach_web_v2,
// screen 14).
//
// getSpcRoster (spcDashboard.js) answers "what's each client's status" and
// backs the coach launchpad and the native roster. This answers the harder
// question the v2 roster asks: how covered is each client, and what is the
// single next thing to do about it. The difference is coverage — a block
// with three weeks left but two empty sessions in it is not "fine for three
// weeks", and a status pill alone can't say that.
//
// One batched pass rather than per-client round trips: an 18-client roster
// was 5 queries per client before, and the whole point of the screen is to
// be the first thing a coach opens.

const NEXT_STEP = {
  build: { label: "Build next block", tone: "urgent" },
  finishDraft: { label: "Finish draft", tone: "needsAction" },
  resume: { label: "Resume", tone: "quiet" },
  none: null,
};

export async function getSpcRosterDetail(today = todayInBoise()) {
  const { data: clients, error: clientsError } = await programming.from("spc_clients").select("*");
  if (clientsError) throw clientsError;
  if (clients.length === 0) return [];

  const userIds = clients.map((c) => c.user_id);
  const coachIds = [...new Set(clients.map((c) => c.assigned_coach_id).filter(Boolean))];

  const [{ data: blocks, error: blocksError }, { data: users, error: usersError }] = await Promise.all([
    programming.from("spc_blocks").select("*").in("spc_client_id", userIds).order("block_start_date"),
    core.from("users").select("id, name").in("id", [...new Set([...userIds, ...coachIds])]),
  ]);
  if (blocksError) throw blocksError;
  if (usersError) throw usersError;

  const blockIds = blocks.map((b) => b.id);
  const [workouts, completions] = await Promise.all([
    listWorkoutsForBlocks(blockIds),
    listCompletionsForClients(userIds),
  ]);

  const liftCounts = await countLiftsForWorkouts(workouts.map((w) => w.id));

  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const blocksByClient = new Map();
  for (const b of blocks) {
    if (!blocksByClient.has(b.spc_client_id)) blocksByClient.set(b.spc_client_id, []);
    blocksByClient.get(b.spc_client_id).push(b);
  }
  const workoutsByBlock = new Map();
  for (const w of workouts) {
    if (!workoutsByBlock.has(w.spc_block_id)) workoutsByBlock.set(w.spc_block_id, []);
    workoutsByBlock.get(w.spc_block_id).push(w);
  }

  const rows = clients.map((client) => {
    const own = labelBlocks(blocksByClient.get(client.user_id) ?? []);
    // The block covering today, else the next one starting, else the last
    // one that ran — a client between blocks still has a story to tell.
    const current =
      own.find((b) => b.block_start_date <= today && today <= b.block_end_date) ??
      own.find((b) => b.block_start_date > today) ??
      own[own.length - 1] ??
      null;

    const sessions = current ? (workoutsByBlock.get(current.id) ?? []) : [];
    const coverage = coverageOf(sessions, liftCounts);
    const daysLeft = current ? daysBetween(current.block_end_date, today) : null;
    const nextQueued = current ? own.some((b) => b.block_start_date > current.block_end_date) : false;
    const lastSessionAt = completions.get(client.user_id) ?? null;

    return {
      userId: client.user_id,
      name: nameById[client.user_id] ?? "Unknown",
      coachId: client.assigned_coach_id,
      coachName: client.assigned_coach_id ? (nameById[client.assigned_coach_id] ?? "Unassigned") : "Unassigned",
      sessionsPerWeek: client.sessions_per_week,
      status: client.status,
      // No "paused since" date: spc_clients records status but never when it
      // last changed (only created_at exists), and dating a pause from the
      // row's creation would be wrong. The mock shows one — it would need a
      // real status_changed_at column to be true, so it's left out rather
      // than faked. The coach's own note carries the why instead.
      notesGoalsFeedback: client.notes_goals_feedback,
      block: current,
      blockLabel: current?.label ?? null,
      weekNumber: current ? currentWeekNumber(current.block_start_date, current.block_length_weeks, today) : null,
      blockLengthWeeks: current?.block_length_weeks ?? null,
      daysLeft,
      coverage,
      nextQueued,
      lastSessionAt,
      ...describeCoverage({ status: client.status, current, daysLeft, coverage, nextQueued, notes: client.notes_goals_feedback }),
    };
  });

  // Time remaining ascending, so whoever runs out first is at the top.
  // Paused clients have no clock at all and sit at the bottom rather than
  // being sorted by a null.
  return rows.sort((a, b) => {
    if (a.status === "paused" && b.status !== "paused") return 1;
    if (b.status === "paused" && a.status !== "paused") return -1;
    if (a.daysLeft == null && b.daysLeft == null) return a.name.localeCompare(b.name);
    if (a.daysLeft == null) return 1;
    if (b.daysLeft == null) return -1;
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    return a.name.localeCompare(b.name);
  });
}

async function listWorkoutsForBlocks(blockIds) {
  if (!blockIds.length) return [];
  const { data, error } = await programming
    .from("spc_workouts")
    .select("id, spc_block_id, week_number, session_number, title, status")
    .in("spc_block_id", blockIds);
  if (error) throw error;
  return data;
}

async function countLiftsForWorkouts(workoutIds) {
  if (!workoutIds.length) return {};
  const { data, error } = await programming
    .from("spc_workout_exercises")
    .select("spc_workout_id")
    .in("spc_workout_id", workoutIds);
  if (error) throw error;
  const counts = {};
  for (const row of data) counts[row.spc_workout_id] = (counts[row.spc_workout_id] ?? 0) + 1;
  return counts;
}

// Most recent finalized SPC session per client, in one query across the
// whole roster. Ordered newest-first so the first row per user wins.
async function listCompletionsForClients(userIds) {
  if (!userIds.length) return new Map();
  const { data, error } = await programming
    .from("session_completions")
    .select("user_id, completed_at")
    .in("user_id", userIds)
    .not("spc_workout_id", "is", null)
    .order("completed_at", { ascending: false });
  if (error) throw error;
  const latest = new Map();
  for (const row of data) if (!latest.has(row.user_id)) latest.set(row.user_id, row.completed_at);
  return latest;
}

// Same mutually-exclusive buckets as the group side's getBlockReadiness, and
// for the same reason: empty beats draft, so a published-but-empty session
// can't hide inside the published segment of the bar.
function coverageOf(sessions, liftCounts) {
  let published = 0;
  let draft = 0;
  let empty = 0;
  for (const s of sessions) {
    const lifts = liftCounts[s.id] ?? 0;
    if (lifts === 0) empty += 1;
    else if (s.status === "published") published += 1;
    else draft += 1;
  }
  return { total: sessions.length, published, draft, empty };
}

// The reason line and the next-step button — one sentence saying what's
// actually true, and the single action that resolves it.
//
// Ordered by urgency, first match wins: a paused client isn't asked
// anything, a block with nothing behind it beats a block with holes in it,
// and a fully-covered block with time left says nothing at all rather than
// inventing a task.
function describeCoverage({ status, current, daysLeft, coverage, nextQueued, notes }) {
  if (status === "paused") {
    return { reason: notes?.trim() || "Paused", nextStep: NEXT_STEP.resume };
  }
  if (!current) {
    return { reason: "No block yet", nextStep: NEXT_STEP.build };
  }
  if (daysLeft != null && daysLeft < 0) {
    return {
      reason: nextQueued ? "Block ended, next one queued" : "Block ended, nothing queued",
      nextStep: nextQueued ? NEXT_STEP.none : NEXT_STEP.build,
    };
  }

  const left = daysLeft == null ? null : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  if (!nextQueued && daysLeft != null && daysLeft <= 7) {
    return { reason: `${left}, nothing queued`, nextStep: NEXT_STEP.build };
  }
  if (coverage.empty > 0) {
    return {
      reason: `Drafted, ${coverage.empty} session${coverage.empty === 1 ? "" : "s"} empty`,
      nextStep: NEXT_STEP.finishDraft,
    };
  }
  if (coverage.draft > 0) {
    return {
      reason: `${coverage.draft} session${coverage.draft === 1 ? "" : "s"} not published`,
      nextStep: NEXT_STEP.finishDraft,
    };
  }
  return { reason: left ?? "Running", nextStep: NEXT_STEP.none };
}

// "3 days ago" / "Yesterday" / "Today" — the roster's Last session column.
export function describeLastSession(isoTimestamp, today = todayInBoise()) {
  if (!isoTimestamp) return "Never";
  // dateInBoise, never .slice(0,10) — slicing a timestamptz gives the UTC
  // date, which is already tomorrow for anything finalized in the evening.
  const days = daysBetween(today, dateInBoise(new Date(isoTimestamp)));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
