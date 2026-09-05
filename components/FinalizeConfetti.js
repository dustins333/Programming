import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";

// The confetti run that marks a finished session, shared by the gym-floor
// board (components/hub/HubFinalizedOverlay.js) and the member's own phone
// (components/session/FinalizeCelebration.js).
//
// Extracted rather than copied: the two surfaces are deliberately tuned
// differently — a wall display seen from across a gym needs a slower, longer
// fall than a phone held at arm's length — but they are the SAME confetti,
// and two copies of a piece animation is how the colours and shapes quietly
// drift apart. Everything that differs between them is a prop; the piece
// itself has one definition.
//
// The payroll day-submitted celebration keeps its own smaller run
// (components/payroll/DaySubmittedCelebration.js) — different moment,
// different tuning, and folding it in here would mean a third set of knobs
// for no shared behaviour.

// RNW ignores the native driver and warns; everything here is transform and
// opacity only, so native gets the real thing and web falls back to JS.
const USE_NATIVE_DRIVER = Platform.OS !== "web";

// The app's own palette — brand terracotta, the olive "done" tone, the peach
// card tint, and the two accent tones already used by status pills.
export const CONFETTI_COLORS = ["#a46a57", "#4d6142", "#e8c9a0", "#b23a22", "#8fb473", "#f0ddd2"];

// The green a finished session washes to, on the wall and on a phone alike.
// Translucent enough that the lifts still read through it, which is what
// says "this session, and it's done" rather than "something is loading".
// Lives here, with the confetti, so the member bundle never has to pull in
// the hub's overlay just to know one colour.
export const FINALIZED_WASH = "rgba(87,124,60,0.55)";

// Pieces fall at their own speeds over their own staggered starts, so a run
// has to outlast the slowest possible piece (the longest delay plus the
// longest fall) or the last few are cut off mid-air.
export function confettiRunMs({ fallMaxMs, staggerMs }) {
  return fallMaxMs + staggerMs + 300;
}

// Each piece owns its own Animated.Value via a child component, since hooks
// cannot be created in a loop.
function ConfettiPiece({ left, delay, duration, color, size, distance }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay, duration]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-30, distance] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] });
  const opacity = progress.interpolate({ inputRange: [0, 0.82, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left,
        top: 0,
        width: size,
        height: size * 1.9,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY }, { rotate }],
        opacity,
      }}
    />
  );
}

// Fills whatever it is placed in. Horizontal positions are percentages
// rather than measured pixels on purpose: onLayout is a ResizeObserver on
// web and cannot be relied on, and a piece that falls past the bottom simply
// disappears either way.
//
// `runKey` is what starts a fresh run — change it and every piece is rebuilt
// with new random offsets, so finalizing twice never replays the identical
// pattern.
export function FinalizeConfetti({ runKey, pieceCount, distance, fallMinMs, fallMaxMs, staggerMs }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: pieceCount }, (_, i) => ({
        key: `${runKey}:${i}`,
        left: `${Math.round(Math.random() * 94)}%`,
        delay: Math.random() * staggerMs,
        // Per piece, so they don't fall as one sheet.
        duration: fallMinMs + Math.random() * (fallMaxMs - fallMinMs),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    // Deliberately only runKey: re-rolling the pieces because a parent
    // re-rendered would restart every animation mid-fall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runKey],
  );

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map((p) => (
        <ConfettiPiece
          key={p.key}
          left={p.left}
          delay={p.delay}
          duration={p.duration}
          color={p.color}
          size={p.size}
          distance={distance}
        />
      ))}
    </View>
  );
}
