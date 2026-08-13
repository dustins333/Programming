import { supabase } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { rollingWeekWindows, computeWeekWindows, deriveCheckinStatus } from "./weekCycle";
import { getOnboardingPhasesForClients } from "./onboarding";

function average(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
}

// Collapses the roster's raw signals into the dashboard's status-badge
// bucket. Priority order: paused/archived override everything; then
// onboarding clients split into the 3 "new clients" stages (see
// deriveOnboardingBucket); then approved-but-target-less clients (a real
// but rare edge case — e.g. a pre-existing standalone-app client whose Kova
// nutrition switch was just turned on) get their own bucket; everyone else
// is an active client, bucketed purely by this week's check-in state.
// deriveCheckinStatus only ever returns pending/ready/completed, so those 3
// active-client statuses are exhaustive — there's no "on track" catch-all
// anymore, per the 2026-08-03 dashboard rework.
function deriveRosterStatus({ status, hasTarget, isOnboarding, onboardingBucket, checkinStatus }) {
  if (status === "paused" || status === "archived") return "paused";
  if (isOnboarding) return onboardingBucket;
  if (!hasTarget) return "needsTarget";
  if (checkinStatus === "pending") return "checkinPending";
  if (checkinStatus === "ready") return "readyForCheckin";
  return "checkinCompleted";
}

// "Objective tracking set up" = the coach hasn't sent onboarding to the
// client yet (migration 0031 — nothing for the client to see or do,
// regardless of how much the coach has already assigned/edited behind the
// scenes). "Objective tracking" = sent, client has something to do or has
// been doing it, just not all 3 phases yet. "Ready for review" = all 3
// onboarding phases done — checked first since a bypassed-onboarding client
// can reach readyForReview without ever being "sent" at all.
//
// Deliberately does NOT gate on trackingDatesCount === 0 anymore. That used
// to double as "hasn't really started" even after being sent — which broke
// the day objective tracking became optional per client (see
// computeOnboardingPhases: 0 assigned days = tracking auto-counts complete,
// same file). A client sent with 0 tracking days on purpose would get stuck
// showing "Objective tracking set up" — reading as "not sent yet" — forever,
// even mid-questionnaire or fully done except starting photos. Real example:
// Melissa Benson, sent + questionnaire submitted + 0 tracking days by
// design, still showing "Set up" until this fix (2026-08-09). Once sent,
// phases.readyForReview is the only thing that matters.
function deriveOnboardingBucket(phases, sent) {
  if (phases.readyForReview) return "readyForReview";
  if (!sent) return "otSetup";
  return "otInProgress";
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
  const onboardingIds = clients.filter((c) => !c.objective_tracking_approved_at).map((c) => c.id);

  const [
    { data: logs, error: logsError },
    { data: checkins, error: checkinsError },
    { data: targets, error: targetsError },
    { data: coaches, error: coachesError },
    onboardingPhasesById,
  ] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("client_id, date, weight")
      .in("client_id", userIds)
      .gte("date", prior.start)
      .lte("date", recent.end),
    supabase
      .from("checkin_responses")
      .select("client_id, finalized_at, submitted_at")
      .in("client_id", userIds)
      .eq("week_start", currentWeek.start),
    supabase.from("targets").select("client_id").in("client_id", userIds),
    supabase.from("coaches").select("id, name"),
    // Isolated: this helper throws on any of five queries, and until now
    // one failing objective_tracking_dates read took down the ENTIRE
    // nutrition roster and queue — data that has nothing to do with it.
    // Same convention the client-detail page follows for milestones/reopens.
    getOnboardingPhasesForClients(onboardingIds).catch((err) => {
      console.error("Nutrition roster: onboarding phases failed", err);
      return {};
    }),
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

    const onboardingInfo = onboardingPhasesById[client.id] ?? null;
    const onboardingBucket = onboardingInfo
      ? deriveOnboardingBucket(onboardingInfo.phases, Boolean(client.onboarding_sent_at))
      : null;

    return {
      userId: client.id,
      name: client.name,
      status: client.status,
      createdAt: client.created_at,
      startDate: client.start_date,
      coachName: coachNameById[client.coach_id] ?? "Unassigned",
      isOnboarding,
      hasTarget,
      weightDelta,
      daysLogged,
      missedDays,
      loggedToday: recentLogs.some((l) => l.date === today),
      checkinStatus,
      checkinSubmittedAt: checkin?.submitted_at ?? null,
      needsAttention,
      trackingDatesCount: onboardingInfo?.trackingDatesCount ?? null,
      trackingLoggedCount: onboardingInfo?.trackingLoggedCount ?? null,
      rosterStatus: deriveRosterStatus({ status: client.status, hasTarget, isOnboarding, onboardingBucket, checkinStatus }),
    };
  });
}
