import { programming } from "../supabase/client";

// Coach education notes — see supabase/migrations/0079_session_education.sql
// for why these are keyed to (block, session_number) rather than to a single
// group_workouts row.
//
// Written in the group builder's right rail, read on the Coach Prep tab.

export async function listSessionEducation(groupBlockId, sessionNumber) {
  const { data, error } = await programming
    .from("session_education")
    .select("*, exercises(id, name)")
    .eq("group_block_id", groupBlockId)
    .eq("session_number", sessionNumber)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return data;
}

// One query for a whole block, keyed by session number — the Coach Prep page
// renders every session of a block, and a fetch per session tab would be a
// round trip every time a coach tapped between them.
export async function listSessionEducationForBlock(groupBlockId) {
  const { data, error } = await programming
    .from("session_education")
    .select("*, exercises(id, name)")
    .eq("group_block_id", groupBlockId)
    .order("session_number")
    .order("position")
    .order("created_at");
  if (error) throw error;
  const bySession = {};
  for (const row of data) (bySession[row.session_number] ??= []).push(row);
  return bySession;
}

export async function createSessionEducation({ groupBlockId, sessionNumber, position = 0, createdBy = null }) {
  const { data, error } = await programming
    .from("session_education")
    .insert({
      group_block_id: groupBlockId,
      session_number: sessionNumber,
      position,
      created_by: createdBy,
    })
    .select("*, exercises(id, name)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSessionEducation(id, fields) {
  const { error } = await programming
    .from("session_education")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSessionEducation(id) {
  const { error } = await programming.from("session_education").delete().eq("id", id);
  if (error) throw error;
}

// Renumbers the whole list 1..N in the order the rail displays it. Positions
// are written for every row, not just the moved one — same shape as
// reorderWorkoutExercises, and it throws on any row's error, since a silent
// half-applied reorder reverts on the next load and looks like the drag
// simply didn't take.
export async function reorderSessionEducation(items) {
  const results = await Promise.all(
    items.map((item) => programming.from("session_education").update({ position: item.position }).eq("id", item.id))
  );
  for (const { error } of results) if (error) throw error;
}
