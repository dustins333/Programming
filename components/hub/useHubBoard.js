import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOpenHubSession,
  fetchHubBoard,
  fetchHubWarmups,
  endHubSession,
  reorderHubExercises,
} from "../../lib/programming/hub";
import { logResult } from "../../lib/programming/memberPlan";
import {
  markSpcExerciseComplete,
  unmarkSpcExerciseComplete,
} from "../../lib/programming/exerciseCompletions";
import {
  finalizeSpcSession,
  unfinalizeSpcSession,
} from "../../lib/programming/sessionCompletions";
import { addCoachingNote } from "../../lib/programming/coachingNotes";
import { todayInBoise } from "../../lib/boiseDate";

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

export function useHubBoard({ idlePoll = true } = {}) {
  const [hubSession, setHubSession] = useState(undefined); // undefined = loading, null = none open
  const [board, setBoard] = useState(null); // Map<userId, entry> from fetchHubBoard
  const [warmups, setWarmups] = useState(new Map()); // Map<spcWorkoutId, rows>
  const [pollError, setPollError] = useState(false);

  // While a lift is expanded, poll results must not stomp that lift's logs
  // (the card holds the draft; a client's phone write arriving mid-edit would
  // visually revert the coach's typing). Everything else on the board still
  // updates live.
  //
  // A MAP, not a single ref: two columns can be expanded at once — a coach
  // running four people moves between two racks — so freezing "the one open
  // lift" would be wrong the moment a second column is opened.
  const editingRef = useRef(new Map()); // Map<userId, exerciseId>
  const sessionRef = useRef(undefined);
  sessionRef.current = hubSession;
  const boardRef = useRef(null);
  boardRef.current = board;
  const warmupsForRef = useRef(null); // hub session id the warmups were fetched for

  const refreshSession = useCallback(async () => {
    try {
      const open = await getOpenHubSession();
      setPollError(false);
      setHubSession((prev) => {
        // Keep object identity stable when nothing changed, so effects keyed
        // on hubSession don't re-fire every 5s.
        if (prev && open && prev.id === open.id && prev.clients.length === open.clients.length) return prev;
        return open;
      });
      return open;
    } catch (e) {
      setPollError(true);
      return sessionRef.current ?? null;
    }
  }, []);

  const refreshBoard = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const next = await fetchHubBoard(session.clients);
      setPollError(false);
      for (const [editUserId, editExerciseId] of editingRef.current) {
        const prevEntry = boardRef.current?.get(editUserId);
        const nextEntry = next.get(editUserId);
        if (!prevEntry || !nextEntry) continue;
        const kept = new Map(nextEntry.logsByExerciseId);
        if (prevEntry.logsByExerciseId.has(editExerciseId)) {
          kept.set(editExerciseId, prevEntry.logsByExerciseId.get(editExerciseId));
        } else {
          kept.delete(editExerciseId);
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

  // Warm-ups don't change mid-session — fetched once per hub session.
  useEffect(() => {
    if (!hubSession) return;
    if (warmupsForRef.current === hubSession.id) return;
    warmupsForRef.current = hubSession.id;
    let cancelled = false;
    fetchHubWarmups(hubSession.clients)
      .then((map) => {
        if (!cancelled) setWarmups(map);
      })
      .catch(() => {}); // warm-ups are display-only context; a failure never blocks the board
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
        await refreshSession();
      } else if (idlePoll) {
        const open = await refreshSession();
        if (open && !cancelled) await refreshBoard();
      }
      if (cancelled) return;
      timer = setTimeout(tick, sessionRef.current ? LIVE_POLL_MS : IDLE_POLL_MS);
    };

    // Kick off immediately.
    (async () => {
      const open = await refreshSession();
      if (open && !cancelled) await refreshBoard();
      if (!cancelled) timer = setTimeout(tick, sessionRef.current ? LIVE_POLL_MS : IDLE_POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshSession, refreshBoard, idlePoll]);

  const setEditing = useCallback((userId, exerciseId) => {
    editingRef.current.set(userId, exerciseId);
  }, []);
  const clearEditing = useCallback((userId) => {
    if (userId == null) editingRef.current.clear();
    else editingRef.current.delete(userId);
  }, []);

  // Write one lift's sets. Called on a debounce while the coach types and
  // again on collapse — the design has no Save button anywhere, matching the
  // member app's own autosave. Deliberately does NOT refreshBoard(): the
  // draft in the card is the truth while the lift is open (the poll is
  // frozen for exactly this lift), so a refresh per keystroke-debounce would
  // be four columns of queries for nothing.
  //
  // Same write contract as the member phone: every set row rewritten, source
  // "spc", the session stamped — so hub-entered sets are indistinguishable
  // from phone-entered ones. Simultaneous edits from the client's own phone
  // converge as last-write-per-set, accepted for a coached session where
  // everyone is standing at the same rack.
  const saveSets = useCallback(async ({ userId, spcWorkoutId, weekNumber, exerciseId, rows }) => {
    const datePerformed = todayInBoise();
    await Promise.all(
      rows.map((row, i) =>
        logResult({
          userId,
          exerciseId,
          datePerformed,
          setNumber: i + 1,
          reps: row.reps === "" || row.reps == null ? null : Number(row.reps) || null,
          weight: row.weight === "" || row.weight == null ? null : Number(row.weight),
          source: "spc",
          session: { spcWorkoutId, weekNumber },
        })
      )
    );
  }, []);

  // The lift's one note for this week. Append-only — the display account has
  // INSERT but no UPDATE on exercise_coaching_notes (0071), so "one note per
  // lift per week" is read as "the newest row for that week" rather than
  // edited in place. authorName is snapshotted because the TV cannot read
  // core.users to resolve author_id to a person.
  const saveNote = useCallback(
    async ({ userId, spcWorkoutId, weekNumber, exerciseId, body, authorId, authorName }) => {
      await addCoachingNote({ userId, exerciseId, authorId: authorId ?? null, authorName: authorName ?? null, body, spcWorkoutId, weekNumber });
      await refreshBoard();
    },
    [refreshBoard]
  );

  const toggleExerciseComplete = useCallback(
    async (userId, item, weekNumber, next) => {
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
      if (next) await markSpcExerciseComplete(userId, item.id, weekNumber);
      else await unmarkSpcExerciseComplete(userId, item.id, weekNumber);
    },
    []
  );

  const toggleFinalize = useCallback(
    async (userId) => {
      const entry = boardRef.current?.get(userId);
      if (!entry) return;
      if (entry.finalized) await unfinalizeSpcSession(userId, entry.spcWorkoutId, entry.weekNumber);
      else await finalizeSpcSession(userId, entry.spcWorkoutId, entry.weekNumber);
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
    warmupsForRef.current = null;
  }, []);

  return {
    hubSession,
    board,
    warmups,
    pollError,
    refreshSession,
    refreshBoard,
    setEditing,
    clearEditing,
    saveSets,
    saveNote,
    toggleExerciseComplete,
    toggleFinalize,
    moveLift,
    end,
  };
}
