// Kova Strength brand tokens — mirrors the Nutrition Tracker web app's
// app/globals.css so both apps read as one brand. Keep these two in sync
// if the palette ever changes.
export const colors = {
  primary: "#a46a57",
  // Brand-colored TEXT on a white/light background must use this, not
  // `primary` — #a46a57 text on white is ~3.9:1, under WCAG AA's 4.5:1;
  // #8a5140 clears it. Reserve `primary` for large (>=24px) headings,
  // filled backgrounds, icons, and borders.
  primaryOnWhite: "#8a5140",
  accent: "#ad816d",
  tertiary: "#beac95",
  // Soft warm-neutral page canvas — used wherever a screen shouldn't read as
  // stark white (bottom-sheet modals already used this hex inline; payroll's
  // redesign is what made it worth naming as a real token instead of
  // repeating the literal).
  canvas: "#faf8f6",
  // Secondary text that still carries INFORMATION (a unit, a target, a date,
  // a subtitle) — ~5.6:1 on white, ~5.2:1 on canvas. Before this token the
  // app used #a8a29e (stone-400, 2.5:1) as its everyday muted grey, which is
  // why so much of the member app read as "too small": 11px dark text is
  // legible, 11px light grey isn't. Reserve #a8a29e / `hint` for genuinely
  // decorative or disabled text.
  muted: "#6f6862",
  // Ghost text — placeholders and the TARGET hint drawn inside an empty input.
  // ~3:1 on white: still clearly "not entered", but it exists. The old
  // #d5cdc4 was 1.5:1, below where it reliably reads in gym lighting.
  hint: "#9a9187",
};

// Member-app type scale. Sizes only — pair with `fonts` and a colour. These
// are FLOORS for text that carries information: nothing a member has to read
// should go below `caption`; eyebrows (uppercase + letter-spaced, which read
// smaller than their number) never below `eyebrow`. Decorative marks
// (wordmarks, dividers) are exempt. Added 2026-08-18 after an audit found 26
// distinct ad-hoc sizes across the member screens.
export const type = {
  eyebrow: 11, // uppercase, letterSpacing ~1, sansBold
  caption: 12, // captions, units, sublines
  body: 14,
  bodyLg: 15.5,
  title: 18,
  display: 24,
};

// The gym's 5-status system (SPC roster + Nutrition dashboard both reuse
// this — see components/StatusBadge.js) — bg/text pairs only, never color
// alone to convey status.
export const statusColors = {
  urgent: { bg: "#fdece5", text: "#b23a22" },
  needsAction: { bg: "#f4ede3", text: "#8a5a2e" },
  onTrack: { bg: "#eef1e7", text: "#4d6142" },
  paused: { bg: "#f1efed", text: "#78716c" },
};

export const fonts = {
  sans: "Montserrat_400Regular",
  sansMedium: "Montserrat_500Medium",
  sansSemiBold: "Montserrat_600SemiBold",
  sansBold: "Montserrat_700Bold",
  display: "ProtestStrike_400Regular",
};
