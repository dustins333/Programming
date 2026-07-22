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

// Batched (2 queries covering the whole roster, not one per client) —
// mirrors the source app's coach-dashboard metrics query shape. Names are
// fetched separately from core.users and merged client-side, same
// cross-schema pattern as lib/programming/comments.js.
export async function getNutritionRoster(today = todayInBoise()) {
  const { recent, prior } = rollingWeekWindows(today);
  const { currentWeek } = computeWeekWindows(today);

  const { data: clients, error: clientsError } = await nutrition
    .from("nutrition_clients")
    .select("*")
    .eq("status", "active");
  if (clientsError) throw clientsError;
  if (clients.length === 0) return [];

  const userIds = clients.map((c) => c.user_id);

  const [{ data: logs, error: logsError }, { data: checkins, error: checkinsError }, { data: users, error: usersError }] =
    await Promise.all([
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
      core.from("users").select("id, name").in("id", userIds),
    ]);
  if (logsError) throw logsError;
  if (checkinsError) throw checkinsError;
  if (usersError) throw usersError;

  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));

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

    return {
      userId: client.user_id,
      name: nameById[client.user_id] ?? "Unknown",
      weightDelta,
      daysLogged,
      missedDays,
      loggedToday: recentLogs.some((l) => l.log_date === today),
      checkinStatus: deriveCheckinStatus(checkin),
      needsAttention: missedDays > 0,
    };
  });
}
