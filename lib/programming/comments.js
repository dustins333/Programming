import { programming, core } from "../supabase/client";

// program_comments.coach_id references core.users, a different schema —
// not relying on PostgREST's cross-schema FK embedding here (untested/
// uncertain in this setup), so names are fetched separately and merged.
//
// GROUP BLOCKS ONLY, as of 2026-09-08. The table still carries an
// `spc_block_id` and 11 rows written against it, and the 0006 check
// constraint still allows either target — but nothing in the app reads or
// writes the SPC side any more. The coaches asked for one note about a
// client (KEEP IN MIND) and one about a lift (the builder's EXERCISE NOTE),
// not a third scoped to a block. A group block is shared across a whole
// program, so it has no client whose KEEP IN MIND could carry a note about
// it — which is why the thread survives here and nowhere else.
//
// The parameter is `groupBlockId` rather than a generic id on purpose: a
// caller cannot pass an spc block id by accident, and reintroducing SPC
// notes has to be a deliberate edit to this file.
export async function listComments({ groupBlockId }) {
  const { data: comments, error } = await programming
    .from("program_comments")
    .select("*")
    .eq("group_block_id", groupBlockId)
    .order("created_at");
  if (error) throw error;
  if (!comments.length) return [];

  const coachIds = [...new Set(comments.map((c) => c.coach_id))];
  const { data: coaches, error: coachesError } = await core.from("users").select("id, name").in("id", coachIds);
  if (coachesError) throw coachesError;

  const nameById = Object.fromEntries(coaches.map((c) => [c.id, c.name]));
  return comments.map((c) => ({ ...c, coachName: nameById[c.coach_id] ?? "Coach" }));
}

export async function addComment({ groupBlockId, coachId, commentText }) {
  const { data, error } = await programming
    .from("program_comments")
    .insert({
      group_block_id: groupBlockId,
      spc_block_id: null,
      coach_id: coachId,
      comment_text: commentText,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Edit / remove an existing note. RLS already permits both — 0004's
// "staff manage program_comments" is a plain `for all` — so no migration was
// needed to make the notes card editable.
//
// Editing is deliberately restricted to the note's own author at the UI layer
// (see components/CommentThread.js): a note renders with a coach's name on it,
// so letting anyone rewrite the text under someone else's name would be a
// misattribution the reader has no way to spot. Deleting is open to any coach,
// since a stale note nobody needs is worth clearing whoever wrote it.
export async function updateComment(id, commentText) {
  const { error } = await programming.from("program_comments").update({ comment_text: commentText }).eq("id", id);
  if (error) throw error;
}

export async function deleteComment(id) {
  const { error } = await programming.from("program_comments").delete().eq("id", id);
  if (error) throw error;
}
