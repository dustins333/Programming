// What a logged set is CALLED, in one place.
//
// A ramp-up set (0116) is real work she did that is not one of the working
// sets the coach programmed: she grabbed the 25s, did a set, knew it wasn't
// hard enough. She keeps the data; it just stops counting as one of her three.
//
// The database never renumbers. `set_number` stays the row's physical
// position — it is part of logs_unique_set_idx, so shifting 2,3,4 down to
// 1,2,3 would mean updating rows into numbers their neighbours still hold,
// which a unique index rejects mid-statement. So a lift with a ramp-up at
// position 1 STORES 1,2,3,4 and DISPLAYS:
//
//     RAMP UP 1
//     SET 1
//     SET 2
//     SET 3
//
// which means the label is derived, and every screen that prints one has to
// derive it the same way or her own card and the coach's read-out will
// disagree about which set is which. That is what this file is for.
export const WORKING = "working";
export const RAMP_UP = "ramp_up";

// True for a ramp-up row in either shape it turns up in: straight off the
// database (`set_type`) or as one of the logging card's own local rows
// (`rampUp`, which is a real boolean and may legitimately be false).
export function isRampUpSet(row) {
  if (!row) return false;
  if (typeof row.rampUp === "boolean") return row.rampUp;
  return row.set_type === RAMP_UP;
}

// Labels for a run of sets, in stored order. Ramp-ups and working sets count
// independently, so each sequence reads 1, 2, 3 on its own.
//
// `short` is for the places that render a set as a bubble or a pill rather
// than a labelled row and have no width for a word.
export function deriveSetLabels(rows) {
  let working = 0;
  let ramp = 0;
  return (rows ?? []).map((row) => {
    const rampUp = isRampUpSet(row);
    const index = rampUp ? ++ramp : ++working;
    return {
      rampUp,
      index,
      label: rampUp ? `RAMP UP ${index}` : `SET ${index}`,
      short: rampUp ? `R${index}` : String(index),
    };
  });
}

// Her working sets alone, in order. This is what "her 3 sets" means anywhere
// a set is counted, summed into volume, compared against a prescription, or
// summarised — a ramp-up is deliberately none of those things.
export function workingSets(rows) {
  return (rows ?? []).filter((row) => !isRampUpSet(row));
}

// ---------------------------------------------------------------------------
// Bodyweight
//
// A weight of ZERO means she did the set with no external load. The coaches
// invented that convention themselves — by 2026-09-08 there were 301 sets
// stored that way across 63 clients and 38 lifts, 180 of them in a fortnight
// — and it is semantically right besides: an empty bar is 45 lb, a machine
// at the lowest pin is some number, so the only thing 0 can honestly mean in
// a weight box is "nothing on it".
//
// So zero IS the storage. There is no separate flag, no migration, and every
// set already logged that way reads back correctly. What changes is that the
// app now SAYS "BW" instead of "0 lb", and the keypad has a key that writes
// it — a shortcut that also teaches the word, rather than a second way of
// saying the same thing that coaches would have to be taught.
//
// This is deliberately NOT the same as exercises.tracks_weight = false. That
// is "this lift is never loaded by anyone" (Plank, Copenhagen) and it hides
// the weight box entirely. Bodyweight is per SET: Sarah does a split squat
// unloaded in the same week Sally does it at 150.
export const BODYWEIGHT = 0;

export function isBodyweightSet(row) {
  return Number(row?.weight) === BODYWEIGHT && row?.weight != null && row?.weight !== "";
}

// The external load on a set, for anything that does ARITHMETIC on weight —
// bests, PRs, progress charts, biggest-jump. Bodyweight is not a load, so it
// answers null and drops out exactly the way an unlogged weight does.
//
// This is what stops two things that would otherwise be wrong: a lift she
// only ever does unloaded reporting a "best" of 0 lb, and moving from
// bodyweight to 150 lb registering as a +150 personal record when it is a
// change of mode rather than a jump in strength. Progression on a bodyweight
// set lives in the reps, which is how a tracks_weight:false lift already
// works.
export function externalLoad(row) {
  const w = row?.weight;
  return w == null || Number(w) === BODYWEIGHT ? null : w;
}

// One token for a set's weight, so no two screens can word it differently.
// Returns null when there is nothing to say, so a caller can drop its
// separator ("@", "×") rather than printing a dangling one.
export function formatWeight(weight, { unit = true } = {}) {
  if (weight == null || weight === "") return null;
  if (Number(weight) === BODYWEIGHT) return "BW";
  return unit ? `${weight} lb` : String(weight);
}
