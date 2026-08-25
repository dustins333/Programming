// One definition of "lb lifted", shared by the coach dashboard's gym-wide
// figure, the member's finalize plate, and the SPC session readout — so the
// three surfaces can't report different totals for the same sets.
//
// Volume is reps x weight. A set with no weight contributes 0.
//
// A reps-only lift (exercises.tracks_weight = false) contributes 0 even if
// the row DOES carry a weight. That matters: flipping an exercise to
// reps-only stops the box being offered from then on, but it can't reach
// back and clear what people already typed into it — a real case, where
// bodyweight got entered on Shoulder Taps and Single Leg Glute Bridge.
// Reading the flag rather than trusting the column means the switch takes
// effect on the whole history at once, with no data surgery and nothing
// lost if the exercise is ever flipped back.
//
// MAX_SET_VOLUME is a typo guard, NOT a cap on strong members. It exists
// because a single fat-fingered weight can move the gym's daily number by a
// fifth on its own — a real case: 2010 lb entered on a Glute Bridge Floor
// Press put 20,100 lb into one day from one set.
//
// 5,000 was chosen against the real 30-day log, not picked for roundness.
// At that threshold exactly ONE set in 1,510 is excluded (the typo above).
// Lower thresholds start eating real work, fast:
//
//   > 5,000 lb   1 set     -2.3%   the typo, nothing else
//   > 3,000 lb   14 sets   -7.7%   heavy leg press starts going
//   > 2,000 lb   67 sets   -21%
//   > 1,000 lb   243 sets  -50%    ordinary lat pulldowns, trap bar
//                                  deadlifts at 185, hip thrusts at 155
//
// So the guard has to sit well above real lifting or it just punishes the
// strongest members. It does NOT solve carries and holds — a Farmer Carry
// logged as "60 reps @ 62 lb" is 3,720 lb of honest-looking volume from 60
// seconds of walking, and no threshold separates that from a real heavy
// set. That needs the exercise itself marked as time/distance work.
export const MAX_SET_VOLUME = 5000;

// The volume one logged set contributes. Returns 0 for anything that isn't
// a real weighted set, so callers can sum without pre-filtering.
//
// tracksWeight is the exercise's own flag. Undefined means "caller couldn't
// tell" and is treated as weighted — only an explicit false excludes, so a
// missing embed can't silently zero a real lift.
export function setVolume(reps, weight, tracksWeight) {
  if (tracksWeight === false) return 0;
  if (reps == null || weight == null) return 0;
  const vol = Number(reps) * Number(weight);
  if (!Number.isFinite(vol) || vol <= 0) return 0;
  return vol > MAX_SET_VOLUME ? 0 : vol;
}

// Sum over rows carrying { reps, weight }.
export function sumVolume(rows) {
  let total = 0;
  for (const row of rows ?? []) total += setVolume(row.reps, row.weight, row.exercises?.tracks_weight);
  return Math.round(total);
}
