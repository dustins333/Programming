import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { currentWeekNumber } from "./schedule";
import { labelBlocks } from "./spcBlocks";
import { resolveClientPrograms } from "./spcState";
import { getSpcBlockDetail } from "./spcBlockDetail";
import { listSpcWarmupsForWorkouts } from "./spcWorkouts";
import { getClientGoal } from "./clientGoals";
import { liftLabelsFor } from "./sessionLabels";

// The phone-legible version of the printed SPC sheet
// (design_handoff_spc_roster_v1, screen 3): one client's current block, one
// session at a time, with every week's logged load on the lift it belongs
// to.
//
// The paper sheet's whole value is that a coach can see, in one glance,
// what was programmed and what got moved week over week. On a phone that
// can't be a grid, so the week columns collapse into a chip row per lift
// and one selected week drives every big number on the screen at once.
//
// THE SHAPE WEEK. Each week of an SPC block is its own spc_workouts row and
// can hold different lifts, so "the session's lifts" is ambiguous. The
// current week of the block is the shape (falling back to the last week
// that has any, for a block that has ended); every other week is read
// through it by exercise_id. A lift that only exists in some other week
// simply doesn't appear — the coach is looking at what they're running now,
// and the print sheet is still there for the full history.

// Everything the preview needs, in one pass. Returns null for a client with
// no block at all — the caller shows the roster's own "no block yet" state
// rather than an empty sheet.
export async function getSpcSessionPreview(userId, today = todayInBoise()) {
  const { data: blocks, error } = await programming
    .from("spc_blocks")
    .select("*")
    .eq("spc_client_id", userId)
    .order("block_start_date");
  if (error) throw error;
  if (!blocks?.length) return null;

  // resolveClientPrograms is the shared definition of "the program she is on"
  // — the roster and the client page already read it, and this file used to
  // carry its own third copy that had drifted: it tested `today <=
  // block_end_date`, which is false for null, so an ONGOING program (0103)
  // never matched the covering branch and was only ever picked up by the
  // last-resort fallback. Correct while it was her only program, wrong the
  // moment another was queued behind it.
  const labeled = labelBlocks(blocks);
  const { current: block } = resolveClientPrograms(labeled, today);
  if (!block) return null;

  const [detail, goal] = await Promise.all([
    getSpcBlockDetail(userId, block.id, today),
    // Its own catch: the goal is one line of context, and a client with no
    // client_goals row (or a failed read) must not blank the whole sheet.
    getClientGoal(userId).catch(() => null),
  ]);

  const currentWeek = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
  const sessionNumbers = [...new Set(detail.sessions.map((s) => s.session_number))].sort((a, b) => a - b);

  // Shape workouts first, so their warm-ups come back in one query rather
  // than one per session tab.
  const shapeBySession = new Map();
  for (const n of sessionNumbers) {
    const weeks = detail.sessions.filter((s) => s.session_number === n).sort((a, b) => a.week_number - b.week_number);
    const shape =
      weeks.find((w) => w.week_number === currentWeek && w.lifts.length > 0) ??
      [...weeks].reverse().find((w) => w.lifts.length > 0) ??
      weeks.find((w) => w.week_number === currentWeek) ??
      weeks[weeks.length - 1];
    if (shape) shapeBySession.set(n, { shape, weeks });
  }

  const warmupsByWorkout = await listSpcWarmupsForWorkouts([...shapeBySession.values()].map((v) => v.shape.id));

  const sessions = sessionNumbers
    .filter((n) => shapeBySession.has(n))
    .map((n) => {
      const { shape, weeks } = shapeBySession.get(n);
      return {
        sessionNumber: n,
        title: shape.title ?? null,
        // The shape row's own publish flag. For a sessions-format run (0102)
        // this is the ONLY status there is — one row per session, recurring
        // every week — so statusByWeek below can only ever answer for week 1.
        status: shape.status,
        weekNumbers: weeks.map((w) => w.week_number),
        // Per-week publish status. The sheet renders the SHAPE week's lifts,
        // which is usually not the week anyone is about to run — so without
        // this a block whose current week is still a draft reads as fully
        // programmed, and the only place that surfaces is the wall display
        // refusing to start it. (Found for real: a client whose week 1 was
        // published and weeks 2-4 were drafts.)
        statusByWeek: Object.fromEntries(weeks.map((w) => [w.week_number, w.status])),
        warmups: warmupsByWorkout.get(shape.id) ?? [],
        lifts: buildLifts(shape, weeks),
      };
    });

  return {
    block,
    blockLabel: block.label,
    // Read by the sheet before it accuses a week of being a draft: a
    // sessions-format run has no per-week row to look up.
    sessionsFormat: block.format === "sessions",
    currentWeek,
    blockLengthWeeks: block.block_length_weeks,
    goal: goal?.goal ?? null,
    sessions,
  };
}

// One row per lift of the shape week, carrying every week's result for that
// same exercise.
function buildLifts(shape, weeks) {
  const labels = liftLabelsFor(shape.lifts);
  return shape.lifts.map((lift) => ({
    id: lift.id,
    exerciseId: lift.exercise_id,
    label: labels[lift.id],
    name: lift.exercises?.name ?? "Unknown exercise",
    lift,
    byWeek: Object.fromEntries(weeks.map((w) => [w.week_number, resultFor(w, lift.exercise_id)])),
  }));
}

// Every set a week logged for a given lift, in set order, plus whatever
// note was written against it.
//
// This used to return ONE set — topSetOf, the heaviest, ties broken by the
// most reps — and the card printed it as "18 × 12" right beside a
// "3 × 10-12" prescription, which reads as the whole session. It wasn't.
// Real weeks it hid, from one client's week 1:
//
//   DB Floor Press           10×10, 10×10, 15×20   showed as "15 × 20"
//   Hamstring Curl Machine   30×20, 40×13, 40×15   showed as "40 × 15"
//   Single Arm Lat Pull Down 20×12, 20×15, 20×10   showed as "20 × 15"
//
// Two of three sets invisible in the first, a warm-up set and a rep drop
// invisible in the others — and in every case the ONE set shown was the
// best of them. A coach reading the card to decide next week's load was
// being handed the highlight and told it was the session.
//
// So: every set, or none. `weightRange`/`repRange` exist only for the week
// chips, which are ~70px wide and can't hold three pills — they say the
// spread ("10–15") rather than picking a winner out of it.
//
// A week with a note but no logged sets still returns a row — a coach
// writing "shoulder was cranky, dropped it" is exactly the thing worth
// seeing on a week that shows no numbers.
function resultFor(week, exerciseId) {
  const rows = (week.logs ?? [])
    .filter((r) => r.exercise_id === exerciseId)
    .filter((r) => r.reps != null || r.weight != null)
    .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
  const noteRow = week.notesByExerciseId?.get(exerciseId) ?? null;
  const note = noteRow?.body ?? rows.find((r) => r.notes)?.notes ?? null;
  if (rows.length === 0 && !note) return null;
  return {
    sets: rows.map((r) => ({ set_number: r.set_number, reps: r.reps, weight: r.weight })),
    logged: rows.length > 0,
    setCount: rows.length,
    weightRange: rangeOf(rows.map((r) => r.weight)),
    repRange: rangeOf(rows.map((r) => r.reps)),
    note,
    // author_name is only on the merged note store (0087); anything older
    // was written from the member's own logging card.
    noteAuthor: noteRow?.author_name ?? null,
  };
}

// "18" when every set matched, "10–15" when they didn't. Null when nothing
// in the week carried the value at all, which is how a reps-only lift ends
// up with no weight range rather than a row of dashes.
//
// Number() then String() rather than any rounding: weight comes back from
// numeric as "15" / "17.5" / "16.25" and each has to print as itself.
function rangeOf(values) {
  const nums = values.map((v) => (v == null ? null : Number(v))).filter((n) => n != null && Number.isFinite(n));
  if (nums.length === 0) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? String(lo) : `${lo}\u2013${hi}`;
}
