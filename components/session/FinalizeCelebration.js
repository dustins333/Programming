import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { FinalizeConfetti, confettiRunMs, FINALIZED_WASH } from "../FinalizeConfetti";

// The member's own version of the gym-floor board's finished-session moment:
// the session washes green, then the confetti falls. Same confetti engine as
// the wall (components/FinalizeConfetti.js), tuned for a phone in a hand
// rather than a screen across a room — the wall's run is deliberately slow
// enough to turn a head from twenty feet away, which in your palm just reads
// as confetti that will not stop.
//
// Deliberately NOT a replacement for anything: the finalize toggle behaves
// exactly as it did, and the accomplishment plate (components/session/
// FinalizePlate.js) still comes up with the same content. The plate is held
// back by PLATE_HOLD_MS so the beat is actually seen — a full-screen modal
// arriving in the same frame as the wash would cover the celebration before
// anybody saw it. The confetti keeps falling behind the plate; that is the
// intended shape, not an oversight.

const PIECE_COUNT = 28;
const FALL_MIN_MS = 1300;
const FALL_MAX_MS = 2000;
const STAGGER_MS = 500;
const CELEBRATION_MS = confettiRunMs({ fallMaxMs: FALL_MAX_MS, staggerMs: STAGGER_MS });

// How long the celebration gets the screen to itself before the plate rises
// over it. Long enough that the wash lands and the first pieces are clearly
// falling, short enough that the plate still reads as the response to the
// tap rather than a separate event.
export const PLATE_HOLD_MS = 1500;

// Resolves once `until` (a Date.now() timestamp) has passed, immediately if
// it already has. Used to hold the plate for the remainder of the beat
// rather than for a flat delay — building the plate takes two round trips of
// its own, and those should count toward the hold, not be added to it.
export function holdUntil(until) {
  const remaining = until - Date.now();
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, remaining));
}

// One celebration at a time, keyed to whichever session was just finalized
// so only that card washes. `key` is the caller's own identifier for the
// session; `runKey` is what restarts the confetti.
export function useFinalizeCelebration() {
  const [celebration, setCelebration] = useState(null);
  const timer = useRef(null);

  // Un-finalizing inside the run has to take the green back with it, or the
  // session sits washed while its button says it is no longer finished.
  const clearCelebration = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setCelebration(null);
  }, []);

  const celebrate = useCallback((key) => {
    if (timer.current) clearTimeout(timer.current);
    const runKey = Date.now();
    setCelebration({ key, runKey });
    timer.current = setTimeout(() => {
      timer.current = null;
      setCelebration(null);
    }, CELEBRATION_MS);
    // The caller holds the plate until this, so it is returned rather than
    // recomputed at the call site.
    return runKey + PLATE_HOLD_MS;
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { celebration, celebrate, clearCelebration };
}

// The green shade over a just-finalized session. The same colour the wall
// uses, so the two surfaces read as one thing.
//
// Unlike the wall's, this one is momentary and never blocks: on the board a
// finalized session is genuinely closed and the wash is what says so, but a
// member can still go back and fix a set after finalizing (SessionLogger
// keeps the button live and onDataChanged reopens it), so a wash that ate
// taps would break the one thing they might do next. pointerEvents="none"
// throughout, and it clears itself when the run ends.
//
// Deliberately NOT faded in. A fade was tried and dropped: it buys about a
// fifth of a second of polish and costs a whole failure mode — an
// Animated.timing that never advances (requestAnimationFrame is throttled in
// a backgrounded tab, and is frozen outright in the preview browser this is
// verified in) leaves the wash sitting at opacity 0, which is a celebration
// nobody sees. The wall's wash appears instantly too, and landing on the
// same frame as the tap reads as the answer to it.
//
// Written longhand rather than with StyleSheet.absoluteFillObject — inside a
// style array that renders the view invisible on this app's Fabric build
// (2026-08-08), and this is exactly that shape. The -6 inset lets the green
// sit slightly proud of the lift cards, so it reads as one field over the
// session rather than a panel tucked inside it.
export function FinalizeWash() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -6,
        left: -6,
        right: -6,
        bottom: -6,
        borderRadius: 18,
        backgroundColor: FINALIZED_WASH,
      }}
    />
  );
}

// Screen-level, so the pieces fall down what the member is actually looking
// at rather than down a session card that may be several screens tall. Sits
// in the page's root View (never inside its ScrollView, or it would scroll
// away mid-fall) and below the plate's Modal on both platforms, which is
// what puts the confetti behind it.
export function FinalizeConfettiScreen({ runKey }) {
  const { height } = useWindowDimensions();
  if (!runKey) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <FinalizeConfetti
        runKey={runKey}
        pieceCount={PIECE_COUNT}
        distance={height + 60}
        fallMinMs={FALL_MIN_MS}
        fallMaxMs={FALL_MAX_MS}
        staggerMs={STAGGER_MS}
      />
    </View>
  );
}
