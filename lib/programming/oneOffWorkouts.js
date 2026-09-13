import { programming } from "../supabase/client";
import { listTemplateWarmups, listTemplateExercises } from "./templates";
import { dateInBoise } from "../boiseDate";

// All of a client's one-offs, any status — the coach-facing client detail
// page view, so a coach can see (and delete) ones they assigned earlier.
export async function listOneOffWorkoutsForUser(userId) {
  const { data, error } = await programming
    .from("one_off_workouts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Copies a template's warmups/exercises onto a brand-new one_off_workout
// for this client — published immediately (see migration 0008's note: a
// coach assigning a ready-made template is a lighter action than building a
// session from scratch, so there's no separate draft/publish review step by
// default). title is denormalized from the template's name at copy time so
// renaming or deleting the template later doesn't retroactively change what
// this client already has.
export async function createOneOffFromTemplate({ userId, templateId, templateName, assignedBy }) {
  const { data: workout, error: workoutError } = await programming
    .from("one_off_workouts")
    .insert({ user_id: userId, source_template_id: templateId, title: templateName, assigned_by: assignedBy })
    .select()
    .single();
  if (workoutError) throw workoutError;

  const [warmups, exercises] = await Promise.all([listTemplateWarmups(templateId), listTemplateExercises(templateId)]);

  if (warmups.length) {
    const { error } = await programming.from("one_off_warmups").insert(
      warmups.map((w) => ({
        one_off_workout_id: workout.id,
        exercise_id: w.exercise_id,
        position: w.position,
        label: w.label,
        superset_group_id: w.superset_group_id,
      }))
    );
    if (error) throw error;
  }

  if (exercises.length) {
    // rep_scheme and superset_group_id both carry through (migration 0085) —
    // before that, a template's per-set reps were silently flattened to one
    // value when assigned, and templates had no supersets to carry at all.
    const { error } = await programming.from("one_off_exercises").insert(
      exercises.map((ex) => ({
        one_off_workout_id: workout.id,
        exercise_id: ex.exercise_id,
        position: ex.position,
        sets: ex.sets,
        reps: ex.reps,
        rep_scheme: ex.rep_scheme,
        superset_group_id: ex.superset_group_id,
        rest: ex.rest,
        notes: ex.notes,
      }))
    );
    if (error) throw error;
  }

  return workout;
}

// "Build a new session" from the SPC client page. Created as a DRAFT, unlike a
// template assignment: a template is finished content, but this one is empty
// the moment it exists, and a published empty one-off would sit on her My Week
// while the coach is still building it. The builder's Send button publishes.
export async function createBlankOneOff({ userId, title, assignedBy }) {
  const { data, error } = await programming
    .from("one_off_workouts")
    .insert({ user_id: userId, title, status: "draft", assigned_by: assignedBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getOneOff(id) {
  const { data, error } = await programming.from("one_off_workouts").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// Asks for the row back and throws on none: an UPDATE that RLS filters out
// affects zero rows and returns no error, which would read as a save.
export async function updateOneOff(id, fields) {
  const { data, error } = await programming
    .from("one_off_workouts")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("That session couldn't be saved.");
}

// ── Builder writes, mirroring templates.js ─────────────────────────────────
// one_off_warmups has no sets/reps columns (same as template_warmups), so the
// builder runs its warm-up grid without them.

export async function addOneOffWarmup({ oneOffWorkoutId, exerciseId, position, label }) {
  const { data, error } = await programming
    .from("one_off_warmups")
    .insert({ one_off_workout_id: oneOffWorkoutId, exercise_id: exerciseId ?? null, position, label: label ?? null })
    .select("*, exercises(id, name)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateOneOffWarmup(id, fields) {
  const { error } = await programming.from("one_off_warmups").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeOneOffWarmup(id) {
  const { error } = await programming.from("one_off_warmups").delete().eq("id", id);
  if (error) throw error;
}

export async function addOneOffExercise({ oneOffWorkoutId, exerciseId, position, sets = 3, reps = "10" }) {
  const { data, error } = await programming
    .from("one_off_exercises")
    .insert({ one_off_workout_id: oneOffWorkoutId, exercise_id: exerciseId, position, sets, reps, rep_scheme: Array(sets).fill(reps) })
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateOneOffExercise(id, fields) {
  const { error } = await programming.from("one_off_exercises").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeOneOffExercise(id) {
  const { error } = await programming.from("one_off_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderOneOffExercises(items) {
  const results = await Promise.all(
    items.map((item) => programming.from("one_off_exercises").update({ position: item.position }).eq("id", item.id))
  );
  for (const { error } of results) if (error) throw error;
}

// "Also save as a template". A plain copy the other way round from
// createOneOffFromTemplate: the template and the one-off are separate from
// here on, so editing one never changes the other.
export async function saveOneOffAsTemplate({ oneOffWorkoutId, name, createdBy }) {
  const [warmups, exercises] = await Promise.all([
    listOneOffWarmups(oneOffWorkoutId),
    listOneOffExercises(oneOffWorkoutId),
  ]);
  const { data: template, error } = await programming
    .from("workout_templates")
    .insert({ name, created_by: createdBy ?? null })
    .select()
    .single();
  if (error) throw error;

  if (warmups.length) {
    const { error: wErr } = await programming.from("template_warmups").insert(
      warmups.map((w) => ({
        template_id: template.id,
        exercise_id: w.exercise_id,
        position: w.position,
        label: w.label,
        superset_group_id: w.superset_group_id,
      }))
    );
    if (wErr) throw wErr;
  }
  if (exercises.length) {
    const { error: eErr } = await programming.from("template_exercises").insert(
      exercises.map((ex) => ({
        template_id: template.id,
        exercise_id: ex.exercise_id,
        position: ex.position,
        sets: ex.sets,
        reps: ex.reps,
        rep_scheme: ex.rep_scheme,
        superset_group_id: ex.superset_group_id,
        rest: ex.rest,
        notes: ex.notes,
      }))
    );
    if (eErr) throw eErr;
  }
  return template;
}

// Every set she logged against one one-off, for the coach's History. Logs are
// stamped with the session (0063), so this is exact rather than date-matched.
export async function listOneOffLogs(userId, oneOffWorkoutId) {
  const { data, error } = await programming
    .from("logs")
    .select("exercise_id, set_number, reps, weight, set_type, date_performed, exercises(name, tracks_weight)")
    .eq("user_id", userId)
    .eq("one_off_workout_id", oneOffWorkoutId)
    .order("set_number");
  if (error) throw error;
  return (data ?? []).filter((r) => r.reps != null || r.weight != null);
}

export async function deleteOneOffWorkout(id) {
  const { error } = await programming.from("one_off_workouts").delete().eq("id", id);
  if (error) throw error;
}

export async function listOneOffWarmups(oneOffWorkoutId) {
  const { data, error } = await programming
    .from("one_off_warmups")
    .select("*, exercises(id, name)")
    .eq("one_off_workout_id", oneOffWorkoutId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function listOneOffExercises(oneOffWorkoutId) {
  const { data, error } = await programming
    .from("one_off_exercises")
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight, rep_unit)")
    .eq("one_off_workout_id", oneOffWorkoutId)
    .order("position");
  if (error) throw error;
  return data;
}

// Member-facing: published one-offs that aren't finalized yet — "open until
// completed", no scheduled date, so this is the whole list rather than
// "next" one like group/SPC's day-of-week routing.
export async function listActiveOneOffWorkoutsForUser(userId) {
  const { data: workouts, error } = await programming
    .from("one_off_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "published")
    .order("created_at");
  if (error) throw error;
  if (!workouts.length) return [];

  const { data: completions, error: completionsError } = await programming
    .from("session_completions")
    .select("one_off_workout_id")
    .eq("user_id", userId)
    .in(
      "one_off_workout_id",
      workouts.map((w) => w.id)
    );
  if (completionsError) throw completionsError;

  const completedIds = new Set(completions.map((c) => c.one_off_workout_id));
  return workouts.filter((w) => !completedIds.has(w.id));
}

// My Week's version of the above — a just-finished one-off stays visible
// (checked off) for the rest of the day rather than vanishing the instant
// it's marked done, so it doesn't look like it silently disappeared. Rolls
// off at the next Boise-midnight boundary, same "today" scoping as
// everything else in this app.
export async function listWeekOneOffWorkoutsForUser(userId, today) {
  const { data: workouts, error } = await programming
    .from("one_off_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "published")
    .order("created_at");
  if (error) throw error;
  if (!workouts.length) return [];

  const { data: completions, error: completionsError } = await programming
    .from("session_completions")
    .select("one_off_workout_id, completed_at")
    .eq("user_id", userId)
    .in(
      "one_off_workout_id",
      workouts.map((w) => w.id)
    );
  if (completionsError) throw completionsError;

  const completedAtById = new Map(completions.map((c) => [c.one_off_workout_id, c.completed_at]));
  return workouts
    .map((w) => {
      const completedAt = completedAtById.get(w.id) ?? null;
      return { ...w, completed: !!completedAt, completedAt };
    })
    .filter((w) => !w.completed || dateInBoise(new Date(w.completedAt)) === today);
}
