import { programming } from "../supabase/client";

// SPC Live Session Hub data layer (migration 0071). A hub session is one
// gym-floor block of time: a coach picks up to 4 SPC clients + which session
// each is doing; the wall display and the coach's phone both render it live.
// Open session = ended_at is null; the DB guarantees at most one open at a
// time (partial unique index), so "the open session" is a well-defined thing
// to poll for.

// slots: [{ userId, clientName, spcWorkoutId, weekNumber }] (1-4 entries).
// Ends any open session first — starting a new one is also the "take over"
// action. Only staff can call this (RLS: the display account has no write
// policies on hub tables).
export async function startHubSession({ coachId, slots }) {
  const { error: endError } = await programming
    .from("hub_sessions")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null);
  if (endError) throw endError;

  const { data: session, error } = await programming
    .from("hub_sessions")
    .insert({ coach_id: coachId })
    .select()
    .single();
  if (error) throw error;

  const rows = slots.map((slot, i) => ({
    hub_session_id: session.id,
    user_id: slot.userId,
    client_name: slot.clientName,
    spc_workout_id: slot.spcWorkoutId,
    week_number: slot.weekNumber,
    position: i + 1,
  }));
  const { data: clients, error: clientsError } = await programming
    .from("hub_session_clients")
    .insert(rows)
    .select();
  if (clientsError) throw clientsError;

  return { session, clients: [...clients].sort((a, b) => a.position - b.position) };
}

// The one open session (or null), with its client slots sorted by position.
export async function getOpenHubSession() {
  const { data, error } = await programming
    .from("hub_sessions")
    .select("*, hub_session_clients(*)")
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(1) // .maybeSingle() throws on 2+ rows; the partial index should make that impossible, but guard anyway
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const clients = [...(data.hub_session_clients ?? [])].sort((a, b) => a.position - b.position);
  return { ...data, clients };
}

// Ends the open session. Goes through the hub_end_session RPC rather than a
// direct update so the DISPLAY account can also end from the TV — it has no
// UPDATE policy on hub_sessions (a policy can't be limited to one column).
export async function endHubSession() {
  const { error } = await programming.rpc("hub_end_session");
  if (error) throw error;
}

// Reorder a hub session's lifts (equipment conflicts). RPC because the
// display account must be able to move positions without an update policy
// that would also let it edit reps/sets. items: [{ id, position }].
export async function reorderHubExercises(spcWorkoutId, items) {
  const { error } = await programming.rpc("hub_reorder_exercises", {
    p_spc_workout_id: spcWorkoutId,
    p_items: items.map(({ id, position }) => ({ id, position })),
  });
  if (error) throw error;
}

// Warm-ups for every slot, fetched ONCE at session load (not per poll —
// warm-ups don't change mid-session). Map<spcWorkoutId, warmup rows> with
// the joined exercise for default sets/reps fallback, sorted by position.
export async function fetchHubWarmups(slots) {
  const workoutIds = slots.map((s) => s.spc_workout_id);
  if (workoutIds.length === 0) return new Map();
  const { data, error } = await programming
    .from("spc_workout_warmups")
    .select("*, exercises(id, name, default_sets, default_reps)")
    .in("spc_workout_id", workoutIds)
    .order("position");
  if (error) throw error;
  const byWorkout = new Map();
  for (const row of data ?? []) {
    if (!byWorkout.has(row.spc_workout_id)) byWorkout.set(row.spc_workout_id, []);
    byWorkout.get(row.spc_workout_id).push(row);
  }
  return byWorkout;
}

// The 3-second poll. Five bounded queries regardless of client count:
// structure, logs, exercise completions, session completions, coaching
// notes. Logs are matched purely on spc_workout_id — session-stamped since
// 0063, and every live write (member phone, coach phone, TV) stamps the
// session, so nothing written during the session can be missed.
//
// Returns Map<userId, {
//   spcWorkoutId, weekNumber, clientName, title,
//   items,                 // member-plan item shape + spcWorkoutExerciseId — so
//                          // schemeLabel/summarizeSets/coachNoteFor/supersetLettersFor
//                          // all work unmodified
//   logsByExerciseId,      // Map<exerciseId, log rows sorted by set_number>
//   completedItemIds,      // Set<spc_workout_exercises.id>
//   finalized,             // bool (session_completions row exists)
//   latestNoteByExerciseId // Map<exerciseId, coaching note row> (null key = general note)
// }>
export async function fetchHubBoard(slots) {
  const workoutIds = slots.map((s) => s.spc_workout_id);
  const userIds = slots.map((s) => s.user_id);
  if (workoutIds.length === 0) return new Map();

  const [structureRes, workoutsRes, logsRes, sessionCompRes, notesRes] = await Promise.all([
    programming
      .from("spc_workout_exercises")
      .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight)")
      .in("spc_workout_id", workoutIds)
      .order("position"),
    programming.from("spc_workouts").select("id, title, session_number, week_number").in("id", workoutIds),
    programming
      .from("logs")
      .select("*")
      .in("spc_workout_id", workoutIds)
      .order("set_number"),
    programming
      .from("session_completions")
      .select("user_id, spc_workout_id, week_number, completed_at")
      .in("spc_workout_id", workoutIds),
    programming
      .from("exercise_coaching_notes")
      .select("*")
      .in("user_id", userIds)
      .order("created_at", { ascending: false }),
  ]);
  for (const res of [structureRes, workoutsRes, logsRes, sessionCompRes, notesRes]) {
    if (res.error) throw res.error;
  }

  // Exercise completions need the join-row ids from the structure query.
  const itemIds = (structureRes.data ?? []).map((r) => r.id);
  let exerciseCompRows = [];
  if (itemIds.length > 0) {
    const { data, error } = await programming
      .from("exercise_completions")
      .select("user_id, spc_workout_exercise_id, week_number")
      .in("spc_workout_exercise_id", itemIds);
    if (error) throw error;
    exerciseCompRows = data ?? [];
  }

  const workoutMeta = new Map((workoutsRes.data ?? []).map((w) => [w.id, w]));

  const board = new Map();
  for (const slot of slots) {
    const structure = (structureRes.data ?? []).filter((r) => r.spc_workout_id === slot.spc_workout_id);
    // Same item shape app/(member)/plan.js builds for SessionLogger, plus the
    // join-row id (needed for completions + reorder).
    const items = structure.map((ex) => ({
      id: ex.id,
      spcWorkoutExerciseId: ex.id,
      position: ex.position,
      exercise: ex.exercises,
      targetSets: ex.sets,
      targetReps: ex.reps,
      repScheme: ex.rep_scheme,
      supersetGroupId: ex.superset_group_id,
      tempo: ex.tempo,
      rest: ex.rest,
      notes: ex.notes,
    }));

    const logsByExerciseId = new Map();
    for (const row of logsRes.data ?? []) {
      if (row.spc_workout_id !== slot.spc_workout_id || row.user_id !== slot.user_id) continue;
      if (!logsByExerciseId.has(row.exercise_id)) logsByExerciseId.set(row.exercise_id, []);
      logsByExerciseId.get(row.exercise_id).push(row);
    }

    const itemIdSet = new Set(items.map((i) => i.id));
    const completedItemIds = new Set(
      exerciseCompRows
        .filter((r) => r.user_id === slot.user_id && itemIdSet.has(r.spc_workout_exercise_id))
        .map((r) => r.spc_workout_exercise_id)
    );

    const finalized = (sessionCompRes.data ?? []).some(
      (r) => r.user_id === slot.user_id && r.spc_workout_id === slot.spc_workout_id
    );

    const latestNoteByExerciseId = new Map();
    for (const note of notesRes.data ?? []) {
      if (note.user_id !== slot.user_id) continue;
      if (!latestNoteByExerciseId.has(note.exercise_id)) latestNoteByExerciseId.set(note.exercise_id, note);
    }

    const meta = workoutMeta.get(slot.spc_workout_id);
    board.set(slot.user_id, {
      spcWorkoutId: slot.spc_workout_id,
      weekNumber: slot.week_number,
      clientName: slot.client_name,
      title: meta?.title ?? null,
      sessionNumber: meta?.session_number ?? null,
      items,
      logsByExerciseId,
      completedItemIds,
      finalized,
      latestNoteByExerciseId,
    });
  }
  return board;
}
