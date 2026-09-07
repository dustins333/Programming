import { programming } from "../supabase/client";

export async function getSpcClient(userId) {
  const { data, error } = await programming.from("spc_clients").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// THREE enrolment states (migration 0108), and the difference between the
// last two is the whole reason it exists:
//
//   active    training right now
//   paused    on hold — still an SPC client, still on the SPC roster, because
//             "resume her" is a thing the coach needs reminding of
//   inactive  not an SPC client at all. The switch on her client detail page
//             is off. Off the roster entirely.
//
// A spc_clients row existing is NOT enrolment — the row is kept on the way
// out so her coach, frequency, notes and every program written for her
// survive, and turning the switch back on costs nothing.
//
// isSpcActive is the member-facing gate: does she see SPC content at all.
// Both paused and inactive answer no, which is the same answer both gave
// before 0108.
export function isSpcActive(spcClient) {
  return spcClient?.status === "active";
}

// The coach-facing question instead: is she an SPC client, whatever she is
// doing this week. Drives the enrolment switch and everything under it, so a
// paused client still reads as enrolled rather than as someone who was never
// signed up.
export function isSpcEnrolled(spcClient) {
  return Boolean(spcClient) && spcClient.status !== "inactive";
}

export async function assignSpcClient(userId, coachId, sessionsPerWeek = 2) {
  const { error } = await programming
    .from("spc_clients")
    .upsert(
      { user_id: userId, assigned_coach_id: coachId, sessions_per_week: sessionsPerWeek, status: "active" },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}

// 'active' | 'paused' | 'inactive' (0099 narrowed it, 0108 added the third).
// This is the enrolment column, not a lifecycle tracker — everything the old
// five statuses used to say is derived: lib/programming/spcState.js.
// Asks for the touched row back, and treats none as a failure. A plain update
// that RLS filters out affects zero rows and returns NO error, so without this
// the coach gets a success, `load()` refetches, and the switch springs quietly
// back to where it was — which is exactly how a real "I turned it off and it
// didn't take" went unreported. Every call site already toasts on a throw.
export async function setSpcStatus(userId, status) {
  const { data, error } = await programming
    .from("spc_clients")
    .update({ status })
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Nothing was updated — that change did not save. Try again.");
}

// Free-form patch for notes/goals/feedback, coach reassignment, sessions/week
// — whatever subset of fields the caller passes.
export async function updateSpcClient(userId, fields) {
  // Same zero-row guard as setSpcStatus above, for the same reason: a coach
  // reassignment or a sessions-a-week change that RLS filters out comes back
  // clean, so without this it reads as saved right up until the next reload.
  const { data, error } = await programming
    .from("spc_clients")
    .update(fields)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Nothing was updated — that change did not save. Try again.");
}
