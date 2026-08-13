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

// Same as effectiveCalories, but tells "logged nothing" apart from "logged
// zero". A daily_logs row can exist with only a weight on it, and deriving 0
// calories from three null macros would both render as a real 0 in the week
// table and drag that week's average down. Returns null instead, so the cell
// shows "—" and the average skips the day exactly like every other unlogged
// metric does.
export function loggedCalories(log) {
  if (log.calories_override !== null && log.calories_override !== undefined) return Number(log.calories_override);
  const hasMacros = [log.protein_g, log.carb_g, log.fat_g].some((v) => v !== null && v !== undefined);
  return hasMacros ? deriveCalories(log) : null;
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

// The fields a target change can move, in the order a coach reads them.
// Calories are included even though they are never stored (see
// deriveCalories) — a macro change that moves the calorie total is exactly
// what a coach is looking for in the history, and leaving it out would make
// "Carbs 165 → 180 g" look like it happened in isolation.
const TARGET_FIELDS = [
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carb_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "fiber_g", label: "Fiber", unit: "g" },
  { key: "calories", label: "Calories", unit: "" },
  { key: "step_goal", label: "Steps", unit: "" },
  { key: "sleep_hours_goal", label: "Sleep", unit: "h" },
  { key: "weight_target", label: "Weight target", unit: "lb" },
];

function fieldValue(target, key) {
  if (key === "calories") return Math.round(deriveCalories(target));
  const v = target[key];
  return v === null || v === undefined ? null : Number(v);
}

function formatNumber(n) {
  return n >= 1000 ? n.toLocaleString() : String(n);
}

// What moved between one target row and the one before it — the Targets
// tab's history column, and the "TARGETS CHANGED" divider the Weeks tab
// draws between the weeks a change took effect.
//
// `previous` is null for the very first target a client ever gets, which is
// not a change at all — that reads as "Set at 2,050 kcal" rather than a list
// of arrows from nothing.
export function diffTargets(target, previous) {
  if (!target) return [];
  if (!previous) {
    return [{ key: "initial", label: "Set at", text: `Set at ${formatNumber(fieldValue(target, "calories"))} kcal` }];
  }
  const changes = [];
  for (const field of TARGET_FIELDS) {
    const to = fieldValue(target, field.key);
    const from = fieldValue(previous, field.key);
    if (to === from) continue;
    // A goal being added or cleared is a real change worth showing, but
    // "— → 9,000" reads better than pretending the old value was zero.
    const fromText = from === null ? "—" : formatNumber(from);
    const toText = to === null ? "—" : formatNumber(to);
    const unit = field.unit ? ` ${field.unit}` : "";
    changes.push({ key: field.key, label: field.label, from, to, text: `${field.label} ${fromText} → ${toText}${unit}` });
  }
  return changes;
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
