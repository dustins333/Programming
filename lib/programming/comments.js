import { programming, core } from "../supabase/client";

// program_comments.coach_id references core.users, a different schema —
// not relying on PostgREST's cross-schema FK embedding here (untested/
// uncertain in this setup), so names are fetched separately and merged.
export async function listComments(groupBlockId) {
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
    .insert({ group_block_id: groupBlockId, coach_id: coachId, comment_text: commentText })
    .select()
    .single();
  if (error) throw error;
  return data;
}
