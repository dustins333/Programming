import { programming } from "../supabase/client";

// Coach-assigned milestones ("cutesy colored rectangles") — see migration
// 0023. Capped at 3 concurrently active per client (enforced here, not in
// the DB) so the dashboard's 3-slot row always has room for either a filled
// card or an empty "+" placeholder.
export const MAX_ACTIVE_MILESTONES = 3;

// Palette indices, not literal colors, are what's stored on each row — see
// 0023's comment. Reused house pastel tones (peach/sage/tan/rust-pink) from
// elsewhere in the app (DailyLogCard, Group Programs' PANEL_BG, etc.).
export const MILESTONE_COLORS = [
  { bg: "#fdf6f2", border: "#f0ddd2", text: "#b23a22" },
  { bg: "#eef1e7", border: "#dbe8cf", text: "#4d6142" },
  { bg: "#f4ede3", border: "#e9d3ae", text: "#8a5a2e" },
  { bg: "#fdece5", border: "#f0d4c9", text: "#b23a22" },
];

export async function listActiveMilestones(userId) {
  const { data, error } = await programming
    .from("nutrition_milestones")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at");
  if (error) throw error;
  return data;
}

// Active first (oldest first, matching the dashboard slots), then completed
// most-recently-closed first — for the History popup.
export async function listAllMilestones(userId) {
  const { data, error } = await programming
    .from("nutrition_milestones")
    .select("*")
    .eq("user_id", userId)
    .order("status", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMilestone(userId, { title, details, emoji }, createdBy) {
  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle) throw new Error("Milestone title is required");

  const active = await listActiveMilestones(userId);
  if (active.length >= MAX_ACTIVE_MILESTONES) {
    throw new Error(`Only ${MAX_ACTIVE_MILESTONES} active milestones at a time — close one out first.`);
  }

  const { error } = await programming.from("nutrition_milestones").insert({
    user_id: userId,
    title: trimmedTitle,
    details: String(details || "").trim() || null,
    emoji: String(emoji || "").trim() || null,
    color_index: active.length % MILESTONE_COLORS.length,
    created_by: createdBy,
  });
  if (error) throw error;
}

export async function updateMilestone(milestoneId, { title, details, emoji }) {
  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle) throw new Error("Milestone title is required");
  const { error } = await programming
    .from("nutrition_milestones")
    .update({ title: trimmedTitle, details: String(details || "").trim() || null, emoji: String(emoji || "").trim() || null })
    .eq("id", milestoneId);
  if (error) throw error;
}

// Most-recently-completed first — feeds the member's completed-milestones
// slider card and My History timeline. Separate from listAllMilestones
// (which interleaves active-first for the coach's History popup) since
// these two callers only ever want completed ones, oldest-active-first
// order would be irrelevant noise for them.
export async function listCompletedMilestones(userId) {
  const { data, error } = await programming
    .from("nutrition_milestones")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function completeMilestone(milestoneId) {
  const { error } = await programming
    .from("nutrition_milestones")
    .update({ status: "completed", completed_at: new Date().toISOString(), acknowledged_at: null })
    .eq("id", milestoneId);
  if (error) throw error;
}

// "Resurrect" a completed milestone back to active — clears completed_at/
// acknowledged_at so a later re-completion reads as a fresh one (a new
// congrats popup, not a stale already-seen one). Subject to the same
// MAX_ACTIVE_MILESTONES cap as creating a new one.
export async function reopenMilestone(milestoneId, userId) {
  const active = await listActiveMilestones(userId);
  if (active.length >= MAX_ACTIVE_MILESTONES) {
    throw new Error(`Only ${MAX_ACTIVE_MILESTONES} active milestones at a time — close one out first.`);
  }
  const { error } = await programming
    .from("nutrition_milestones")
    .update({ status: "active", completed_at: null, acknowledged_at: null })
    .eq("id", milestoneId);
  if (error) throw error;
}

export async function deleteMilestone(milestoneId) {
  const { error } = await programming.from("nutrition_milestones").delete().eq("id", milestoneId);
  if (error) throw error;
}

// The "congrats" popup — a completed milestone the client hasn't seen yet.
// Oldest first, so if a coach somehow closes several before the client next
// opens the app, they see them one at a time rather than only the latest.
export async function getUnseenCompletedMilestone(userId) {
  const { data, error } = await programming
    .from("nutrition_milestones")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("acknowledged_at", null)
    .order("completed_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function acknowledgeMilestone(milestoneId) {
  const { error } = await programming.rpc("acknowledge_nutrition_milestone", { p_milestone_id: milestoneId });
  if (error) throw error;
}
