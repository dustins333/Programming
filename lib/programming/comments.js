import { programming, core } from "../supabase/client";

// program_comments.coach_id references core.users, a different schema —
// not relying on PostgREST's cross-schema FK embedding here (untested/
// uncertain in this setup), so names are fetched separately and merged.
//
// Targets exactly one of a group_block or an spc_block (matches the
// program_comments_one_target check constraint added in 0006).
export async function listComments({ groupBlockId, spcBlockId }) {
  let query = programming.from("program_comments").select("*").order("created_at");
  query = groupBlockId ? query.eq("group_block_id", groupBlockId) : query.eq("spc_block_id", spcBlockId);
  const { data: comments, error } = await query;
  if (error) throw error;
  if (!comments.length) return [];

  const coachIds = [...new Set(comments.map((c) => c.coach_id))];
  const { data: coaches, error: coachesError } = await core.from("users").select("id, name").in("id", coachIds);
  if (coachesError) throw coachesError;

  const nameById = Object.fromEntries(coaches.map((c) => [c.id, c.name]));
  return comments.map((c) => ({ ...c, coachName: nameById[c.coach_id] ?? "Coach" }));
}

export async function addComment({ groupBlockId, spcBlockId, coachId, commentText }) {
  const { data, error } = await programming
    .from("program_comments")
    .insert({
      group_block_id: groupBlockId ?? null,
      spc_block_id: spcBlockId ?? null,
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
