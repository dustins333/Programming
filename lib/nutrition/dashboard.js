import { core, nutrition } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { rollingWeekWindows, computeWeekWindows, deriveCheckinStatus } from "./weekCycle";

function average(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
}

// Collapses the roster's raw signals (status/target/check-in/missed days)
// into the dashboard's single status-badge bucket — priority order matches
// the design handoff's 5-status system: paused overrides everything else,
// then "needs target" (nothing to log against yet), then check-in state,
// then a default "on track".
function deriveRosterStatus({ status, hasTarget, checkinStatus, needsAttention }) {
  if (status === "paused") return "paused";
  if (!hasTarget) return "needsTarget";
  if (checkinStatus === "pending" && needsAttention) return "checkinDue";
  if (checkinStatus === "ready") return "awaitingReview";
  return "onTrack";
}

// Batched (covers the whole roster in a fixed number of queries, not one
// per client) — mirrors the source app's coach-dashboard metrics query
// shape. Names are fetched separately from core.users and merged
// client-side, same cross-schema pattern as lib/programming/comments.js.
// Includes paused clients (unlike the original active-only query) so the
// dashboard's "Paused" filter has something to show.
export async function getNutritionRoster(today = todayInBoise()) {
  const { recent, prior } = rollingWeekWindows(today);
  const { currentWeek } = computeWeekWindows(today);

  const { data: clients, error: clientsError } = await nutrition.from("nutrition_clients").select("*");
  if (clientsError) throw clientsError;
  if (clients.length === 0) return [];

  const userIds = clients.map((c) => c.user_id);

  const [
    { data: logs, error: logsError },
    { data: checkins, error: checkinsError },
    { data: targets, error: targetsError },
    { data: users, error: usersError },
  ] = await Promise.all([
    nutrition
      .from("daily_logs")
      .select("user_id, log_date, weight")
      .in("user_id", userIds)
      .gte("log_date", prior.start)
      .lte("log_date", recent.end),
    nutrition.from("checkin_responses").select("user_id, finalized_at").in("user_id", userIds).eq(
      "week_start",
      currentWeek.start
    ),
    nutrition.from("targets").select("user_id").in("user_id", userIds),
    core.from("users").select("id, name").in("id", userIds),
  ]);
  if (logsError) throw logsError;
  if (checkinsError) throw checkinsError;
  if (targetsError) throw targetsError;
  if (usersError) throw usersError;

  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const userIdsWithTarget = new Set(targets.map((t) => t.user_id));

  return clients.map((client) => {
    const clientLogs = logs.filter((l) => l.user_id === client.user_id);
    const recentLogs = clientLogs.filter((l) => l.log_date >= recent.start && l.log_date <= recent.end);
    const priorLogs = clientLogs.filter((l) => l.log_date >= prior.start && l.log_date <= prior.end);

    const recentWeight = average(recentLogs.map((l) => l.weight).filter((w) => w !== null));
    const priorWeight = average(priorLogs.map((l) => l.weight).filter((w) => w !== null));
    const weightDelta = recentWeight !== null && priorWeight !== null ? recentWeight - priorWeight : null;

    // Clip the expected window to whichever is later: the roster window's
    // start, or when this client was actually assigned — so a just-added
    // client isn't flagged for days before they existed in the system.
    const windowStart =
      client.created_at.slice(0, 10) > recent.start ? client.created_at.slice(0, 10) : recent.start;
    const expectedDays = Math.max(daysBetween(windowStart, recent.end), 0);
    const daysLogged = new Set(recentLogs.map((l) => l.log_date)).size;
    const missedDays = Math.max(expectedDays - daysLogged, 0);

    const checkin = checkins.find((c) => c.user_id === client.user_id) ?? null;
    const checkinStatus = deriveCheckinStatus(checkin);
    const needsAttention = missedDays > 0;
    const hasTarget = userIdsWithTarget.has(client.user_id);

    return {
      userId: client.user_id,
      name: nameById[client.user_id] ?? "Unknown",
      status: client.status,
      createdAt: client.created_at,
      hasTarget,
      weightDelta,
      daysLogged,
      missedDays,
      loggedToday: recentLogs.some((l) => l.log_date === today),
      checkinStatus,
      needsAttention,
      rosterStatus: deriveRosterStatus({ status: client.status, hasTarget, checkinStatus, needsAttention }),
    };
  });
}
