import { core, programming } from "../supabase/client";
import { listMembers, listAssignments } from "./clients";
import { listGroupPrograms } from "./blocks";
import { getSpcRoster } from "./spcDashboard";
import { getNutritionRoster } from "../nutrition/dashboard";
import { getMissedSessionFlagsByUser } from "./flags";
import { listSessionsSinceAllUsers } from "./coachLogs";
import { todayInBoise, addDays, dateInBoise, dayOfWeekInBoise, daysBetween } from "../boiseDate";

// Calendar Monday of the week containing `today` — Sunday closes the week
// it ends rather than starting a new one, matching My Week and
// coachLogs.js's own weekStartFor.
function weekStartFor(today) {
  const dow = dayOfWeekInBoise(today);
  return addDays(today, dow === 0 ? -6 : 1 - dow);
}

// How long ago, in the words a coach actually uses. Anything a week or more
// out reads in days so "12 days ago" stays comparable to the 7-day quiet
// threshold; past a month it switches to months so a long-lapsed client
// doesn't render as "163 days ago".
export function describeLastSession(dateString, today) {
  if (!dateString) return { label: "never", days: null, tone: "muted" };
  // daysBetween is dateA - dateB, so today first gives a positive age.
  const days = daysBetween(today, dateString);
  const tone = days >= 7 ? "urgent" : days <= 1 ? "good" : "normal";
  if (days <= 0) return { label: "Today", days: 0, tone: "good" };
  if (days === 1) return { label: "Yesterday", days: 1, tone: "good" };
  if (days < 31) return { label: `${days} days ago`, days, tone };
  const months = Math.round(days / 30);
  return { label: `${months} month${months === 1 ? "" : "s"} ago`, days, tone: "urgent" };
}

// Batched roster aggregation shared by the web and native Clients list
// (previously only lived in clients/index.web.js — native's own list had no
// program tags or filtering at all, which is why a `?program=` deep link
// from the dashboard silently lost its filter there). Same "one domain's
// failure shouldn't hide another" isolation as coachDashboard.js's
// getCoachDashboardStats.
export async function loadClientsRoster(today = todayInBoise()) {
  const [members, assignments, programs] = await Promise.all([listMembers(), listAssignments(), listGroupPrograms()]);
  const programsById = Object.fromEntries(programs.map((p) => [p.id, p]));
  const memberIds = members.map((m) => m.id);
  const weekStart = weekStartFor(today);

  // Own try/catch, same isolation as SPC/nutrition/flags below — a roster
  // this size fits in one call (get_login_activity takes the whole
  // user_ids array at once, not per-row), so this doesn't turn into an
  // N+1 the way per-client calls elsewhere in this app were careful to
  // avoid.
  let lastSignInById = new Map();
  try {
    const { data: loginRows, error } = await core.rpc("get_login_activity", { user_ids: memberIds });
    if (error) throw error;
    lastSignInById = new Map((loginRows ?? []).map((r) => [r.id, r.last_sign_in_at]));
  } catch {
    // leave empty — "not registered yet" just won't be filterable/shown
  }

  // Migration 0056. Unbounded lookback per client in one call — see that
  // file for why this is a function rather than the usual fetch-and-group.
  let lastSessionById = new Map();
  try {
    const { data: rows, error } = await programming.rpc("get_last_session_dates", { user_ids: memberIds });
    if (error) throw error;
    lastSessionById = new Map((rows ?? []).map((r) => [r.user_id, dateInBoise(new Date(r.last_completed_at))]));
  } catch {
    // leave empty — Last session reads "—" rather than taking the page down
  }

  // Bounded to this calendar week, so it stays cheap regardless of history.
  let weekCountById = new Map();
  try {
    const sessions = await listSessionsSinceAllUsers(weekStart);
    for (const s of sessions) weekCountById.set(s.userId, (weekCountById.get(s.userId) ?? 0) + 1);
  } catch {
    // leave empty
  }

  let spcRoster = [];
  try {
    spcRoster = await getSpcRoster();
  } catch {
    // leave empty — SPC data shouldn't block the whole client list
  }
  let nutritionRoster = [];
  try {
    nutritionRoster = await getNutritionRoster(today);
  } catch {
    // leave empty
  }
  let flagsByUser = new Map();
  try {
    flagsByUser = await getMissedSessionFlagsByUser();
  } catch {
    // leave empty
  }

  const spcByUser = new Map(spcRoster.map((c) => [c.userId, c]));
  const nutritionByUser = new Map(nutritionRoster.map((c) => [c.userId, c]));
  const spcActiveIds = new Set(spcRoster.filter((c) => c.status !== "paused").map((c) => c.userId));
  const nutritionActiveIds = new Set(nutritionRoster.filter((c) => c.status === "active").map((c) => c.userId));

  const rows = members.map((m) => {
    const memberships = assignments.filter((a) => a.user_id === m.id);
    const groupProgramIds = memberships.map((a) => a.group_program_id);
    const tags = groupProgramIds.map((id) => ({ key: id, label: programsById[id]?.name ?? "Group" }));
    if (spcActiveIds.has(m.id)) tags.push({ key: "spc", label: "SPC" });
    if (nutritionActiveIds.has(m.id)) tags.push({ key: "nutrition", label: "Nutrition" });

    const programKeys = new Set([...groupProgramIds, ...(spcActiveIds.has(m.id) ? ["spc"] : []), ...(nutritionActiveIds.has(m.id) ? ["nutrition"] : [])]);

    // Weekly target = every group membership's own frequency, plus SPC's.
    // A client on Flagship 3x plus SPC 2x genuinely owes 5 sessions, and
    // completions aren't split by module in session_completions anyway.
    const spcClient = spcByUser.get(m.id);
    const groupTarget = memberships.reduce((sum, a) => sum + (a.sessions_per_week ?? 3), 0);
    const spcTarget = spcActiveIds.has(m.id) ? spcClient?.sessionsPerWeek ?? spcClient?.sessions_per_week ?? 0 : 0;
    const weeklyTarget = groupTarget + spcTarget;

    const nutrition = nutritionByUser.get(m.id) ?? null;
    const lastSessionDate = lastSessionById.get(m.id) ?? null;
    const lastSession = describeLastSession(lastSessionDate, today);

    return {
      ...m,
      tags,
      programKeys,
      unassigned: tags.length === 0,
      flagCount: flagsByUser.get(m.id)?.length ?? 0,
      neverRegistered: !lastSignInById.get(m.id),
      lastSessionDate,
      lastSession,
      weekCompleted: weekCountById.get(m.id) ?? 0,
      weeklyTarget,
      nutritionEnrolled: nutritionActiveIds.has(m.id),
      nutritionDaysLogged: nutrition?.daysLogged ?? null,
      // "pending" is the client owing this week's check-in; "ready" is it
      // sitting waiting on the coach. Only the first is the client's to do,
      // which is what the roster's Needs column is about.
      checkinDue: Boolean(nutrition && nutritionActiveIds.has(m.id) && nutrition.checkinStatus === "pending" && !nutrition.isOnboarding),
    };
  });

  return { rows, programs, today };
}
