import { programming } from "../supabase/client";

// Plan phases — the long-term "what we're working on" map for a client
// (migration 0050). Two levels: a phase holds an ordered list of items.
//
// Lives in the `programming` schema, so this file imports the schema-scoped
// client rather than the bare `supabase` one every other lib/nutrition/*
// module uses. lib/nutrition/milestones.js is the same exception, for the
// same reason.
//
// Phases are NOT dated — `position` is the timeline, reordered by dragging.

export async function listPhases(userId) {
  const { data: phases, error } = await programming
    .from("nutrition_plan_phases")
    .select("*")
    .eq("user_id", userId)
    .order("position");
  if (error) throw error;
  if (!phases || phases.length === 0) return [];

  const { data: items, error: itemsError } = await programming
    .from("nutrition_plan_phase_items")
    .select("*")
    .in("phase_id", phases.map((p) => p.id))
    .order("position");
  if (itemsError) throw itemsError;

  const itemsByPhase = {};
  for (const item of items ?? []) {
    if (!itemsByPhase[item.phase_id]) itemsByPhase[item.phase_id] = [];
    itemsByPhase[item.phase_id].push(item);
  }
  return phases.map((p) => ({ ...p, items: itemsByPhase[p.id] ?? [] }));
}

// New phases go to the bottom — the list reads top-to-bottom as "now" to
// "later", so the newest thing planned is furthest out until dragged.
export async function createPhase(userId, { title, details }, createdBy) {
  const trimmed = String(title || "").trim();
  if (!trimmed) throw new Error("Phase title is required");

  const { data: last } = await programming
    .from("nutrition_plan_phases")
    .select("position")
    .eq("user_id", userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await programming.from("nutrition_plan_phases").insert({
    user_id: userId,
    title: trimmed,
    details: details?.trim() || null,
    position: (last?.position ?? 0) + 1,
    created_by: createdBy,
  });
  if (error) throw error;
}

export async function updatePhase(phaseId, { title, details }) {
  const trimmed = String(title || "").trim();
  if (!trimmed) throw new Error("Phase title is required");
  const { error } = await programming
    .from("nutrition_plan_phases")
    .update({ title: trimmed, details: details?.trim() || null })
    .eq("id", phaseId);
  if (error) throw error;
}

export async function deletePhase(phaseId) {
  // Items cascade with the phase (on delete cascade).
  const { error } = await programming.from("nutrition_plan_phases").delete().eq("id", phaseId);
  if (error) throw error;
}

export async function addPhaseItem(phaseId, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Item text is required");

  const { data: last } = await programming
    .from("nutrition_plan_phase_items")
    .select("position")
    .eq("phase_id", phaseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await programming
    .from("nutrition_plan_phase_items")
    .insert({ phase_id: phaseId, text: trimmed, position: (last?.position ?? 0) + 1 });
  if (error) throw error;
}

export async function updatePhaseItem(itemId, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Item text is required");
  const { error } = await programming.from("nutrition_plan_phase_items").update({ text: trimmed }).eq("id", itemId);
  if (error) throw error;
}

export async function deletePhaseItem(itemId) {
  const { error } = await programming.from("nutrition_plan_phase_items").delete().eq("id", itemId);
  if (error) throw error;
}

// Rewrites every row's position as 1..N, same shape as
// lib/programming/workouts.js's reorderWorkoutExercises — and, like it,
// throws on any row's error so a caller's .catch(toastError) is a live
// branch rather than dead code.
//
// Only whole phases reorder. Bullets keep a `position` (it's their stable
// insertion order) but are deliberately not draggable, so a drag can never
// be ambiguous about whether it's moving a phase or a line inside one.
export async function reorderPhases(items) {
  const results = await Promise.all(
    items.map((item) => programming.from("nutrition_plan_phases").update({ position: item.position }).eq("id", item.id))
  );
  for (const { error } of results) if (error) throw error;
}
