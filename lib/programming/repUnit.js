// What an exercise's "reps" column actually counts.
//
// Orthogonal to tracks_weight, deliberately: a Farmer Carry is weighted AND
// measured in time, a plank is neither, a barbell row is weighted reps.
// Folding this into tracks_weight as a third state would have made those two
// independent facts fight each other.
//
// The display rule is one line: the member's logging card already prints the
// column header ONCE per lift ("REPS" above the boxes, not beside every set),
// so naming what is counted costs nothing and repeats nowhere. A carry reads
// "TIME | LB" over "60 | 62" and needs no further explaining.

// Three kinds, not a unit list. A coach picks what is being counted; the
// unit it displays in is this app's decision, not another question to
// answer at 6am with a client waiting. Time reads in seconds and distance
// in feet, which is what this gym writes anyway.
export const REP_UNITS = [
  { key: "reps", label: "Reps", header: "REPS", suffix: "", word: "reps" },
  { key: "time", label: "Time", header: "TIME", suffix: "s", word: "seconds" },
  { key: "distance", label: "Distance", header: "DISTANCE", suffix: "ft", word: "feet" },
];

const BY_KEY = Object.fromEntries(REP_UNITS.map((u) => [u.key, u]));
export const DEFAULT_REP_UNIT = "reps";

// Unknown or missing reads as plain reps — a column added later, a row from
// before the migration, or an embed a caller didn't select. Falling back to
// reps means the worst case is the status quo, never a mislabelled lift.
export function repUnit(exerciseOrKey) {
  const key = typeof exerciseOrKey === "string" ? exerciseOrKey : exerciseOrKey?.rep_unit;
  return BY_KEY[key] ?? BY_KEY[DEFAULT_REP_UNIT];
}

// Whether reps x weight is a meaningful multiplication for this exercise.
// Only true for real reps — see lib/programming/volume.js.
export function countsAsVolume(exerciseOrKey) {
  return repUnit(exerciseOrKey).key === "reps";
}

// The column header over the logging boxes: REPS / SEC / FEET / METERS.
export function repUnitHeader(exerciseOrKey) {
  return repUnit(exerciseOrKey).header;
}

// One count with its unit attached: 10 -> "10", 60 seconds -> "60s",
// 50 feet -> "50ft". Reps stay bare, because "10 reps" everywhere would add
// a word to the overwhelming majority of lifts to disambiguate a handful.
export function formatCount(value, exerciseOrKey) {
  if (value == null || value === "") return null;
  return `${value}${repUnit(exerciseOrKey).suffix}`;
}

// A prescription's count half — "10", "60s", or a varying scheme
// "10, 8, 8" / "60s, 45s, 30s". Handles both the per-set rep_scheme array
// and the flat targetReps fallback.
export function formatScheme(scheme, fallback, exerciseOrKey) {
  const u = repUnit(exerciseOrKey);
  const list = Array.isArray(scheme) && scheme.length ? scheme : null;
  if (!list) return fallback == null || fallback === "" ? null : `${fallback}${u.suffix}`;
  const unique = [...new Set(list)];
  if (unique.length === 1) return unique[0] === "" || unique[0] == null ? null : `${unique[0]}${u.suffix}`;
  return list.map((n) => (n == null || n === "" ? "–" : `${n}${u.suffix}`)).join(", ");
}
