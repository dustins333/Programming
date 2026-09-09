import { programming } from "../supabase/client";

// Free-text tabs on a week of the Weeks tab (migration 0125). "Mexico
// trip", "family vacation", "sick Tue-Thu" — whatever explains why a week
// reads the way it does, so a coach scanning the list can see what was
// going on without opening anything.
//
// Deliberately its own table rather than another column on
// nutrition_week_phases: a phase marker is a RUN that holds until the next
// change, while a note is about one week and nothing else. Writing a note
// into that table would create a phase marker on the week, silently ending
// whatever phase was running. See the migration header for the rest.
//
// Several notes per week are allowed, so these are keyed by a plain id.

export async function listWeekNotes(userId) {
  const { data, error } = await programming
    .from("nutrition_week_notes")
    .select("*")
    .eq("user_id", userId)
    .order("week_start")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function addWeekNote(userId, weekStart, label, createdBy) {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) throw new Error("A note needs a label.");
  const { data, error } = await programming
    .from("nutrition_week_notes")
    .insert({ user_id: userId, week_start: weekStart, label: trimmed, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Asks for the row back and throws when none comes: an UPDATE that RLS
// filters out affects zero rows and returns NO error, so without this a
// blocked write reports success and the change quietly springs back on the
// next load.
export async function updateWeekNote(id, label) {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) throw new Error("A note needs a label.");
  const { data, error } = await programming
    .from("nutrition_week_notes")
    .update({ label: trimmed })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("That note could not be updated.");
}

export async function deleteWeekNote(id) {
  const { error } = await programming.from("nutrition_week_notes").delete().eq("id", id);
  if (error) throw error;
}

// --- pure helper ------------------------------------------------------

// Notes grouped by the week they sit on, so a row can look up its own in
// one indexed read rather than filtering the whole list per week.
export function groupNotesByWeek(notes) {
  const byWeek = {};
  for (const note of notes ?? []) {
    if (!byWeek[note.week_start]) byWeek[note.week_start] = [];
    byWeek[note.week_start].push(note);
  }
  return byWeek;
}
