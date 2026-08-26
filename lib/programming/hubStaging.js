import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";

// Staging: a coach builds tomorrow's board tonight, on their phone, and the
// wall becomes PIN → tap "5:00 (4)" → go. See migration 0090 for the data
// model, and in particular why a staged slot stores a SESSION NUMBER rather
// than an spc_workouts row (the block's week rolls over between staging and
// 5am; the workout is resolved at start).
//
// Everything here is the coach's own groups, under their own login — RLS
// scopes every read and write to coach_id = auth.uid(). The wall's side of
// this goes through the PIN-verified RPCs at the bottom instead, because the
// display account has no policy on these tables at all.

const WITH_CLIENTS = "*, hub_staged_clients(*)";

function shape(row) {
  if (!row) return null;
  const clients = [...(row.hub_staged_clients ?? [])].sort((a, b) => a.position - b.position);
  return { ...row, clients };
}

// Today and anything staged ahead, newest morning last. Started groups drop
// out — once it has run it is a hub_session, and the roster is the record.
export async function listMyStagedSessions(coachId, today = todayInBoise()) {
  if (!coachId) return [];
  const { data, error } = await programming
    .from("hub_staged_sessions")
    .select(WITH_CLIENTS)
    .eq("coach_id", coachId)
    .is("started_at", null)
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .order("scheduled_time");
  if (error) throw error;
  return (data ?? []).map(shape);
}

// The one group still being built, if there is one. A partial unique index
// (0090) guarantees at most one per coach, which is what makes "pick up where
// I left off" unambiguous when the roster reopens.
export async function getMyDraftStagedSession(coachId) {
  if (!coachId) return null;
  const { data, error } = await programming
    .from("hub_staged_sessions")
    .select(WITH_CLIENTS)
    .eq("coach_id", coachId)
    .is("finalized_at", null)
    .is("started_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return shape(data);
}

export async function getStagedSession(id) {
  if (!id) return null;
  const { data, error } = await programming.from("hub_staged_sessions").select(WITH_CLIENTS).eq("id", id).maybeSingle();
  if (error) throw error;
  return shape(data);
}

export async function createStagedSession({ coachId, coachName = null, scheduledDate, scheduledTime, title = null }) {
  const { data, error } = await programming
    .from("hub_staged_sessions")
    .insert({
      coach_id: coachId,
      coach_name: coachName,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      title,
    })
    .select(WITH_CLIENTS)
    .single();
  if (error) throw error;
  return shape(data);
}

export async function updateStagedSession(id, fields) {
  const { error } = await programming.from("hub_staged_sessions").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteStagedSession(id) {
  const { error } = await programming.from("hub_staged_sessions").delete().eq("id", id);
  if (error) throw error;
}

// Finalizing is what makes a group visible on the wall. It is not a lock —
// see migration 0090 — so editing one afterwards is just another write, and
// emptying it is what takes it back off the board.
export async function finalizeStagedSession(id) {
  await updateStagedSession(id, { finalized_at: new Date().toISOString() });
}

export async function unfinalizeStagedSession(id) {
  await updateStagedSession(id, { finalized_at: null });
}

// Takes the lowest free slot, so removing someone from the middle and adding
// another doesn't renumber the rest (positions 1,3,4 are fine — the board
// renders whatever rows exist, in order).
export async function addStagedClient(stagedId, { userId, name, sessionNumber }, existing = []) {
  const taken = new Set(existing.map((c) => c.position));
  let position = 1;
  while (taken.has(position) && position <= 4) position += 1;
  if (position > 4) throw new Error("A session holds four clients.");
  const { error } = await programming.from("hub_staged_clients").insert({
    staged_session_id: stagedId,
    user_id: userId,
    client_name: name,
    session_number: sessionNumber,
    position,
  });
  if (error) throw error;
}

export async function removeStagedClient(stagedId, userId) {
  const { error } = await programming
    .from("hub_staged_clients")
    .delete()
    .eq("staged_session_id", stagedId)
    .eq("user_id", userId);
  if (error) throw error;
}

// What each staged slot means on a given day: the workout row it resolves
// to, or the reason it resolves to nothing. Pass the group's OWN date — a
// group staged on Sunday for Monday spans a block-week boundary, and graded
// against today it would warn about the wrong week (0091). The wall passes
// nothing, because a session starting now runs today.
export async function resolveStagedSession(id, onDate = null) {
  const { data, error } = await programming.rpc("hub_resolve_staged", { p_staged_id: id, p_on_date: onDate });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.client_name,
    sessionNumber: r.session_number,
    spcWorkoutId: r.spc_workout_id,
    weekNumber: r.week_number,
    reason: r.reason,
    resolvable: Boolean(r.spc_workout_id),
  }));
}

// Starts it. `pin` only when the WALL is asking — the coach's own phone is
// already signed in. Returns { sessionId, started[], skipped[] }: a group
// where one of four can't run starts the other three and names who dropped.
export async function startStagedSession(id, pin = null) {
  const { data, error } = await programming.rpc("hub_start_staged", { p_staged_id: id, p_pin: pin });
  if (error) throw error;
  return data;
}

// The wall, after a PIN: that coach's finalized groups for today.
export async function listStagedForPin(pin) {
  const { data, error } = await programming.rpc("hub_staged_for_pin", { p_pin: pin });
  if (error) throw error;
  return data ?? [];
}

// "Lauren has 6:00 staged — start it?" straight after a session ends at the
// wall. A count, not the groups: starting still needs the PIN.
export async function stagedCountForCoach(coachId) {
  if (!coachId) return 0;
  const { data, error } = await programming.rpc("hub_staged_count_for_coach", { p_coach_id: coachId });
  if (error) throw error;
  return data ?? 0;
}
