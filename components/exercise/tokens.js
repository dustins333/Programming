// Local surface colours for the Exercise Library screens and the exercise
// form (design_handoff_exercise_library_v1, §4).
//
// Everything with a brand meaning lives in lib/theme.js — this file is only
// the greys and washes that describe a surface: what a card edge looks like,
// what separates two rows, what an inactive chip is. They were repeated as
// literals across the two library screens and the form before this, which is
// how the muscle picker ended up on a slightly different border grey from the
// card it sits inside.
export const CARD_BORDER = "#ece7e1"; // cards, table outline, header rules
export const ROW_RULE = "#f4f1ec"; // between rows
export const INPUT_BORDER = "#e2ddd6"; // inputs, dropdown triggers
export const CHIP_BORDER = "#d9d4cd"; // inactive chips, secondary buttons
export const PICKER_BORDER = "#e8e3dc"; // the muscle-group accordion's own edge
export const SEGMENT_TRACK = "#efe9e2"; // segmented-control background
export const ESPRESSO = "#33251f"; // filter tokens, active attention toggles
export const ESPRESSO_TEXT = "#f7f3ee";
export const ESPRESSO_SUB = "#a89a92";
export const INK = "#2a211c"; // names, primary text
export const DANGER = "#b23a22";

// Tan wash — doorway cards, the duplicate banner, the review note.
export const TAN_BG = "#fdf6f2";
export const TAN_BORDER = "#eddcd2";
export const TAN_BORDER_SOFT = "#f0ddd2";
export const TAN_TEXT = "#a8907f"; // the wash's own secondary line

// Badge pairs. Never colour alone — each is a bg/text pair, same rule as
// lib/theme.js's statusColors.
export const BADGE_REVIEW = { bg: "#f5ede4", text: "#8a5140" };
export const BADGE_DUPLICATE = { bg: "#fdece5", text: "#b23a22" };
export const BADGE_REPS_ONLY = { bg: "#eef1e7", text: "#4d6142" };

export const VIDEO_LINKED = "#4d6142";
// Missing is only a problem for an exercise somebody is actually using —
// an entry nobody has programmed yet reads as "None", in plain grey.
export const VIDEO_MISSING = "#b23a22";
export const VIDEO_NONE = "#c9c4bd";

// The soft two-layer warm-grey card shadow, approximated in one RN shadow.
export const CARD_SHADOW = {
  shadowColor: "#44403c",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
};
