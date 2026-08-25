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
