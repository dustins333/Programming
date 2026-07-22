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
