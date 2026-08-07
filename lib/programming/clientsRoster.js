import { core } from "../supabase/client";
import { listMembers, listAssignments } from "./clients";
import { listGroupPrograms } from "./blocks";
import { getSpcRoster } from "./spcDashboard";
import { getNutritionRoster } from "../nutrition/dashboard";
import { getMissedSessionFlagsByUser } from "./flags";

// Batched roster aggregation shared by the web and native Clients list
// (previously only lived in clients/index.web.js — native's own list had no
// program tags or filtering at all, which is why a `?program=` deep link
// from the dashboard silently lost its filter there). Same "one domain's
// failure shouldn't hide another" isolation as coachDashboard.js's
// getCoachDashboardStats.
export async function loadClientsRoster() {
  const [members, assignments, programs] = await Promise.all([listMembers(), listAssignments(), listGroupPrograms()]);
  const programsById = Object.fromEntries(programs.map((p) => [p.id, p]));

  // Own try/catch, same isolation as SPC/nutrition/flags below — a roster
  // this size fits in one call (get_login_activity takes the whole
  // user_ids array at once, not per-row), so this doesn't turn into an
  // N+1 the way per-client calls elsewhere in this app were careful to
  // avoid.
  let lastSignInById = new Map();
  try {
    const { data: loginRows, error } = await core.rpc("get_login_activity", { user_ids: members.map((m) => m.id) });
    if (error) throw error;
    lastSignInById = new Map((loginRows ?? []).map((r) => [r.id, r.last_sign_in_at]));
  } catch {
    // leave empty — "not registered yet" just won't be filterable/shown
  }

  let spcRoster = [];
  try {
    spcRoster = await getSpcRoster();
  } catch {
    // leave empty — SPC data shouldn't block the whole client list
  }
  let nutritionRoster = [];
  try {
    nutritionRoster = await getNutritionRoster();
  } catch {
    // leave empty
  }
  let flagsByUser = new Map();
  try {
    flagsByUser = await getMissedSessionFlagsByUser();
  } catch {
    // leave empty
  }

  const spcActiveIds = new Set(spcRoster.filter((c) => c.status !== "paused").map((c) => c.userId));
  const nutritionActiveIds = new Set(nutritionRoster.filter((c) => c.status === "active").map((c) => c.userId));

  const rows = members.map((m) => {
    const groupProgramIds = assignments.filter((a) => a.user_id === m.id).map((a) => a.group_program_id);
    const tags = groupProgramIds.map((id) => ({ key: id, label: programsById[id]?.name ?? "Group" }));
    if (spcActiveIds.has(m.id)) tags.push({ key: "spc", label: "SPC" });
    if (nutritionActiveIds.has(m.id)) tags.push({ key: "nutrition", label: "Nutrition" });

    const programKeys = new Set([...groupProgramIds, ...(spcActiveIds.has(m.id) ? ["spc"] : []), ...(nutritionActiveIds.has(m.id) ? ["nutrition"] : [])]);

    return {
      ...m,
      tags,
      programKeys,
      unassigned: tags.length === 0,
      flagCount: flagsByUser.get(m.id)?.length ?? 0,
      neverRegistered: !lastSignInById.get(m.id),
    };
  });

  return { rows, programs };
}
