import { core, programming } from "../supabase/client";
import { todayInBoise, daysBetween, dateInBoise, mondayOnOrBefore } from "../boiseDate";
import { labelBlocks } from "./spcBlocks";
import { currentWeekNumber, calendarWeekNumber } from "./schedule";
import { deriveSpcState, resolveClientPrograms } from "./spcState";

// The SPC roster, A–Z by name (design_handoff_spc_rework_v1, 1g).
//
// getSpcRoster (spcDashboard.js) answers "what's each client's status" and
// backs the coach launchpad and the native roster. This is the fuller pass
// behind both roster screens: each client's current program, this week's
// completions, and the single next thing to do about her — all feeding
// deriveSpcState (v2, four states, all calendar-derived).
//
// One batched pass rather than per-client round trips: an 18-client roster
// was 5 queries per client before, and the whole point of the screen is to
// be the first thing a coach opens.

export async function getSpcRosterDetail(today = todayInBoise()) {
  // Inactive rows are people whose SPC switch is off (0108). Their row is
  // kept so nothing they were programmed is lost, but they are not SPC
  // clients — excluded here rather than filtered per screen, so every
  // consumer of the roster agrees on who is on it.
  const { data: clients, error: clientsError } = await programming
    .from("spc_clients")
    .select("*")
    .neq("status", "inactive");
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
    listCompletionsForClients(userIds, today),
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
    // Shared with the client page, which used to answer this differently and
    // disagree with this screen for a third of the roster.
    const { current, queued, draft: draftBlock, notStarted, everScheduled } = resolveClientPrograms(own, today);

    const sessions = current ? (workoutsByBlock.get(current.id) ?? []) : [];
    const coverage = coverageOf(sessions, liftCounts);
    const ongoing = Boolean(current && current.block_end_date == null);
    const daysLeft = current && current.block_end_date ? daysBetween(current.block_end_date, today) : null;
    const nextQueued = Boolean(queued);
    const lastSessionAt = completions.latest.get(client.user_id) ?? null;
    // Due now fires the moment the final week's expected sessions are all
    // done (Terra, 2026-08-30). "Final week" is only ever the current
    // calendar week when the state machine consults this, so a plain
    // completions-this-week count is the right measure for both formats.
    const thisWeekCount = completions.thisWeek.get(client.user_id) ?? 0;
    const finalWeekDone = thisWeekCount >= (client.sessions_per_week ?? 1);

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
      // "enrolled Aug 24" on a never-programmed row — dateInBoise, never
      // .slice(0,10), which reads the UTC date out of a timestamptz.
      enrolledAt: client.created_at ? dateInBoise(new Date(client.created_at)) : null,
      block: current,
      blockLabel: current?.label ?? null,
      // Sessions-format runs have no authored week grid, so the week is pure
      // calendar arithmetic (uncapped — a lapsed run keeps counting). Weekly
      // blocks keep the clamped authored-week math.
      weekNumber: current
        ? current.format === "sessions"
          ? calendarWeekNumber(current.block_start_date, today)
          : currentWeekNumber(current.block_start_date, current.block_length_weeks, today)
        : null,
      blockLengthWeeks: current?.block_length_weeks ?? null,
      ongoing,
      daysLeft,
      coverage,
      nextQueued,
      draftBlock,
      lastSessionAt,
      thisWeekCount,
      // state / label / tone / reason / nextStep — all computed, nothing
      // stored. See lib/programming/spcState.js (v2, four states).
      ...deriveSpcState({
        status: client.status,
        current,
        daysLeft,
        ongoing,
        nextQueued,
        nextQueuedStart: queued?.block_start_date ?? null,
        finalWeekDone,
        everScheduled,
        notStarted,
        notes: client.notes_goals_feedback,
      }),
    };
  });

  // A–Z by name (design handoff v1, 1g — replaces the old time-remaining
  // default, which Terra asked to drop). Screens re-sort by urgency
  // themselves when a coach clicks the STATUS header.
  return rows.sort((a, b) => a.name.localeCompare(b.name));
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

// Two facts from one query over the roster's SPC completions: the most
// recent finalized session per client (newest-first, first row per user
// wins), and how many sessions each client finalized in the CURRENT calendar
// week — what deriveSpcState's finalWeekDone reads. The week boundary is
// Boise, matched to dateInBoise the same way describeLastSession is.
async function listCompletionsForClients(userIds, today = todayInBoise()) {
  if (!userIds.length) return { latest: new Map(), thisWeek: new Map() };
  const weekStart = mondayOnOrBefore(today);
  const { data, error } = await programming
    .from("session_completions")
    .select("user_id, completed_at")
    .in("user_id", userIds)
    .not("spc_workout_id", "is", null)
    .order("completed_at", { ascending: false });
  if (error) throw error;
  const latest = new Map();
  const thisWeek = new Map();
  for (const row of data) {
    if (!latest.has(row.user_id)) latest.set(row.user_id, row.completed_at);
    if (dateInBoise(new Date(row.completed_at)) >= weekStart) {
      thisWeek.set(row.user_id, (thisWeek.get(row.user_id) ?? 0) + 1);
    }
  }
  return { latest, thisWeek };
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

// The coach filter's values, and the one definition of what each matches.
// Both rosters (the web table and the phone list) read these rather than
// testing coachId themselves — two copies of "is this row mine" is how the
// two screens end up disagreeing about who is on the roster.
//
// "mine" is yours PLUS anyone with no assigned coach: nobody owns those, so
// scoping to strictly-yours is how an unassigned client goes unnoticed by
// everybody. Same rule the home page's SPC warning rows use.
export const COACH_FILTER_MINE = "mine";
export const COACH_FILTER_UNASSIGNED = "__unassigned";

export function matchesCoachFilter(row, filter, profileId) {
  // null (phone) and "all" (web) are the same thing: no coach filter.
  if (!filter || filter === "all") return true;
  if (filter === COACH_FILTER_MINE) return !row.coachId || row.coachId === profileId;
  if (filter === COACH_FILTER_UNASSIGNED) return !row.coachId;
  return row.coachId === filter;
}

// Which filter the roster should OPEN on: yours and the unassigned, when any
// of these clients are actually assigned to you. The whole roster is still
// one tap away and the filter shows itself either way (a named option in the
// web dropdown, a token above the phone list) — this only changes where you
// land, not what you're allowed to see.
//
// The fallback matters more than the rule: a coach with no SPC clients of
// their own, and an admin who doesn't coach SPC, must not open to a page
// holding only other people's leftovers. Null means "no default, show
// everyone"; each roster maps that to its own all-coaches value.
export function defaultCoachFilter(rows, profile) {
  const me = profile?.id;
  if (!me || !rows?.length) return null;
  return rows.some((r) => r.coachId === me) ? COACH_FILTER_MINE : null;
}
