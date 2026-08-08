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
