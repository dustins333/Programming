import { programming } from "../supabase/client";
import { listClientGoals } from "./clientGoals";
import { todayInBoise } from "../boiseDate";

// SPC Live Session Hub data layer (migration 0071). A hub session is one
// gym-floor block of time: a coach picks up to 4 SPC clients + which session
// each is doing; the wall display and the coach's phone both render it live.
// Open session = ended_at is null; the DB guarantees at most one open at a
// time (partial unique index), so "the open session" is a well-defined thing
// to poll for.

// slots: [{ userId, clientName, spcWorkoutId, weekNumber }] (1-4 entries).
// coachName is snapshotted onto the session for the same reason
// hub_session_clients.client_name is: the display account has no read policy
// on core.users, and it needs a name to attribute the notes it writes.
// Ends any open session first — starting a new one is also the "take over"
// action. Only staff can call this (RLS: the display account has no write
// policies on hub tables).
export async function startHubSession({ coachId, coachName = null, slots }) {
  const { error: endError } = await programming
    .from("hub_sessions")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null);
  if (endError) throw endError;

  const { data: session, error } = await programming
    .from("hub_sessions")
    .insert({ coach_id: coachId, coach_name: coachName })
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
// notes. Logs are matched on spc_workout_id (session-stamped since 0063 —
// every live write from the member phone, the coach phone and the TV stamps
// it, so nothing entered during the session can be missed) AND on today's
// Boise date.
//
// The date half is not optional. An spc_workouts row is one (block, week,
// session), and the same session genuinely gets logged on more than one
// calendar day — a client who trains it twice, a coach re-running it, a
// week revisited. Without the date filter the board pulls every one of
// those days at once, ends up with several rows sharing a set_number, and
// picks between them on whatever order Postgres happens to return. That is
// how a set entered on the phone showed as a different number on the wall
// while its neighbour cleared correctly: per set, it was a coin toss
// between today's row and an older day's (found live 2026-08-23 — DB
// Lateral Raise carried an Aug 18 row and an Aug 23 row for all three
// sets).
//
// todayInBoise() is exactly what saveSets stamps its writes with, so the
// board now reads back precisely what this screen writes.
//
// Returns Map<userId, {
//   spcWorkoutId, weekNumber, clientName, title,
//   items,                 // member-plan item shape + spcWorkoutExerciseId — so
//                          // schemeLabel/summarizeSets/coachNoteFor/supersetLettersFor
//                          // all work unmodified
//   logsByExerciseId,      // Map<exerciseId, log rows sorted by set_number>
//   completedItemIds,      // Set<spc_workout_exercises.id>
//   finalized,             // bool (session_completions row exists)
//   latestNoteByExerciseId, // Map<exerciseId, newest note row> (null key = general note)
//   noteForWeekByExerciseId, // Map<exerciseId, newest note row written THIS week>
//   goal                   // the shared client goal (string) or null
// }>
// One row per set, newest wins, ordered by set number. The date filter above
// should already make duplicates impossible; this is the belt to its braces,
// because every reader downstream (the card's draft, the bubble rows, the
// collapsed summary) resolves a set with a .find() and would silently show
// whichever copy came back first.
function dedupeSets(rows) {
  const bySet = new Map();
  for (const row of rows) {
    const n = row.set_number ?? 1;
    const seen = bySet.get(n);
    if (!seen || (row.created_at ?? "") >= (seen.created_at ?? "")) bySet.set(n, row);
  }
  return [...bySet.values()].sort((a, b) => (a.set_number ?? 1) - (b.set_number ?? 1));
}

export async function fetchHubBoard(slots) {
  const workoutIds = slots.map((s) => s.spc_workout_id);
  const userIds = slots.map((s) => s.user_id);
  if (workoutIds.length === 0) return new Map();
  const today = todayInBoise();

  const [structureRes, workoutsRes, logsRes, sessionCompRes, notesRes] = await Promise.all([
    programming
      .from("spc_workout_exercises")
      .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight, rep_unit)")
      .in("spc_workout_id", workoutIds)
      .order("position"),
    programming.from("spc_workouts").select("id, title, session_number, week_number, spc_block_id").in("id", workoutIds),
    programming
      .from("logs")
      .select("*")
      .in("spc_workout_id", workoutIds)
      .eq("date_performed", today)
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

  // The shared goal, shown next to each client's name on the wall. The
  // display account reaches this through its own hub-active policy (0078).
  // Deliberately not fatal: a goal is decoration on this screen, and the
  // board must keep polling if 0078 hasn't been run yet.
  const goalByUserId = await listClientGoals(userIds).catch(() => new Map());

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
    for (const [exerciseId, rows] of logsByExerciseId) logsByExerciseId.set(exerciseId, dedupeSets(rows));

    const itemIdSet = new Set(items.map((i) => i.id));
    const completedItemIds = new Set(
      exerciseCompRows
        .filter((r) => r.user_id === slot.user_id && itemIdSet.has(r.spc_workout_exercise_id))
        .map((r) => r.spc_workout_exercise_id)
    );

    const finalized = (sessionCompRes.data ?? []).some(
      (r) => r.user_id === slot.user_id && r.spc_workout_id === slot.spc_workout_id
    );

    // Two views of the same rows (newest-first, so first-seen wins):
    //   latestNote…    — the lift's most recent note ever, whatever week it
    //                    was written in. Drives the ✎ marker on a resting row.
    //   noteForWeek…   — THIS week's note for this lift, which is what the
    //                    expanded card's single note field is seeded with.
    // The design's "one note per lift per week" is enforced by reading the
    // newest row for that week rather than by editing in place: the display
    // account has INSERT but no UPDATE on exercise_coaching_notes (0071), so
    // notes are append-only and the newest simply supersedes.
    const latestNoteByExerciseId = new Map();
    const noteForWeekByExerciseId = new Map();
    for (const note of notesRes.data ?? []) {
      if (note.user_id !== slot.user_id) continue;
      if (!latestNoteByExerciseId.has(note.exercise_id)) latestNoteByExerciseId.set(note.exercise_id, note);
      if (note.spc_workout_id === slot.spc_workout_id && !noteForWeekByExerciseId.has(note.exercise_id)) {
        noteForWeekByExerciseId.set(note.exercise_id, note);
      }
    }

    // Catches a note written by a client whose PWA tab is still running the
    // JS from before 0087 — she'd write to logs.notes, and without this the
    // board would show the coach's note on a lift and silently drop hers,
    // which is the half-merged state 0087/0088 exist to end. Everything
    // written before the deploy is already in the shared store (0088
    // backfilled it), so this only catches a stale tab mid-session.
    //
    // Nobody is on the native app as of 2026-08-24, so this is a
    // short-lived-tab guard rather than a build-lag one — but it stays,
    // because a session is exactly when a tab has been open a long time.
    //
    // Never overrides a real shared note: whoever typed in the merged box
    // wins over a stale copy on the log row.
    for (const [exerciseId, rows] of logsByExerciseId) {
      if (noteForWeekByExerciseId.has(exerciseId)) continue;
      const legacy = rows.find((r) => r.notes && r.notes.trim() !== "");
      if (!legacy) continue;
      noteForWeekByExerciseId.set(exerciseId, {
        id: `legacy-${slot.spc_workout_id}-${exerciseId}`,
        exercise_id: exerciseId,
        body: legacy.notes,
        // The member's own log — nobody else has ever written to logs.notes.
        author_name: slot.client_name ?? null,
        created_at: legacy.date_performed,
        spc_workout_id: slot.spc_workout_id,
      });
    }

    const meta = workoutMeta.get(slot.spc_workout_id);
    board.set(slot.user_id, {
      spcWorkoutId: slot.spc_workout_id,
      spcBlockId: meta?.spc_block_id ?? null,
      weekNumber: slot.week_number,
      clientName: slot.client_name,
      title: meta?.title ?? null,
      sessionNumber: meta?.session_number ?? null,
      items,
      logsByExerciseId,
      completedItemIds,
      finalized,
      latestNoteByExerciseId,
      noteForWeekByExerciseId,
      goal: goalByUserId.get(slot.user_id)?.goal ?? null,
    });
  }
  return board;
}

// One lift's history across the CURRENT BLOCK, newest week first — what the
// expanded card's strip shows without a tap ("last week she did 8×65 and
// Georgie said hold 65") and what the dock's history panel expands into.
// Modelled on the paper SPC sheet (app/(coach)/spc/print/[blockId].web.js),
// whose grid is Main Session | Sets | Reps | Rest | Week 1 | Week 2 | …
//
// Lazy — fetched when a lift is expanded, NOT on the 3-second poll, so a
// board with four columns open doesn't re-read a block's worth of logs every
// tick. Three bounded queries.
//
// A week appears only if the lift was actually LOGGED that week. A skipped
// week is simply absent rather than rendered as an empty row, which also
// settles what "the last completed week" means on the card's strip: the last
// week this lift was really done, not merely the previous week of the block.
// Showing an empty "WEEK 2" to a coach deciding today's load would be worse
// than showing the WEEK 1 she can actually compare against.
export async function getLiftBlockHistory({ userId, exerciseId, spcBlockId, excludeWorkoutId = null }) {
  if (!userId || !exerciseId || !spcBlockId) return [];

  const { data: workouts, error: workoutsError } = await programming
    .from("spc_workouts")
    .select("id, week_number")
    .eq("spc_block_id", spcBlockId);
  if (workoutsError) throw workoutsError;

  const ids = (workouts ?? []).map((w) => w.id).filter((id) => id !== excludeWorkoutId);
  if (ids.length === 0) return [];
  const weekByWorkout = new Map((workouts ?? []).map((w) => [w.id, w.week_number]));

  const [logsRes, notesRes] = await Promise.all([
    programming
      .from("logs")
      .select("spc_workout_id, set_number, reps, weight, date_performed, notes")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .in("spc_workout_id", ids)
      .order("set_number"),
    programming
      .from("exercise_coaching_notes")
      .select("spc_workout_id, body, author_name, created_at")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .in("spc_workout_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (notesRes.error) throw notesRes.error;

  // Newest note per workout wins (append-only table — see fetchHubBoard).
  const noteByWorkout = new Map();
  for (const note of notesRes.data ?? []) {
    if (!noteByWorkout.has(note.spc_workout_id)) noteByWorkout.set(note.spc_workout_id, note);
  }

  const byWorkout = new Map();
  for (const row of logsRes.data ?? []) {
    if (row.reps == null && row.weight == null) continue; // cleared rows aren't history
    if (!byWorkout.has(row.spc_workout_id)) byWorkout.set(row.spc_workout_id, []);
    byWorkout.get(row.spc_workout_id).push(row);
  }
  // A week logged across two days would otherwise show set 1 twice.
  for (const [workoutId, rows] of byWorkout) byWorkout.set(workoutId, dedupeSets(rows));

  const weeks = [];
  for (const [workoutId, sets] of byWorkout) {
    const note = noteByWorkout.get(workoutId) ?? null;
    // Before 0087 the member's own note lived on the log rows instead of in
    // the shared store, so a week she noted on her phone would show a blank
    // strip here. Falling back keeps that history visible on the board
    // without a backfill (which would drag in every TrueCoach import's raw
    // text — see 0087's header). logResult copied the same text onto every
    // set row, so the first non-empty one is the note.
    const legacyNote = sets.find((r) => r.notes)?.notes ?? null;
    weeks.push({
      workoutId,
      weekNumber: weekByWorkout.get(workoutId) ?? null,
      date: sets.reduce((d, r) => (d && d < r.date_performed ? d : r.date_performed), null),
      sets,
      note: note?.body ?? legacyNote,
      noteAuthor: note ? (note.author_name ?? null) : null,
    });
  }
  weeks.sort((a, b) => (b.weekNumber ?? 0) - (a.weekNumber ?? 0));
  return weeks;
}

// Idle-screen figures: the gym's session count for the week, and recent
// personal bests. Both are gym-wide, and the display account is deliberately
// scoped to the open session's clients only — so this goes through the
// security-definer programming.hub_idle_stats() (migration 0076) rather than
// widening what the TV can read.
//
// The bests list is empty unless an admin has turned it on in Settings →
// Equipment; that gate lives inside the function, so when it is off the TV
// never receives a single client name.
export async function getHubIdleStats() {
  const { data, error } = await programming.rpc("hub_idle_stats");
  if (error) throw error;
  return {
    sessionsThisWeek: data?.sessions_this_week ?? null,
    bests: data?.bests ?? [],
  };
}

// ── The wall display's own controls (migration 0083) ───────────────────────
// Everything below goes through a security-definer RPC rather than a table
// write. 0071 deliberately gives the display account no roster read and no
// write on the hub tables at all; widening that would let the TV read every
// SPC client's programming instead of the four on the board. See the
// migration header for the full reasoning.

// A coach's own PIN. Nothing ever reads a PIN back — only a hash is stored —
// so this answers "have I set one?", not "what is it?".
export async function getOwnDisplayPin() {
  const { data, error } = await programming
    .from("coach_display_pins")
    .select("user_id, updated_at")
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function setOwnDisplayPin(pin) {
  const { error } = await programming.rpc("set_own_display_pin", { p_pin: pin });
  if (error) throw error;
}

export async function clearOwnDisplayPin() {
  const { error } = await programming.rpc("clear_own_display_pin");
  if (error) throw error;
}

// Resolve a PIN to the coach who owns it. Returns null on a miss — a wrong
// PIN and an unknown PIN are deliberately indistinguishable.
export async function verifyHubPin(pin) {
  const { data, error } = await programming.rpc("hub_verify_pin", { p_pin: pin });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { coachId: row.coach_id, coachName: row.coach_name } : null;
}

// Every SPC client who could go on the board right now, with this week's
// published sessions. The server-side equivalent of HubSessionSetup's own
// resolveSlot(), so the display needs no roster read of its own.
export async function listStartableHubClients() {
  const { data, error } = await programming.rpc("hub_startable_clients");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    name: row.name,
    blockId: row.block_id,
    weekNumber: row.week_number,
    sessions: row.sessions ?? [],
  }));
}

// Start from the wall. Takes the PIN, not a coach id: re-verifying server-side
// is what stops the display attributing a session — and the coaching notes
// written during it — to a coach whose PIN it doesn't have.
export async function startHubSessionWithPin({ pin, slots }) {
  const { data, error } = await programming.rpc("hub_start_session", {
    p_pin: pin,
    p_clients: slots.map((s) => ({
      userId: s.userId,
      spcWorkoutId: s.spcWorkoutId,
      weekNumber: s.weekNumber,
    })),
  });
  if (error) throw error;
  return data;
}

// Someone turned up after the session started. Takes the lowest free slot.
export async function addHubClient({ userId, spcWorkoutId, weekNumber }) {
  const { error } = await programming.rpc("hub_add_client", {
    p_user_id: userId,
    p_spc_workout_id: spcWorkoutId,
    p_week_number: weekNumber,
  });
  if (error) throw error;
}

// Someone didn't show. Removes the board slot only — everything she logged
// stays on her session.
export async function removeHubClient(userId) {
  const { error } = await programming.rpc("hub_remove_client", { p_user_id: userId });
  if (error) throw error;
}
