import { programming } from "../supabase/client";

// Coach-private notes and training limitations for one client (migration
// 0057). Staff-only in every direction — a member has no policy on either
// table at all, not even select. These are the coach's working notes, not
// something written for the client to read.
//
// Deliberately not merged into program_comments (block-scoped, and a goal
// like "225 squat by December" outlives any block) or client_messages
// (a conversation *with* the client).

// --- Notes -------------------------------------------------------------

// Pinned first, then newest first. Coach names are resolved by the caller
// from listCoaches() rather than embedded — programming.client_notes
// references core.users across schemas, and this codebase avoids
// cross-schema PostgREST embeds by convention.
export async function listClientNotes(userId) {
  const { data, error } = await programming
    .from("client_notes")
    .select("*")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addClientNote(userId, authorId, body) {
  const { data, error } = await programming
    .from("client_notes")
    .insert({ user_id: userId, author_id: authorId, body: body.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClientNote(noteId, fields) {
  const { error } = await programming
    .from("client_notes")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) throw error;
}

export async function deleteClientNote(noteId) {
  const { error } = await programming.from("client_notes").delete().eq("id", noteId);
  if (error) throw error;
}

// --- Limitations -------------------------------------------------------

export const SEVERITIES = [
  { key: "avoid", label: "Avoid", hint: "A hard no — don't program it" },
  { key: "caution", label: "Caution", hint: "Programmable, but watch it" },
];

// Rust for avoid, amber for caution — the same two-tone split the design
// uses, kept here so every surface showing a limitation (client detail, the
// SPC builder rail) colours it identically.
export const SEVERITY_STYLE = {
  avoid: { bg: "#fdece5", text: "#b23a22" },
  caution: { bg: "#fbf0dd", text: "#8a6d3b" },
};

export async function listClientLimitations(userId) {
  const { data, error } = await programming
    .from("client_limitations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addClientLimitation(userId, createdBy, { area, guidance, severity }) {
  const { data, error } = await programming
    .from("client_limitations")
    .insert({ user_id: userId, created_by: createdBy, area: area.trim(), guidance: guidance.trim(), severity })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClientLimitation(limitationId) {
  const { error } = await programming.from("client_limitations").delete().eq("id", limitationId);
  if (error) throw error;
}
