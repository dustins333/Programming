import { programming } from "../supabase/client";
import { PHASE_COLORS } from "./weekPhases";

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

// A label tab can be colour-coded (migration 0127), sharing the phase
// palette so a colour means the same thing whichever kind of tab it is on.
//
// The one difference from a phase is that NO COLOUR is a real choice here,
// not just an unset value: a plain white tab is what every existing label
// already is, and a coach who does not want to colour-code a particular
// week should be able to leave it that way. So null leads the list rather
// than falling back to the first swatch the way phaseColor() does.
export const NOTE_NEUTRAL = { key: null, label: "None", bg: "white", border: "#e2ddd6", text: "#57534e" };
export const NOTE_COLORS = [NOTE_NEUTRAL, ...PHASE_COLORS];

export function noteColor(key) {
  return NOTE_COLORS.find((c) => c.key === key) ?? NOTE_NEUTRAL;
}

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

export async function addWeekNote(userId, weekStart, label, createdBy, color = null) {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) throw new Error("A note needs a label.");
  const { data, error } = await programming
    .from("nutrition_week_notes")
    .insert({ user_id: userId, week_start: weekStart, label: trimmed, color: color ?? null, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Asks for the row back and throws when none comes: an UPDATE that RLS
// filters out affects zero rows and returns NO error, so without this a
// blocked write reports success and the change quietly springs back on the
// next load.
export async function updateWeekNote(id, label, color = null) {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) throw new Error("A note needs a label.");
  const { data, error } = await programming
    .from("nutrition_week_notes")
    .update({ label: trimmed, color: color ?? null })
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
