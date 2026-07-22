import { programming } from "../supabase/client";
import { getMostRecentLog } from "./exercises";
import { todayInBoise } from "../boiseDate";

export async function getSpcWorkout(workoutId) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*, spc_blocks(id, spc_client_id, block_length_weeks)")
    .eq("id", workoutId)
    .single();
  if (error) throw error;
  return data;
}

export async function listSpcWarmups(workoutId) {
  const { data, error } = await programming
    .from("spc_workout_warmups")
    .select("*, exercises(id, name)")
    .eq("spc_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addSpcWarmup({ workoutId, exerciseId, position, label }) {
  const { data, error } = await programming
    .from("spc_workout_warmups")
    .insert({ spc_workout_id: workoutId, exercise_id: exerciseId ?? null, position, label: label ?? null })
    .select("*, exercises(id, name)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSpcWarmup(id, fields) {
  const { error } = await programming.from("spc_workout_warmups").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeSpcWarmup(id) {
  const { error } = await programming.from("spc_workout_warmups").delete().eq("id", id);
  if (error) throw error;
}

export async function listSpcWorkoutExercises(workoutId) {
  const { data, error } = await programming
    .from("spc_workout_exercises")
    .select("*, exercises(id, name, muscle_group, video_url), spc_exercise_weeks(*)")
    .eq("spc_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data.map((row) => ({
    ...row,
    spc_exercise_weeks: [...row.spc_exercise_weeks].sort((a, b) => a.week_number - b.week_number),
  }));
}

// Inserts the base exercise row, then batch-inserts week 1..blockLengthWeeks
// rows. Week 1 is pre-filled from the client's most recent log for this
// exact exercise when one exists (spec: "pre-filled with the client's most
// recent log if one exists"), otherwise the 3x10 default — same fallback
// getMostRecentLog was written for in Phase 2 but never had a caller until
// now, since SPC blocks (unlike group blocks) have one determinate member.
export async function addSpcWorkoutExercise({ workoutId, exerciseId, position, blockLengthWeeks, userId, notes }) {
  const { data: exerciseRow, error: exerciseError } = await programming
    .from("spc_workout_exercises")
    .insert({ spc_workout_id: workoutId, exercise_id: exerciseId, position, notes: notes ?? null })
    .select("*, exercises(id, name, muscle_group, video_url)")
    .single();
  if (exerciseError) throw exerciseError;

  const recentLog = userId ? await getMostRecentLog(userId, exerciseId) : null;
  const week1Sets = recentLog?.sets ?? 3;
  const week1Reps = recentLog ? String(recentLog.reps) : "10";

  const weekRows = [];
  for (let week = 1; week <= blockLengthWeeks; week += 1) {
    weekRows.push({
      spc_workout_exercise_id: exerciseRow.id,
      week_number: week,
      sets: week === 1 ? week1Sets : null,
      reps: week === 1 ? week1Reps : null,
      rest: null,
    });
  }
  const { data: weeks, error: weeksError } = await programming
    .from("spc_exercise_weeks")
    .insert(weekRows)
    .select("*");
  if (weeksError) throw weeksError;

  return { ...exerciseRow, spc_exercise_weeks: weeks.sort((a, b) => a.week_number - b.week_number) };
}

export async function updateSpcWorkoutExercise(id, fields) {
  const { error } = await programming.from("spc_workout_exercises").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeSpcWorkoutExercise(id) {
  const { error } = await programming.from("spc_workout_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderSpcWorkoutExercises(items) {
  await Promise.all(
    items.map((item) => programming.from("spc_workout_exercises").update({ position: item.position }).eq("id", item.id))
  );
}

function initialsFor(name) {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// Stamps coach_initials/touched_date alongside whatever sets/reps/rest field
// changed — this is what "tracking when it was last touched" means for the
// print template, not a manual-entry field.
export async function updateSpcExerciseWeek(id, fields, editorName) {
  const { error } = await programming
    .from("spc_exercise_weeks")
    .update({ ...fields, coach_initials: initialsFor(editorName), touched_date: todayInBoise() })
    .eq("id", id);
  if (error) throw error;
}

export async function setSpcWorkoutStatus(workoutId, status) {
  const { error } = await programming
    .from("spc_workouts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}

// "Copy Last Block" — copies warm-ups and exercises (position/notes) per
// matching session_number from the prior block into the new one. Week
// columns are left blank in the new block on purpose: copying stale
// sets/reps/rest numbers forward as if they were this block's progression
// would be actively wrong, not just unhelpful.
export async function copyLastBlockContent(fromBlockId, toBlockId, blockLengthWeeks) {
  const [{ data: fromWorkouts, error: fromError }, { data: toWorkouts, error: toError }] = await Promise.all([
    programming.from("spc_workouts").select("id, session_number").eq("spc_block_id", fromBlockId),
    programming.from("spc_workouts").select("id, session_number").eq("spc_block_id", toBlockId),
  ]);
  if (fromError) throw fromError;
  if (toError) throw toError;

  for (const toWorkout of toWorkouts) {
    const fromWorkout = fromWorkouts.find((w) => w.session_number === toWorkout.session_number);
    if (!fromWorkout) continue;

    const [{ data: warmups, error: warmupsError }, { data: exercises, error: exercisesError }] = await Promise.all([
      programming.from("spc_workout_warmups").select("*").eq("spc_workout_id", fromWorkout.id).order("position"),
      programming.from("spc_workout_exercises").select("*").eq("spc_workout_id", fromWorkout.id).order("position"),
    ]);
    if (warmupsError) throw warmupsError;
    if (exercisesError) throw exercisesError;

    if (warmups.length) {
      const { error } = await programming.from("spc_workout_warmups").insert(
        warmups.map((w) => ({
          spc_workout_id: toWorkout.id,
          exercise_id: w.exercise_id,
          position: w.position,
          label: w.label,
          sets: w.sets,
          reps: w.reps,
          notes: w.notes,
        }))
      );
      if (error) throw error;
    }

    for (const ex of exercises) {
      const { data: newExercise, error: newExerciseError } = await programming
        .from("spc_workout_exercises")
        .insert({ spc_workout_id: toWorkout.id, exercise_id: ex.exercise_id, position: ex.position, notes: ex.notes })
        .select()
        .single();
      if (newExerciseError) throw newExerciseError;

      const weekRows = [];
      for (let week = 1; week <= blockLengthWeeks; week += 1) {
        weekRows.push({ spc_workout_exercise_id: newExercise.id, week_number: week });
      }
      const { error: weeksError } = await programming.from("spc_exercise_weeks").insert(weekRows);
      if (weeksError) throw weeksError;
    }
  }
}
