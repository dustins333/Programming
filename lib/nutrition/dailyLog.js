import { supabase } from "../supabase/client";

function orNull(value) {
  return value === "" || value === undefined ? null : value;
}

function buildRow(userId, date, values) {
  return {
    client_id: userId,
    date,
    weight: orNull(values.weight),
    protein_g: orNull(values.protein_g),
    carb_g: orNull(values.carb_g),
    fat_g: orNull(values.fat_g),
    fiber_g: orNull(values.fiber_g),
    calories_override: orNull(values.calories_override),
    steps: orNull(values.steps),
    sleep_hours: orNull(values.sleep_hours),
    sleep_quality: orNull(values.sleep_quality),
    hunger: orNull(values.hunger),
    energy: orNull(values.energy),
    client_note: orNull(values.client_note),
  };
}

export async function listLogs(userId, { limit = 60 } = {}) {
  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("client_id", userId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// One query for a Monday-Sunday span — the My Week overview's nutrition
// strip needs all 7 days' finalized state at once, not 7 separate
// getLogForDate round-trips.
export async function listLogsForDateRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("client_id", userId)
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) throw error;
  return data;
}

export async function getLogForDate(userId, date) {
  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("client_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Autosave: persists whatever's filled in so far, blank fields coerced to
// null rather than rejected — never requires macros to be present.
export async function saveDraftLog(userId, date, values) {
  const { data, error } = await supabase
    .from("daily_logs")
    .upsert(buildRow(userId, date, values), { onConflict: "client_id,date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// No required fields — a member can finalize with anything left blank.
// Re-callable: finalizing again just re-stamps finalized_at and re-saves
// current values.
export async function finalizeLog(userId, date, values) {
  const { data, error } = await supabase
    .from("daily_logs")
    .upsert(
      { ...buildRow(userId, date, values), finalized_at: new Date().toISOString() },
      { onConflict: "client_id,date" }
    )
    .select()
    .single();
  if (error) throw error;
  return { data };
}

// Every column a day's row can carry data in. A row with all of these empty
// and no finalized_at holds nothing at all.
const DATA_COLUMNS = [
  "weight", "protein_g", "carb_g", "fat_g", "fiber_g", "calories_override",
  "steps", "sleep_hours", "sleep_quality", "hunger", "energy", "client_note", "coach_note",
];

// A coach correcting (or filling in) one day's weight from the Weeks tab.
// Writes the weight column only: an upsert naming just client_id, date and
// weight merges into an existing row without touching the member's macros,
// notes or finalized state, and creates a weight-only row for a blank day.
// `weight` null clears it.
//
// Clearing the weight on a row that then holds nothing (typically one the
// coach created a moment ago) deletes the row, or the day would go on
// counting as logged in "x of 7". The delete re-checks every column in the
// database rather than trusting what this screen last loaded, so a member
// logging that day in the meantime keeps their row.
export async function setLogWeight(userId, date, weight) {
  const { data, error } = await supabase
    .from("daily_logs")
    .upsert({ client_id: userId, date, weight }, { onConflict: "client_id,date" })
    .select()
    .single();
  if (error) throw error;

  if (weight === null && data.finalized_at === null && DATA_COLUMNS.every((c) => data[c] === null)) {
    let del = supabase.from("daily_logs").delete().eq("id", data.id).is("finalized_at", null);
    for (const c of DATA_COLUMNS) del = del.is(c, null);
    const { error: delError } = await del;
    if (delError) throw delError;
  }
  return data;
}
