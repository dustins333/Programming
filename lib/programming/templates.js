import { programming } from "../supabase/client";

// Every template with its category joined (0110). `category` (the old
// two-value text column) is still on the row but is no longer read or
// written anywhere — see the migration's comment on it.
export async function listTemplates() {
  const { data, error } = await programming
    .from("workout_templates")
    .select("*, template_categories(id, name, position)")
    .order("name");
  if (error) throw error;
  return data;
}

export async function getTemplate(templateId) {
  const { data, error } = await programming
    .from("workout_templates")
    .select("*, template_categories(id, name, position)")
    .eq("id", templateId)
    .single();
  if (error) throw error;
  return data;
}

export async function createTemplate({ name, categoryId, createdBy }) {
  const { data, error } = await programming
    .from("workout_templates")
    .insert({ name, category_id: categoryId ?? null, created_by: createdBy })
    .select("*, template_categories(id, name, position)")
    .single();
  if (error) throw error;
  return data;
}

export async function setTemplateCategory(templateId, categoryId) {
  const { error } = await programming
    .from("workout_templates")
    .update({ category_id: categoryId ?? null })
    .eq("id", templateId);
  if (error) throw error;
}

export async function deleteTemplate(templateId) {
  const { error } = await programming.from("workout_templates").delete().eq("id", templateId);
  if (error) throw error;
}

export async function listTemplateWarmups(templateId) {
  const { data, error } = await programming
    .from("template_warmups")
    .select("*, exercises(id, name)")
    .eq("template_id", templateId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addTemplateWarmup({ templateId, exerciseId, position, label }) {
  const { data, error } = await programming
    .from("template_warmups")
    .insert({ template_id: templateId, exercise_id: exerciseId ?? null, position, label: label ?? null })
    .select("*, exercises(id, name)")
    .single();
  if (error) throw error;
  return data;
}

// Re-added 2026-08-23 (an earlier version of this was deleted as dead code):
// the warm-up superset link toggle writes superset_group_id through this.
export async function updateTemplateWarmup(id, fields) {
  const { error } = await programming.from("template_warmups").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeTemplateWarmup(id) {
  const { error } = await programming.from("template_warmups").delete().eq("id", id);
  if (error) throw error;
}

export async function listTemplateExercises(templateId) {
  const { data, error } = await programming
    .from("template_exercises")
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url)")
    .eq("template_id", templateId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addTemplateExercise({ templateId, exerciseId, position, sets = 3, reps = "10" }) {
  const { data, error } = await programming
    .from("template_exercises")
    .insert({ template_id: templateId, exercise_id: exerciseId, position, sets, reps, rep_scheme: Array(sets).fill(reps) })
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplateExercise(id, fields) {
  const { error } = await programming.from("template_exercises").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeTemplateExercise(id) {
  const { error } = await programming.from("template_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderTemplateExercises(items) {
  const results = await Promise.all(
    items.map((item) => programming.from("template_exercises").update({ position: item.position }).eq("id", item.id))
  );
  for (const { error } of results) if (error) throw error;
}
