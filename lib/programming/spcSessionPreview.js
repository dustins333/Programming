import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { currentWeekNumber } from "./schedule";
import { labelBlocks } from "./spcBlocks";
import { getSpcBlockDetail } from "./spcBlockDetail";
import { listSpcWarmupsForWorkouts } from "./spcWorkouts";
import { getClientGoal } from "./clientGoals";
import { topSetOf } from "./exerciseStats";
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

  const labeled = labelBlocks(blocks);
  // Same rule as getSpcRosterDetail: the block covering today, else the next
  // one starting, else the last one that ran. Drafts (0089) are excluded —
  // this is the sheet a coach reads on the floor, and a block nobody has been
  // given isn't what anyone is running. They also sort last, having no start
  // date, so they'd otherwise win the final fallback.
  const scheduled = labeled.filter((b) => b.status !== "draft");
  if (scheduled.length === 0) return null;
  const block =
    scheduled.find((b) => b.block_start_date <= today && today <= b.block_end_date) ??
    scheduled.find((b) => b.block_start_date > today) ??
    scheduled[scheduled.length - 1];

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

// What a given week did with a given lift: its top set, plus whatever note
// was written against it.
//
// A week with a note but no logged sets still returns a row — a coach
// writing "shoulder was cranky, dropped it" is exactly the thing worth
// seeing on a week that shows no numbers.
function resultFor(week, exerciseId) {
  const rows = (week.logs ?? []).filter((r) => r.exercise_id === exerciseId);
  const top = topSetOf(rows);
  const noteRow = week.notesByExerciseId?.get(exerciseId) ?? null;
  const note = noteRow?.body ?? rows.find((r) => r.notes)?.notes ?? null;
  if (!top && !note) return null;
  return {
    weight: top?.weight ?? null,
    reps: top?.reps ?? null,
    logged: Boolean(top),
    note,
    // author_name is only on the merged note store (0087); anything older
    // was written from the member's own logging card.
    noteAuthor: noteRow?.author_name ?? null,
  };
}
