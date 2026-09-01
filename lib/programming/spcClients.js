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
export async function setSpcStatus(userId, status) {
  const { error } = await programming.from("spc_clients").update({ status }).eq("user_id", userId);
  if (error) throw error;
}

// Free-form patch for notes/goals/feedback, coach reassignment, sessions/week
// — whatever subset of fields the caller passes.
export async function updateSpcClient(userId, fields) {
  const { error } = await programming.from("spc_clients").update(fields).eq("user_id", userId);
  if (error) throw error;
}
