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
