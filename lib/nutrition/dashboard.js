import { supabase } from "../supabase/client";
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
// into the dashboard's single status-badge bucket — priority order: paused
// (and archived) override everything else, then "needs target" (nothing to
// log against yet — includes anyone still mid-onboarding, since they have
// no target either), then check-in state, then a default "on track".
function deriveRosterStatus({ status, hasTarget, checkinStatus, needsAttention }) {
  if (status === "paused" || status === "archived") return "paused";
  if (!hasTarget) return "needsTarget";
  if (checkinStatus === "pending" && needsAttention) return "checkinDue";
  if (checkinStatus === "ready") return "awaitingReview";
  return "onTrack";
}

// Batched (covers the whole roster in a fixed number of queries, not one per
// client). Unlike the placeholder schema, public.clients already stores
// name/email itself — no separate core.users join needed.
export async function getNutritionRoster(today = todayInBoise()) {
  const { recent, prior } = rollingWeekWindows(today);
  const { currentWeek } = computeWeekWindows(today);

  const { data: clients, error: clientsError } = await supabase.from("clients").select("*");
  if (clientsError) throw clientsError;
  if (clients.length === 0) return [];

  const userIds = clients.map((c) => c.id);

  const [
    { data: logs, error: logsError },
    { data: checkins, error: checkinsError },
    { data: targets, error: targetsError },
    { data: coaches, error: coachesError },
  ] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("client_id, date, weight")
      .in("client_id", userIds)
      .gte("date", prior.start)
      .lte("date", recent.end),
    supabase
      .from("checkin_responses")
      .select("client_id, finalized_at")
      .in("client_id", userIds)
      .eq("week_start", currentWeek.start),
    supabase.from("targets").select("client_id").in("client_id", userIds),
    supabase.from("coaches").select("id, name"),
  ]);
  if (logsError) throw logsError;
  if (checkinsError) throw checkinsError;
  if (targetsError) throw targetsError;
  if (coachesError) throw coachesError;

  const userIdsWithTarget = new Set(targets.map((t) => t.client_id));
  const coachNameById = Object.fromEntries((coaches ?? []).map((c) => [c.id, c.name]));

  return clients.map((client) => {
    const clientLogs = logs.filter((l) => l.client_id === client.id);
    const recentLogs = clientLogs.filter((l) => l.date >= recent.start && l.date <= recent.end);
    const priorLogs = clientLogs.filter((l) => l.date >= prior.start && l.date <= prior.end);

    const recentWeight = average(recentLogs.map((l) => l.weight).filter((w) => w !== null));
    const priorWeight = average(priorLogs.map((l) => l.weight).filter((w) => w !== null));
    const weightDelta = recentWeight !== null && priorWeight !== null ? recentWeight - priorWeight : null;

    // Clip the expected window to whichever is later: the roster window's
    // start, or when this client was actually assigned — so a just-added
    // client isn't flagged for days before they existed in the system. Not
    // meaningful until they're past onboarding (see isOnboarding below).
    const windowStart = client.start_date > recent.start ? client.start_date : recent.start;
    const expectedDays = Math.max(daysBetween(windowStart, recent.end), 0);
    const daysLogged = new Set(recentLogs.map((l) => l.date)).size;
    const missedDays = Math.max(expectedDays - daysLogged, 0);

    const checkin = checkins.find((c) => c.client_id === client.id) ?? null;
    const checkinStatus = deriveCheckinStatus(checkin);
    const isOnboarding = !client.objective_tracking_approved_at;
    const needsAttention = !isOnboarding && missedDays > 0;
    const hasTarget = userIdsWithTarget.has(client.id);

    return {
      userId: client.id,
      name: client.name,
      status: client.status,
      createdAt: client.created_at,
      startDate: client.start_date,
      coachName: coachNameById[client.coach_id] ?? "—",
      isOnboarding,
      hasTarget,
      weightDelta,
      daysLogged,
      missedDays,
      loggedToday: recentLogs.some((l) => l.date === today),
      checkinStatus,
      needsAttention,
      rosterStatus: isOnboarding
        ? "onboarding"
        : deriveRosterStatus({ status: client.status, hasTarget, checkinStatus, needsAttention }),
    };
  });
}
