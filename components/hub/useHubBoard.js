import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOpenHubSession,
  fetchHubBoard,
  fetchHubWarmups,
  endHubSession,
  reorderHubExercises,
} from "../../lib/programming/hub";
import { logResult } from "../../lib/programming/memberPlan";
import { sessionRefFor } from "../../lib/programming/hub";
import {
  markSpcExerciseComplete,
  unmarkSpcExerciseComplete,
  markGroupExerciseComplete,
  unmarkGroupExerciseComplete,
} from "../../lib/programming/exerciseCompletions";
import {
  finalizeSpcSession,
  unfinalizeSpcSession,
  finalizeGroupSession,
  unfinalizeGroupSession,
} from "../../lib/programming/sessionCompletions";
import { addCoachingNote } from "../../lib/programming/coachingNotes";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";

// The live hub's brain — shared by the wall display (app/(display)/index.js)
// and the coach's phone (app/(coach)/spc/live.js). One open hub session at a
// time (DB-guaranteed, see 0071); this hook polls for it and, once live,
// polls the board.
//
// Live sync is POLLING, deliberately not Supabase Realtime: the realtime
// publication has zero tables (verified live 2026-08-19), no realtime infra
// exists anywhere in this app, and the member phone's own autosave is
// already debounced 900ms — so a 3s poll adds no perceptible lag over what
// the source of truth already has.
const IDLE_POLL_MS = 5000;
const LIVE_POLL_MS = 3000;
// A finished board isn't racing anyone at a rack, but two coaches can still
// be reviewing the same noon session — so it polls, just far less often.
const REVIEW_POLL_MS = 10000;

// `reviewSession` turns this into the review brain for a session that has
// already ended (app/(coach)/spc/sessions/[sessionId].js). Everything a coach
// does on it — sets, notes, ticks, finalize — writes exactly as it does live;
// the only differences are that there is no open session to poll for, and
// that logs are read from and written to the day the board actually ran
// rather than today.
// Identity of a board's roster: who is on it, in which slot, on which workout.
// Any of those changing is a different board and has to reach every device.
function clientsSignature(clients) {
  return (clients ?? [])
    .map((c) => `${c.user_id}:${c.position}:${c.group_workout_id ?? c.spc_workout_id ?? ""}`)
    .join("|");
}

export function useHubBoard({ idlePoll = true, reviewSession = null } = {}) {
  const reviewMode = Boolean(reviewSession);
  const [hubSession, setHubSession] = useState(reviewSession ?? undefined); // undefined = loading, null = none open
  const [board, setBoard] = useState(null); // Map<userId, entry> from fetchHubBoard
  const [warmups, setWarmups] = useState(new Map()); // Map<workoutId, rows>
  const [pollError, setPollError] = useState(false);

  // While a lift has UNSAVED keystrokes in it, poll results must not stomp
  // that lift's logs — the card holds the draft, and a write arriving
  // mid-typing would visually revert what the coach just entered.
  //
  // The freeze is scoped to unsaved edits, NOT to "the card is open". An open
  // card that has nothing pending is showing exactly what is in the database,
  // so letting the poll through is a no-op locally and is the only way a set
  // entered on another device ever reaches it. Freezing for the whole time a
  // card was open is what made a remote set invisible until you collapsed and
  // re-expanded (reported 2026-08-23).
  //
  // seq/savedSeq rather than a boolean: a keystroke landing while a write is
  // in flight bumps seq again, so the write that is finishing can't declare
  // the draft clean and let the next poll overwrite the newer digits.
  //
  // A MAP, not a single ref: two columns can be expanded at once — a coach
  // running four people moves between two racks — so tracking "the one open
  // lift" would be wrong the moment a second column is opened.
  const editingRef = useRef(new Map()); // Map<userId, {exerciseId, seq, savedSeq}>
  const sessionRef = useRef(undefined);
  // In review mode the session is a PROP, so it is authoritative the instant
  // it arrives. Reading it only out of state left the board blank until the
  // first poll tick: setHubSession is queued by an effect, but sessionRef is
  // assigned during render, so the kickoff in the same commit still saw
  // undefined and skipped the board fetch entirely.
  sessionRef.current = reviewSession ?? hubSession;
  const boardRef = useRef(null);
  boardRef.current = board;
  // Which workout ids warm-ups have already been fetched for, and for which
  // session. Keyed on the WORKOUT ids rather than on the session id: a client
  // added after the board opened keeps the same session id, so a session-id
  // guard blocked her fetch forever and her warm-up strip stayed empty for the
  // whole session (found live 2026-09-02 — Junyao added 33s after Ashley).
  const warmupsFetchedRef = useRef(new Set()); // workout ids already fetched
  const warmupsSessionRef = useRef(null); // the session those fetches belong to
  // The Boise day this board's sets belong to. Null while live, which is what
  // keeps every write on the live path reading todayInBoise() at the moment
  // the key was pressed rather than at mount.
  const boardDateRef = useRef(null);
  boardDateRef.current = reviewSession
    ? reviewSession.date ?? dateInBoise(new Date(reviewSession.created_at))
    : null;

  // A different session id means a different board; identity churn on the
  // same one must not reset it.
  const reviewId = reviewSession?.id ?? null;
  useEffect(() => {
    if (reviewSession) setHubSession(reviewSession);
  }, [reviewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSession = useCallback(async () => {
    // A finished board is fixed — asking which session is open would replace
    // the one being reviewed with whatever is running on the floor right now.
    if (reviewMode) return sessionRef.current ?? null;
    try {
      const open = await getOpenHubSession();
      setPollError(false);
      setHubSession((prev) => {
        // Keep object identity stable when nothing changed, so effects keyed
        // on hubSession don't re-fire every 5s.
        //
        // Compared on a real signature of the roster, not just its LENGTH: a
        // coach swapping one client for the next between two ticks of another
        // device's poll leaves the count unchanged, and a length check would
        // hold that device on the old roster indefinitely — showing the client
        // who left and never the one who arrived.
        if (prev && open && prev.id === open.id && clientsSignature(prev.clients) === clientsSignature(open.clients))
          return prev;
        return open;
      });
      return open;
    } catch (e) {
      setPollError(true);
      return sessionRef.current ?? null;
    }
  }, [reviewMode]);

  const refreshBoard = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const next = await fetchHubBoard(session.clients, boardDateRef.current);
      setPollError(false);
      for (const [editUserId, edit] of editingRef.current) {
        if (edit.seq === edit.savedSeq) continue; // nothing unsaved — let the poll through
        const prevEntry = boardRef.current?.get(editUserId);
        const nextEntry = next.get(editUserId);
        if (!prevEntry || !nextEntry) continue;
        const kept = new Map(nextEntry.logsByExerciseId);
        if (prevEntry.logsByExerciseId.has(edit.exerciseId)) {
          kept.set(edit.exerciseId, prevEntry.logsByExerciseId.get(edit.exerciseId));
        } else {
          kept.delete(edit.exerciseId);
        }
        next.set(editUserId, { ...nextEntry, logsByExerciseId: kept });
      }
      setBoard(next);
    } catch (e) {
      // A failed tick keeps last-good state — the caller renders a subtle
      // "reconnecting" pip off pollError instead of blanking the board.
      setPollError(true);
    }
  }, []);

  // Warm-ups don't change mid-session, but WHO is on the board does — a coach
  // adds the next client into a free slot without restarting the session. So
  // this fetches per workout id and merges, rather than once per session:
  // steady state finds nothing missing and does nothing, and a client added
  // mid-session gets her warm-ups on the next poll.
  useEffect(() => {
    if (!hubSession) return;
    // A different board starts clean, so an edited warm-up list is re-read.
    if (warmupsSessionRef.current !== hubSession.id) {
      warmupsSessionRef.current = hubSession.id;
      warmupsFetchedRef.current = new Set();
      setWarmups(new Map());
    }
    const missing = hubSession.clients.filter((c) => {
      const workoutId = c.group_workout_id ?? c.spc_workout_id;
      return workoutId && !warmupsFetchedRef.current.has(workoutId);
    });
    if (missing.length === 0) return;
    // Marked before the request so a re-render mid-flight doesn't fire it
    // twice; a failure clears the marks below so the next poll retries.
    const ids = missing.map((c) => c.group_workout_id ?? c.spc_workout_id);
    for (const id of ids) warmupsFetchedRef.current.add(id);
    let cancelled = false;
    fetchHubWarmups(missing)
      .then((map) => {
        if (cancelled) return;
        // Merge, never replace — replacing would drop the warm-ups of everyone
        // already on the board, since this fetch only covers the new slots.
        setWarmups((prev) => {
          const next = new Map(prev);
          for (const [workoutId, rows] of map) next.set(workoutId, rows);
          return next;
        });
      })
      .catch(() => {
        // warm-ups are display-only context; a failure never blocks the board,
        // it just gets retried on the next tick.
        for (const id of ids) warmupsFetchedRef.current.delete(id);
      });
    return () => {
      cancelled = true;
    };
  }, [hubSession]);

  // The poll loop. One interval, cadence switching on whether a session is
  // open. Cleared on unmount / when the caller's screen loses focus (the
  // caller decides by mounting/unmounting or via the `paused` mechanism of
  // simply not rendering the component that uses this hook).
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      const session = sessionRef.current;
      if (session) {
        await refreshBoard();
        // The session itself can end from another device mid-poll.
        if (!reviewMode) await refreshSession();
      } else if (idlePoll) {
        const open = await refreshSession();
        if (open && !cancelled) await refreshBoard();
      }
      if (cancelled) return;
      timer = setTimeout(tick, reviewMode ? REVIEW_POLL_MS : sessionRef.current ? LIVE_POLL_MS : IDLE_POLL_MS);
    };

    // Kick off immediately. `idlePoll: false` with nothing known yet means the
    // caller is waiting on its own session (the review screen, whose session
    // arrives a tick later) — looking up whichever board is running on the
    // floor right now would flash the wrong one onto the screen.
    (async () => {
      const known = sessionRef.current;
      const open = !known && !idlePoll ? null : await refreshSession();
      if (open && !cancelled) await refreshBoard();
      if (!cancelled) timer = setTimeout(tick, reviewMode ? REVIEW_POLL_MS : sessionRef.current ? LIVE_POLL_MS : IDLE_POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshSession, refreshBoard, idlePoll, reviewMode, reviewId]);

  const setEditing = useCallback((userId, exerciseId) => {
    editingRef.current.set(userId, { exerciseId, seq: 0, savedSeq: 0 });
  }, []);
  // A keystroke landed. Until the matching write finishes, the poll leaves
  // this lift alone.
  const markEdit = useCallback((userId) => {
    const edit = editingRef.current.get(userId);
    if (edit) edit.seq += 1;
  }, []);
  const clearEditing = useCallback((userId) => {
    if (userId == null) editingRef.current.clear();
    else editingRef.current.delete(userId);
  }, []);

  // Write one lift's sets. Called on a debounce while the coach types and
  // again on collapse — the design has no Save button anywhere, matching the
  // member app's own autosave.
  //
  // Refreshes the board once the write lands, which is what makes the rest of
  // this screen agree with the card immediately: without it the collapsed row
  // underneath, the column's own summary and the other device all sat on
  // pre-edit logs until the next 3s tick happened to arrive. One refresh per
  // typing pause, not per keystroke.
  //
  // Same write contract as the member phone: every set row rewritten, the
  // session stamped, source tagged to the kind — so hub-entered sets are
  // indistinguishable
  // from phone-entered ones. Simultaneous edits from the client's own phone
  // converge as last-write-per-set, accepted for a coached session where
  // everyone is standing at the same rack.
  const saveSets = useCallback(async ({ userId, entry, exerciseId, rows }) => {
    const datePerformed = boardDateRef.current ?? todayInBoise();
    const startedAt = editingRef.current.get(userId)?.seq ?? 0;
    const session = sessionRefFor(entry);
    await Promise.all(
      rows.map((row, i) =>
        logResult({
          userId,
          exerciseId,
          datePerformed,
          setNumber: i + 1,
          reps: row.reps === "" || row.reps == null ? null : Number(row.reps) || null,
          weight: row.weight === "" || row.weight == null ? null : Number(row.weight),
          source: entry.kind === "group" ? "group" : "spc",
          session,
        })
      )
    );
    // Only declare the draft clean if nothing was typed while this write was
    // in flight — otherwise the refresh below would pull the pre-keystroke
    // rows back over the newer digits.
    const edit = editingRef.current.get(userId);
    if (edit && edit.seq === startedAt) edit.savedSeq = startedAt;
    await refreshBoard();
  }, [refreshBoard]);

  // The lift's one note for this week. Append-only — the display account has
  // INSERT but no UPDATE on exercise_coaching_notes (0071), so "one note per
  // lift per week" is read as "the newest row for that week" rather than
  // edited in place. authorName is snapshotted because the TV cannot read
  // core.users to resolve author_id to a person.
  const saveNote = useCallback(
    async ({ userId, entry, exerciseId, body, authorId, authorName }) => {
      await addCoachingNote({
        userId,
        exerciseId,
        authorId: authorId ?? null,
        authorName: authorName ?? null,
        body,
        session: sessionRefFor(entry),
      });
      await refreshBoard();
    },
    [refreshBoard]
  );

  // A GROUP tick carries no week number — 0040's constraint requires it null,
  // because a group_workouts row is already week-specific. Reading the entry
  // here rather than taking a weekNumber argument is what keeps that from
  // being passed in by a caller that doesn't know the difference.
  const toggleExerciseComplete = useCallback(
    async (userId, item, next) => {
      const entry = boardRef.current?.get(userId);
      if (!entry) return;
      // Optimistic — the checkbox should feel instant on a touchscreen.
      setBoard((prev) => {
        if (!prev) return prev;
        const entry = prev.get(userId);
        if (!entry) return prev;
        const ids = new Set(entry.completedItemIds);
        if (next) ids.add(item.id);
        else ids.delete(item.id);
        const copy = new Map(prev);
        copy.set(userId, { ...entry, completedItemIds: ids });
        return copy;
      });
      if (entry.kind === "group") {
        if (next) await markGroupExerciseComplete(userId, item.id);
        else await unmarkGroupExerciseComplete(userId, item.id);
      } else if (next) {
        await markSpcExerciseComplete(userId, item.id, entry.completionWeek ?? entry.weekNumber);
      } else {
        await unmarkSpcExerciseComplete(userId, item.id, entry.completionWeek ?? entry.weekNumber);
      }
    },
    []
  );

  const toggleFinalize = useCallback(
    async (userId) => {
      const entry = boardRef.current?.get(userId);
      if (!entry) return;
      if (entry.kind === "group") {
        if (entry.finalized) await unfinalizeGroupSession(userId, entry.groupWorkoutId);
        else await finalizeGroupSession(userId, entry.groupWorkoutId);
      } else if (entry.finalized) {
        await unfinalizeSpcSession(userId, entry.spcWorkoutId);
      } else {
        await finalizeSpcSession(userId, entry.spcWorkoutId);
      }
      await refreshBoard();
    },
    [refreshBoard]
  );

  // Swap a lift with its neighbor (equipment conflicts). Sends the FULL
  // position list so gaps in stored positions can't scramble the order.
  const moveLift = useCallback(
    async (userId, itemId, dir) => {
      const entry = boardRef.current?.get(userId);
      if (!entry) return;
      // Position lives on the shared join row, so reordering a group column
      // would rewrite that week's session for every member of the program.
      // The UI hides the arrows; this is the belt to that brace.
      if (entry.kind === "group") return;
      const ordered = [...entry.items];
      const index = ordered.findIndex((i) => i.id === itemId);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      const payload = ordered.map((item, i) => ({ id: item.id, position: i + 1 }));
      // Optimistic reorder so the tap feels instant.
      setBoard((prev) => {
        if (!prev) return prev;
        const cur = prev.get(userId);
        if (!cur) return prev;
        const copy = new Map(prev);
        copy.set(userId, { ...cur, items: ordered.map((it, i) => ({ ...it, position: i + 1 })) });
        return copy;
      });
      await reorderHubExercises(entry.spcWorkoutId, payload);
      await refreshBoard();
    },
    [refreshBoard]
  );

  const end = useCallback(async () => {
    await endHubSession();
    setHubSession(null);
    setBoard(null);
    warmupsFetchedRef.current = new Set();
    warmupsSessionRef.current = null;
  }, []);

  return {
    hubSession,
    board,
    warmups,
    pollError,
    refreshSession,
    refreshBoard,
    setEditing,
    markEdit,
    clearEditing,
    saveSets,
    saveNote,
    toggleExerciseComplete,
    toggleFinalize,
    moveLift,
    end,
  };
}
