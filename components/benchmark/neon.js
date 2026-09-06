import { Platform } from "react-native";

// Benchmark Day's palette. This is the one place in the app that is not warm
// clay and cream, and that is deliberate: the feature mirrors the neon board
// bolted to the gym wall, and the whole point of the button on My Week is that
// it does not look like the rest of My Week. Values are sampled from
// design_handoff_member_benchmark_v1/board-reference.png.
//
// Nothing here belongs in lib/theme.js. These tokens are scoped to one feature
// on purpose — a mint that only ever means "you improved on Benchmark Day"
// should not be reachable from a nutrition screen.

export const NEON = {
  ground: "#000000",
  card: "#0a0a0a",
  cardDeep: "#050505",
  // Mint. The "this improved" colour: eyebrows, tier gains, primary CTAs.
  mint: "#6fffd9",
  mintRgb: "111,255,217",
  inkOnMint: "#001a13",
  inkOnNeon: "#0a0a0a",
  inkOnPink: "#12000a",
  // Body text on black.
  ink: "#f7f3ee",
  ink62: "rgba(247,243,238,.62)",
  ink55: "rgba(247,243,238,.55)",
  ink5: "rgba(247,243,238,.5)",
  ink42: "rgba(247,243,238,.42)",
  ink36: "rgba(247,243,238,.36)",
  ink3: "rgba(247,243,238,.3)",
  ink28: "rgba(247,243,238,.28)",
  ink2: "rgba(247,243,238,.2)",
  hairline: "rgba(255,255,255,.09)",
  border: "rgba(255,255,255,.13)",
  borderSoft: "rgba(255,255,255,.14)",
  // Unplaced kettlebell boxes. This time is the louder of the two, because it
  // is the one she is meant to tap.
  dashedThis: "rgba(255,255,255,.22)",
  dashedLast: "rgba(255,255,255,.12)",
  trackFill: "rgba(255,255,255,.07)",
  trackRail: "rgba(255,255,255,.12)",
  noteFill: "rgba(255,255,255,.03)",
};

// A `0 0 Npx rgba(...)` CSS glow, in the only form RN understands.
//
// On react-native-web — which is where every real user is — this compiles
// straight to `box-shadow: 0 0 Npx colour`, i.e. exactly the design. On iOS it
// is a real coloured shadow. On Android `shadowColor` is ignored outside
// `elevation`, so a native Android build gets a plain drop shadow instead of a
// glow. Accepted rather than worked around: nobody is on Android natively (see
// the PWA note in CLAUDE.md), and the alternative is a stack of nested Views
// faking a blur.
export function glow(rgb, { radius = 22, opacity = 0.45 } = {}) {
  return {
    shadowColor: `rgb(${rgb})`,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: radius,
    shadowOpacity: opacity,
    ...(Platform.OS === "android" ? { elevation: 6 } : null),
  };
}

export function rgba(rgb, alpha) {
  return `rgba(${rgb},${alpha})`;
}
