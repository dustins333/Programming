import { programming } from "../supabase/client";

export async function listTemplates() {
  const { data, error } = await programming.from("workout_templates").select("*").order("category").order("name");
  if (error) throw error;
  return data;
}

export async function getTemplate(templateId) {
  const { data, error } = await programming.from("workout_templates").select("*").eq("id", templateId).single();
  if (error) throw error;
  return data;
}

export async function createTemplate({ name, category, createdBy }) {
  const { data, error } = await programming
    .from("workout_templates")
    .insert({ name, category, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data;
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

export async function addTemplateExercise({ templateId, exerciseId, position }) {
  const { data, error } = await programming
    .from("template_exercises")
    .insert({ template_id: templateId, exercise_id: exerciseId, position, sets: 3, reps: "10", rep_scheme: ["10", "10", "10"] })
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
