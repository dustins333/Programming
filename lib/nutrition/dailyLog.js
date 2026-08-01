import { nutrition } from "../supabase/client";

const MACRO_FIELDS = ["protein_g", "carb_g", "fat_g", "fiber_g"];

function orNull(value) {
  return value === "" || value === undefined ? null : value;
}

function buildRow(userId, date, values) {
  return {
    user_id: userId,
    log_date: date,
    weight: orNull(values.weight),
    protein_g: orNull(values.protein_g),
    carb_g: orNull(values.carb_g),
    fat_g: orNull(values.fat_g),
    fiber_g: orNull(values.fiber_g),
    steps: orNull(values.steps),
    sleep_hours: orNull(values.sleep_hours),
    sleep_quality: orNull(values.sleep_quality),
    hunger: orNull(values.hunger),
    energy: orNull(values.energy),
    client_note: orNull(values.client_note),
  };
}

export async function listLogs(userId, { limit = 60 } = {}) {
  const { data, error } = await nutrition
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// One query for a Monday-Sunday span — the My Week overview's nutrition
// strip needs all 7 days' finalized state at once, not 7 separate
// getLogForDate round-trips.
export async function listLogsForDateRange(userId, startDate, endDate) {
  const { data, error } = await nutrition
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("log_date", startDate)
    .lte("log_date", endDate);
  if (error) throw error;
  return data;
}

export async function getLogForDate(userId, date) {
  const { data, error } = await nutrition
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("log_date", date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Autosave: persists whatever's filled in so far, blank fields coerced to
// null rather than rejected — never requires macros to be present. This is
// the fix for the source app's original NOT NULL macro columns, which
// silently broke autosave whenever a client filled in weight/sleep before
// macros.
export async function saveDraftLog(userId, date, values) {
  const { data, error } = await nutrition
    .from("daily_logs")
    .upsert(buildRow(userId, date, values), { onConflict: "user_id,log_date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Finalize is the only place the "all 4 macros present" rule is enforced —
// a soft {error} return rather than a thrown exception, since a blank field
// is an expected, recoverable input state, not a system failure. Re-callable:
// finalizing again just re-stamps finalized_at and re-saves current values.
export async function finalizeLog(userId, date, values) {
  const missing = MACRO_FIELDS.some((field) => orNull(values[field]) === null);
  if (missing) {
    return { error: "Enter protein, carb, fat, and fiber before finalizing the day." };
  }

  const { data, error } = await nutrition
    .from("daily_logs")
    .upsert(
      { ...buildRow(userId, date, values), finalized_at: new Date().toISOString() },
      { onConflict: "user_id,log_date" }
    )
    .select()
    .single();
  if (error) throw error;
  return { data };
}
