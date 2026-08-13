import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// The member's rest timer, owned above the tab navigator rather than inside
// whichever ExerciseCard started it (design_handoff_member_lift_v1).
//
// This is the whole point of the redesign's rest behaviour: the old timer
// was local state inside ExerciseCard's RestButton, so it died the moment
// that card unmounted — leaving the session, switching tabs, or (before the
// single-page rework) navigating between focus cards all silently killed a
// running rest. It now lives in a provider mounted in (member)/_layout.js,
// above <Tabs>, so it keeps running on My Week, My Nutrition, My History and
// Settings, and the bar rides above the tab content everywhere.
//
// Deliberately never auto-starts — a rest only ever begins on a real tap of
// a lift's timer button.
//
// Lifecycle: running → done (holds a few seconds so "Rest done" is actually
// seen) → cleared. Cancel kills it immediately from either state.

const DONE_HOLD_MS = 6000;

export function formatSeconds(total) {
  const safe = Math.max(0, Math.round(total));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

// "0:20" / "90" / "90s" → seconds. Coach-authored free text (the column is
// still text — the coach-web pass writes a canonical seconds string but
// years of legacy values exist), so this stays forgiving rather than
// assuming a format.
export function parseRestSeconds(rest) {
  if (!rest) return null;
  const raw = String(rest).trim();
  if (raw.includes(":")) {
    const [m, s] = raw.split(":");
    const total = (Number(m) || 0) * 60 + (Number(s) || 0);
    return total > 0 ? total : null;
  }
  const digits = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(digits) && digits > 0 ? Math.round(digits) : null;
}

// Safe no-op default so an ExerciseCard rendered outside the member tab tree
// (e.g. a coach reading a past session) never throws — it just gets a timer
// button that does nothing rather than crashing the screen.
const NOOP = {
  timer: null,
  startRest: () => {},
  cancelRest: () => {},
  markRestDone: () => {},
};

const RestTimerContext = createContext(NOOP);

export function useRestTimer() {
  return useContext(RestTimerContext);
}

export function RestTimerProvider({ children }) {
  // { liftName, setNumber, returnTo, durationMs, endsAt, done }
  const [timer, setTimer] = useState(null);
  const clearRef = useRef(null);

  const cancelRest = useCallback(() => {
    clearTimeout(clearRef.current);
    setTimer(null);
  }, []);

  const startRest = useCallback(({ seconds, liftName, setNumber, returnTo }) => {
    clearTimeout(clearRef.current);
    const durationMs = Math.max(1, Math.round(seconds)) * 1000;
    setTimer({
      liftName: liftName ?? null,
      setNumber: setNumber ?? null,
      returnTo: returnTo ?? null,
      durationMs,
      endsAt: Date.now() + durationMs,
      done: false,
    });
  }, []);

  // Called by the bar, which is what actually ticks — keeping the 250ms tick
  // out of the provider matters, since a provider re-render re-renders every
  // member screen under it.
  const markRestDone = useCallback(() => {
    setTimer((t) => (t && !t.done ? { ...t, done: true } : t));
  }, []);

  useEffect(() => {
    if (!timer?.done) return undefined;
    clearRef.current = setTimeout(() => setTimer(null), DONE_HOLD_MS);
    return () => clearTimeout(clearRef.current);
  }, [timer?.done]);

  useEffect(() => () => clearTimeout(clearRef.current), []);

  const value = useMemo(() => ({ timer, startRest, cancelRest, markRestDone }), [timer, startRest, cancelRest, markRestDone]);

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}
