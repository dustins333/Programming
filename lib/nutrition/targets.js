import { supabase } from "../supabase/client";

// Calories are never stored — always derived from macros (Atwater factors)
// so a coach can never enter a calorie figure that doesn't match the macros
// next to it. Same convention the standalone app uses.
export function deriveCalories({ protein_g, carb_g, fat_g }) {
  return 4 * (protein_g || 0) + 4 * (carb_g || 0) + 9 * (fat_g || 0);
}

// A day's "real" calorie figure: the manually-entered Cronometer total wins
// when present (a client's own app almost always has better data than the
// Atwater-factor estimate), otherwise falls back to the macro-derived value.
export function effectiveCalories(log) {
  return log.calories_override !== null && log.calories_override !== undefined ? Number(log.calories_override) : deriveCalories(log);
}

// Insert-only, never updated — every coach edit is a brand new row, and
// "current" is derived by querying (see getCurrentTarget) rather than
// stored on an in-place-edited row.
export async function createTarget({
  userId,
  setBy,
  proteinG,
  carbG,
  fatG,
  fiberG,
  weightTarget,
  stepGoal,
  sleepHoursGoal,
  effectiveDate,
  note,
}) {
  const { data, error } = await supabase
    .from("targets")
    .insert({
      client_id: userId,
      set_by: setBy,
      protein_g: proteinG,
      carb_g: carbG,
      fat_g: fatG,
      fiber_g: fiberG,
      weight_target: weightTarget ?? null,
      step_goal: stepGoal ?? null,
      sleep_hours_goal: sleepHoursGoal ?? null,
      effective_date: effectiveDate,
      note: note || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listTargets(userId) {
  const { data, error } = await supabase
    .from("targets")
    .select("*")
    .eq("client_id", userId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Resolves which versioned target row was in effect on a given date: most
// recent effective_date <= date, ties broken by most recently created.
export async function getCurrentTarget(userId, date) {
  const { data, error } = await supabase
    .from("targets")
    .select("*")
    .eq("client_id", userId)
    .lte("effective_date", date)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
