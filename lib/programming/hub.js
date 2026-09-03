import { programming } from "../supabase/client";
import { listClientGoals } from "./clientGoals";
import { todayInBoise, dateInBoise } from "../boiseDate";
import { calendarWeekNumber } from "./schedule";

// SPC Live Session Hub data layer (migration 0071). A hub session is one
// gym-floor block of time: a coach picks up to 4 clients + which session each
// is doing; the wall display and the coach's phone both render it live.
//
// Since 0106 a slot can point at a GROUP workout instead of an SPC one, for a
// program flagged hub_enabled — built for LLYL, where four women lift the same
// program and so share one group_workouts row. Everything per-client stays
// per-client (logs, completions, notes are all keyed on user_id); what is
// shared is the programming, which is why reorder is not offered for a group
// column. See 0106's header for the three ways the two kinds differ.
// Open session = ended_at is null; the DB guarantees at most one open at a
// time (partial unique index), so "the open session" is a well-defined thing
// to poll for.

// Which kind of workout a board slot points at. Exactly one of the two columns
// is set (0106's XOR check), and everything downstream branches on `kind`
// rather than re-testing the columns, so a third program type would land here
// and nowhere else.
export function slotSession(slot) {
  const groupWorkoutId = slot.group_workout_id ?? null;
  return {
    kind: groupWorkoutId ? "group" : "spc",
    workoutId: groupWorkoutId ?? slot.spc_workout_id,
    spcWorkoutId: groupWorkoutId ? null : slot.spc_workout_id,
    groupWorkoutId,
  };
}

// The `session` descriptor logResult / addCoachingNote take, for one entry.
//
// A GROUP row carries NO week number: 0040's check constraint requires it null
// on the group variant, because a group_workouts row is already week-specific.
// SPC's sessions format went the opposite way and files completions UNDER the
// calendar week. The two are genuinely different keys — never merge them.
export function sessionRefFor(entry) {
  return entry.kind === "group"
    ? { groupWorkoutId: entry.groupWorkoutId }
    : { spcWorkoutId: entry.spcWorkoutId, weekNumber: entry.weekNumber };
}

// slots: [{ userId, clientName, spcWorkoutId | groupWorkoutId, weekNumber }] (1-4 entries).
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
    spc_workout_id: slot.groupWorkoutId ? null : slot.spcWorkoutId,
    group_workout_id: slot.groupWorkoutId ?? null,
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
  // Removed clients are filtered HERE rather than in the query: since 0107 a
  // drop is a soft delete, and the staff policy returns every row — so without
  // this a coach's own board would keep showing someone she just took off,
  // while the TV (whose policy hides them) would not.
  const clients = [...(data.hub_session_clients ?? [])]
    .filter((c) => !c.removed_at)
    .sort((a, b) => a.position - b.position);
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
// warm-ups don't change mid-session). Map<workoutId, warmup rows> with the
// joined exercise for default sets/reps fallback, sorted by position.
//
// Keyed on the workout id whichever table it came from: both are uuids, so
// one map serves a mixed board with no composite key.
const WARMUP_SELECT = "*, exercises(id, name, default_sets, default_reps)";

export async function fetchHubWarmups(slots) {
  const spcIds = slots.filter((s) => !s.group_workout_id).map((s) => s.spc_workout_id);
  const groupIds = slots.filter((s) => s.group_workout_id).map((s) => s.group_workout_id);

  const queries = [];
  if (spcIds.length > 0) {
    queries.push(
      programming.from("spc_workout_warmups").select(WARMUP_SELECT).in("spc_workout_id", spcIds).order("position")
    );
  }
  if (groupIds.length > 0) {
    queries.push(
      programming.from("group_workout_warmups").select(WARMUP_SELECT).in("group_workout_id", groupIds).order("position")
    );
  }
  if (queries.length === 0) return new Map();

  const results = await Promise.all(queries);
  const byWorkout = new Map();
  for (const res of results) {
    if (res.error) throw res.error;
    for (const row of res.data ?? []) {
      const workoutId = row.group_workout_id ?? row.spc_workout_id;
      if (!byWorkout.has(workoutId)) byWorkout.set(workoutId, []);
      byWorkout.get(workoutId).push(row);
    }
  }
  return byWorkout;
}

// The 3-second poll. A bounded set of queries regardless of client count —
// structure, logs, exercise completions, session completions, coaching notes,
// doubled only when the board holds BOTH an SPC and a group column, since the
// two read different tables. Logs are matched on the session (stamped since
// 0063 — every live write from the member phone, the coach phone and the TV
// stamps it, so nothing entered during the session can be missed) AND on
// today's Boise date.
//
// The date half is not optional. A workout row is one (block, week, session)
// in both models, and the same session genuinely gets logged on more than one
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
//   kind,                  // "spc" | "group" — what the rest of the hub branches on
//   workoutId,             // the active one, whichever kind
//   spcWorkoutId, groupWorkoutId, blockId,
//   weekNumber, clientName, title,
//   items,                 // member-plan item shape, `id` = the join-row id — so
//                          // schemeLabel/summarizeSets/coachNoteFor/supersetLettersFor
//                          // all work unmodified
//   logsByExerciseId,      // Map<exerciseId, log rows sorted by set_number>
//   completedItemIds,      // Set<join-row id>
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

// Which week a completion for this workout is filed under, and THE reason
// this board reads anything correctly past week 1.
//
// Under the weekly model a spc_workouts row was one (block, week, session), so
// the workout id alone identified the week and every read here could ignore
// week_number. Since the 0105 sessions cutover that is false: one row spans
// the whole run (all authored week 1) and the week lives on the completion,
// the note and the log instead. Reading week-blind meant week 1's ticks and
// week 1's finalize were served back in week 2 as if they were today's.
//
// Mirrors spcCompletionWeek() in sessionCompletions.js — kept as a local
// rather than imported because that one takes a round trip to fetch the row
// this function already has in hand, and the board polls every three seconds.
function completionWeekFor(meta, today) {
  const block = meta?.spc_blocks;
  if (block?.format === "sessions" && block.block_start_date) {
    return calendarWeekNumber(block.block_start_date, today);
  }
  return meta?.week_number ?? null;
}

const EXERCISE_SELECT =
  "*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight, rep_unit)";

// `dateOverride` is what makes a PAST board reviewable: a finished session's
// sets sit on the day it ran, not today.
//
// COMPLETIONS are date-scoped too whenever an override is given, and that is
// not symmetry for its own sake — it is the difference between a review
// screen that reports and one that lies. Live, "a lift ticked yesterday is
// still ticked" is right. On a past board it is not: Rae was on a board on
// 08/27 and logged nothing, then trained the same session the next day, and
// because ticks carried and sets did not, the 08/27 board showed a full set
// of checkmarks over empty boxes — which reads as "her data vanished".
// `completed_at` is never null on either table (checked live: 1043 + 238
// rows, zero), so the filter can't silently hide a real completion.
//
// Structure and notes stay current on purpose: a note written afterwards is
// exactly what the review screen exists to add.
export async function fetchHubBoard(slots, dateOverride = null) {
  if (slots.length === 0) return new Map();
  const today = dateOverride ?? todayInBoise();
  const userIds = slots.map((s) => s.user_id);

  const spcIds = slots.filter((s) => !s.group_workout_id).map((s) => s.spc_workout_id);
  const groupIds = slots.filter((s) => s.group_workout_id).map((s) => s.group_workout_id);

  // Two shapes, queried separately and merged. A group board and an SPC board
  // read different tables all the way down — see 0106's header for why they
  // are deliberately not unified.
  const q = [];
  const tag = [];
  const add = (name, query) => {
    tag.push(name);
    q.push(query);
  };
  if (spcIds.length > 0) {
    add("spcStructure", programming.from("spc_workout_exercises").select(EXERCISE_SELECT).in("spc_workout_id", spcIds).order("position"));
    add("spcWorkouts", programming.from("spc_workouts").select("id, title, session_number, week_number, spc_block_id, spc_blocks(format, block_start_date)").in("id", spcIds));
    add("spcLogs", programming.from("logs").select("*").in("spc_workout_id", spcIds).eq("date_performed", today).order("set_number"));
    add("spcSessionComp", programming.from("session_completions").select("user_id, spc_workout_id, week_number, completed_at").in("spc_workout_id", spcIds));
  }
  if (groupIds.length > 0) {
    add("groupStructure", programming.from("group_workout_exercises").select(EXERCISE_SELECT).in("group_workout_id", groupIds).order("position"));
    add("groupWorkouts", programming.from("group_workouts").select("id, title, session_number, week_number, block_id").in("id", groupIds));
    add("groupLogs", programming.from("logs").select("*").in("group_workout_id", groupIds).eq("date_performed", today).order("set_number"));
    add("groupSessionComp", programming.from("session_completions").select("user_id, group_workout_id, completed_at").in("group_workout_id", groupIds));
  }
  add("notes", programming.from("exercise_coaching_notes").select("*").in("user_id", userIds).order("created_at", { ascending: false }));

  const settled = await Promise.all(q);
  const got = {};
  settled.forEach((res, i) => {
    if (res.error) throw res.error;
    got[tag[i]] = res.data ?? [];
  });
  const structure = [...(got.spcStructure ?? []), ...(got.groupStructure ?? [])];
  const logs = [...(got.spcLogs ?? []), ...(got.groupLogs ?? [])];
  const sessionComp = [...(got.spcSessionComp ?? []), ...(got.groupSessionComp ?? [])];
  const notes = got.notes ?? [];

  // The shared goal, shown next to each client's name on the wall. The
  // display account reaches this through its own hub-active policy (0078).
  // Deliberately not fatal: a goal is decoration on this screen, and the
  // board must keep polling if 0078 hasn't been run yet.
  const goalByUserId = await listClientGoals(userIds).catch(() => new Map());

  // Exercise completions need the join-row ids from the structure query, and
  // the id lives in a different column per kind.
  const spcItemIds = (got.spcStructure ?? []).map((r) => r.id);
  const groupItemIds = (got.groupStructure ?? []).map((r) => r.id);
  const compQ = [];
  if (spcItemIds.length > 0) {
    compQ.push(programming.from("exercise_completions").select("user_id, spc_workout_exercise_id, week_number, completed_at").in("spc_workout_exercise_id", spcItemIds));
  }
  if (groupItemIds.length > 0) {
    compQ.push(programming.from("exercise_completions").select("user_id, group_workout_exercise_id, completed_at").in("group_workout_exercise_id", groupItemIds));
  }
  const exerciseCompRows = [];
  for (const res of await Promise.all(compQ)) {
    if (res.error) throw res.error;
    exerciseCompRows.push(...(res.data ?? []));
  }

  const workoutMeta = new Map();
  for (const w of got.spcWorkouts ?? []) workoutMeta.set(w.id, { ...w, blockId: w.spc_block_id });
  for (const w of got.groupWorkouts ?? []) workoutMeta.set(w.id, { ...w, blockId: w.block_id });

  // Reviewing a past board: a completion counts only if it happened on the day
  // that board ran. Live (no override) nothing is filtered.
  const onBoardDay = (row) => !dateOverride || dateInBoise(new Date(row.completed_at)) === dateOverride;

  const board = new Map();
  for (const slot of slots) {
    const ref = slotSession(slot);
    const workoutCol = ref.kind === "group" ? "group_workout_id" : "spc_workout_id";
    const itemCol = ref.kind === "group" ? "group_workout_exercise_id" : "spc_workout_exercise_id";

    const rows = structure.filter((r) => r[workoutCol] === ref.workoutId);
    // Same item shape app/(member)/plan.js builds for SessionLogger, plus the
    // join-row id (needed for completions and, on SPC, reorder).
    const items = rows.map((ex) => ({
      id: ex.id,
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
    for (const row of logs) {
      if (row[workoutCol] !== ref.workoutId || row.user_id !== slot.user_id) continue;
      if (!logsByExerciseId.has(row.exercise_id)) logsByExerciseId.set(row.exercise_id, []);
      logsByExerciseId.get(row.exercise_id).push(row);
    }
    for (const [exerciseId, r] of logsByExerciseId) logsByExerciseId.set(exerciseId, dedupeSets(r));

    // Which week this slot's completions, notes and finalize are filed under.
    // A GROUP row carries none by design (0040 requires it null — the workout
    // row is already week-specific), so group reads skip the check entirely.
    // A null here means the workout row itself is missing, in which case there
    // are no items either; falling back to "don't filter" keeps a data oddity
    // from silently blanking a column.
    const meta = workoutMeta.get(ref.workoutId);
    const completionWeek = ref.kind === "group" ? null : completionWeekFor(meta, today);
    const inWeek = (r) =>
      ref.kind === "group" || completionWeek == null || (r.week_number ?? null) === completionWeek;

    const itemIdSet = new Set(items.map((i) => i.id));
    const completedItemIds = new Set(
      exerciseCompRows
        .filter((r) => r.user_id === slot.user_id && itemIdSet.has(r[itemCol]) && inWeek(r) && onBoardDay(r))
        .map((r) => r[itemCol])
    );

    const finalized = sessionComp.some(
      (r) => r.user_id === slot.user_id && r[workoutCol] === ref.workoutId && inWeek(r) && onBoardDay(r)
    );

    // "Her 4th time on this session" — the ordinal of the session she is
    // standing in, counted over the current block. A first time and a tenth
    // are coached completely differently, and nothing on the board said which
    // this was.
    //
    // Includes the current week whether or not she has finalized, so the
    // number does not jump the instant somebody taps Finalize. Distinct
    // weeks, current block — the same definition the staging picker's
    // per-session count uses (0098), so the two surfaces cannot disagree.
    //
    // SPC sessions format only (0102), where one spc_workouts row IS the
    // session for the whole run and each completion carries its own week. A
    // legacy weekly row could only ever answer 0 or 1, and a GROUP column has
    // one workout row per week — counting across its block would need the
    // sibling rows and a third query wave on a 3-second poll, to restate the
    // "Week 3" already in the header. A group program's weeks are a shared
    // calendar nobody works through out of order.
    let sessionRunCount = null;
    if (ref.kind === "spc" && meta?.spc_blocks?.format === "sessions" && completionWeek != null) {
      const weeksDone = new Set(
        sessionComp
          .filter(
            (r) =>
              r.user_id === slot.user_id &&
              r.spc_workout_id === ref.workoutId &&
              r.week_number != null &&
              // Reviewing a past board counts it as of that day, not as of now.
              r.week_number <= completionWeek
          )
          .map((r) => r.week_number)
      );
      sessionRunCount = weeksDone.size + (weeksDone.has(completionWeek) ? 0 : 1);
    }

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
    for (const note of notes) {
      if (note.user_id !== slot.user_id) continue;
      if (!latestNoteByExerciseId.has(note.exercise_id)) latestNoteByExerciseId.set(note.exercise_id, note);
      if (note[workoutCol] === ref.workoutId && inWeek(note) && !noteForWeekByExerciseId.has(note.exercise_id)) {
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
    // Never overrides a real shared note: whoever typed in the merged box
    // wins over a stale copy on the log row.
    for (const [exerciseId, r] of logsByExerciseId) {
      if (noteForWeekByExerciseId.has(exerciseId)) continue;
      const legacy = r.find((row) => row.notes && row.notes.trim() !== "");
      if (!legacy) continue;
      noteForWeekByExerciseId.set(exerciseId, {
        id: `legacy-${ref.workoutId}-${exerciseId}`,
        exercise_id: exerciseId,
        body: legacy.notes,
        // The member's own log — nobody else has ever written to logs.notes.
        author_name: slot.client_name ?? null,
        created_at: legacy.date_performed,
        [workoutCol]: ref.workoutId,
      });
    }

    board.set(slot.user_id, {
      kind: ref.kind,
      workoutId: ref.workoutId,
      spcWorkoutId: ref.spcWorkoutId,
      groupWorkoutId: ref.groupWorkoutId,
      blockId: meta?.blockId ?? null,
      weekNumber: slot.week_number,
      // The key completions/notes are filed under — resolved from the block,
      // not from the slot, so a board still open past Boise midnight files
      // into the week it is actually in. Writers must use this, never
      // weekNumber, or a tick would be written to one week and read from
      // another. Null for a group column, which has no week key.
      completionWeek,
      clientName: slot.client_name,
      title: meta?.title ?? null,
      sessionNumber: meta?.session_number ?? null,
      sessionRunCount,
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
// Works for either kind: a group block's weeks are its own group_workouts
// rows, which is the same query against a different table.
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
export async function getLiftBlockHistory({
  userId,
  exerciseId,
  blockId,
  kind = "spc",
  excludeWorkoutId = null,
  excludeWeekNumber = null,
}) {
  if (!userId || !exerciseId || !blockId) return [];

  const group = kind === "group";
  const workoutCol = group ? "group_workout_id" : "spc_workout_id";

  // The block comes back on the SPC rows so a sessions-format run can resolve
  // each logged day to its calendar week — see the grouping note below.
  const { data: workouts, error: workoutsError } = group
    ? await programming.from("group_workouts").select("id, week_number").eq("block_id", blockId)
    : await programming
        .from("spc_workouts")
        .select("id, week_number, spc_blocks(format, block_start_date)")
        .eq("spc_block_id", blockId);
  if (workoutsError) throw workoutsError;

  const ids = (workouts ?? []).map((w) => w.id);
  if (ids.length === 0) return [];
  const weekByWorkout = new Map((workouts ?? []).map((w) => [w.id, w.week_number]));

  // A sessions-format run (0105) has ONE workout row for the whole block, with
  // every row authored week 1 — so the workout id says nothing about which
  // week a set belongs to, and the week has to come from the day it was
  // logged. Resolved exactly the way spcCompletionWeek() does it, so a lift's
  // history and its ticks can never disagree about what "week 2" means.
  const blockRow = group ? null : (workouts ?? []).find((w) => w.spc_blocks)?.spc_blocks ?? null;
  const sessionsFormat = blockRow?.format === "sessions" && Boolean(blockRow.block_start_date);
  const weekOf = (workoutId, datePerformed) =>
    sessionsFormat && datePerformed
      ? calendarWeekNumber(blockRow.block_start_date, datePerformed)
      : (weekByWorkout.get(workoutId) ?? null);

  const [logsRes, notesRes] = await Promise.all([
    programming
      .from("logs")
      .select(`${workoutCol}, set_number, reps, weight, date_performed, notes`)
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .in(workoutCol, ids)
      .order("set_number"),
    programming
      .from("exercise_coaching_notes")
      .select(`${workoutCol}, week_number, body, author_name, created_at`)
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .in(workoutCol, ids)
      .order("created_at", { ascending: false }),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (notesRes.error) throw notesRes.error;

  // Grouped on (workout, week) rather than on the workout alone. Under the
  // weekly model those were the same thing, which is why this used to get away
  // with the workout id; under sessions format the pair is what separates one
  // week from the next, and it still keeps two different SESSIONS that share a
  // lift apart.
  const keyOf = (workoutId, week) => `${workoutId}:${week ?? "x"}`;

  // Newest note per (workout, week) wins (append-only table — see fetchHubBoard).
  const noteByKey = new Map();
  for (const note of notesRes.data ?? []) {
    const week = group ? weekByWorkout.get(note[workoutCol]) ?? null : (note.week_number ?? null);
    const key = keyOf(note[workoutCol], week);
    if (!noteByKey.has(key)) noteByKey.set(key, note);
  }

  const byKey = new Map();
  for (const row of logsRes.data ?? []) {
    if (row.reps == null && row.weight == null) continue; // cleared rows aren't history
    const workoutId = row[workoutCol];
    const week = weekOf(workoutId, row.date_performed);
    // Drop the session currently on screen. A weekly block has one week per
    // workout so the id alone was enough; a sessions run needs the week too,
    // or excluding "this workout" would exclude the entire block — which is
    // exactly what left a week-2 client staring at "First time this block."
    if (workoutId === excludeWorkoutId && (excludeWeekNumber == null || week === excludeWeekNumber)) continue;
    const key = keyOf(workoutId, week);
    if (!byKey.has(key)) byKey.set(key, { workoutId, week, rows: [] });
    byKey.get(key).rows.push(row);
  }

  const weeks = [];
  for (const [key, { workoutId, week, rows }] of byKey) {
    // A week logged across two days would otherwise show set 1 twice.
    const sets = dedupeSets(rows);
    const note = noteByKey.get(key) ?? null;
    // Before 0087 the member's own note lived on the log rows instead of in
    // the shared store, so a week she noted on her phone would show a blank
    // strip here. Falling back keeps that history visible on the board
    // without a backfill (which would drag in every TrueCoach import's raw
    // text — see 0087's header). logResult copied the same text onto every
    // set row, so the first non-empty one is the note.
    const legacyNote = sets.find((r) => r.notes)?.notes ?? null;
    weeks.push({
      key,
      workoutId,
      weekNumber: week,
      date: sets.reduce((d, r) => (d && d < r.date_performed ? d : r.date_performed), null),
      sets,
      note: note?.body ?? legacyNote,
      noteAuthor: note ? (note.author_name ?? null) : null,
    });
  }
  // Week first, then day — two entries can share a week when the same lift is
  // programmed in two of the block's sessions.
  weeks.sort((a, b) => (b.weekNumber ?? 0) - (a.weekNumber ?? 0) || (b.date ?? "").localeCompare(a.date ?? ""));
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
    // 0106. "spc" for an SPC client, "group" for a member of a hub_enabled
    // group program (programId/programName name which one). A client could in
    // principle be both and appear twice, once per segment — hence `key`,
    // which is what the picker tracks selection by rather than the user id.
    programKind: row.program_kind ?? "spc",
    programId: row.program_id ?? null,
    programName: row.program_name ?? null,
    key: `${row.program_kind ?? "spc"}:${row.program_id ?? ""}:${row.user_id}`,
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
      spcWorkoutId: s.groupWorkoutId ? null : s.spcWorkoutId,
      groupWorkoutId: s.groupWorkoutId ?? null,
      weekNumber: s.weekNumber,
    })),
  });
  if (error) throw error;
  return data;
}

// Someone turned up after the session started. Takes the lowest free slot.
export async function addHubClient({ userId, spcWorkoutId = null, groupWorkoutId = null, weekNumber }) {
  const { error } = await programming.rpc("hub_add_client", {
    p_user_id: userId,
    p_spc_workout_id: groupWorkoutId ? null : spcWorkoutId,
    p_group_workout_id: groupWorkoutId,
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
