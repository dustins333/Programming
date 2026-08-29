import { core, programming } from "../supabase/client";
import { todayInBoise, daysBetween, dateInBoise } from "../boiseDate";
import { labelBlocks } from "./spcBlocks";
import { currentWeekNumber } from "./schedule";
import { deriveSpcState } from "./spcState";

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
    // A draft (0089) has no dates and isn't the client's programming yet — it
    // is worth surfacing as "there is something written, send it", but it must
    // never be picked as the block she's on. Note the array is ordered by
    // start date ascending, which puts undated drafts LAST, so without this
    // filter a draft would win the "last one that ran" fallback below.
    const scheduled = own.filter((b) => b.status !== "draft");
    const draftBlock = own.find((b) => b.status === "draft") ?? null;
    // The block covering today, else the next one starting, else the last
    // one that ran — a client between blocks still has a story to tell.
    const current =
      scheduled.find((b) => b.block_start_date <= today && today <= b.block_end_date) ??
      scheduled.find((b) => b.block_start_date > today) ??
      scheduled[scheduled.length - 1] ??
      null;

    const sessions = current ? (workoutsByBlock.get(current.id) ?? []) : [];
    const coverage = coverageOf(sessions, liftCounts);
    const daysLeft = current ? daysBetween(current.block_end_date, today) : null;
    const nextQueued = current ? scheduled.some((b) => b.block_start_date > current.block_end_date) : false;
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
      draftBlock,
      lastSessionAt,
      // state / label / tone / reason / nextStep — all computed, nothing
      // stored. See lib/programming/spcState.js and migration 0099.
      ...deriveSpcState({
        status: client.status,
        current,
        daysLeft,
        coverage,
        nextQueued,
        draftBlock,
        everScheduled: scheduled.length > 0,
        notes: client.notes_goals_feedback,
      }),
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
