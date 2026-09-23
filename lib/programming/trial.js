import { programming } from "../supabase/client";
import { todayInBoise, mondayOnOrBefore, addDays } from "../boiseDate";
import { createBlock, listBlocksForProgram, setGroupBlockAutoExtend } from "./blocks";
import { listSessionSummaries, listWorkoutExerciseRowsForWorkouts, setWorkoutStatusBulk } from "./workouts";
import { currentWeekNumber, blockLengthWeeks } from "./schedule";

// The trial bench (migration 0134's group_programs.is_trial).
//
// A coach builds the gym's next block here, runs it on themselves, changes it
// on the fly for a week or three, then pushes it to a real group program.
// The screen shows only the 1-3 sessions — no block, no weeks, no length.
//
// Underneath it is still an ordinary group block, because everything a coach
// and member already rely on is keyed to one: logging, session completions,
// My Week, block history. What makes it feel weekless is that the block is
// ROLLING (auto_extend, 0049): the nightly scan adds a week as this one runs
// out, copying the last week forward with its published state, so the same
// sessions carry on by themselves. This screen always edits the week that
// covers today, which is why editing on the fly never rewrites what was
// logged in an earlier week — each week has its own rows.
//
// Pushing closes the trial out: the roll stops, so the block ends that
// Sunday, and the next trial starts on a Monday (group_blocks has a CHECK
// that a block starts on a Monday, migration 0063).

// A trial's sessions are published as they're built rather than finalized in
// one go. Only coaches are on the trial program, the whole point of the bench
// is that what they build is what they walk out and lift, and a draft is
// invisible to them at the RLS layer.
async function publishAll(workoutIds) {
  await setWorkoutStatusBulk(workoutIds, "published");
}

async function sessionsFor(block, weekNumber) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("id, week_number, session_number, title, status")
    .eq("block_id", block.id)
    .eq("week_number", weekNumber)
    .order("session_number");
  if (error) throw error;
  const ids = data.map((w) => w.id);
  const [summaries, rows] = await Promise.all([listSessionSummaries(ids), listWorkoutExerciseRowsForWorkouts(ids)]);
  return data.map((w) => ({
    ...w,
    summary: summaries[w.id] ?? { liftCount: 0, warmupCount: 0, supersetCount: 0, names: [] },
    lifts: rows[w.id] ?? [],
  }));
}

// Everything the workbench needs in one call: what's running now, and a
// trial queued for a later Monday if the coach started the next one early.
export async function getTrialState(program) {
  const blocks = await listBlocksForProgram(program.id);
  const today = todayInBoise();

  const currentBlock = blocks.find((b) => b.block_start_date <= today && today <= b.block_end_date) ?? null;
  const nextBlock = blocks.find((b) => b.block_start_date > today) ?? null;

  const current = currentBlock
    ? {
        block: currentBlock,
        weekNumber: currentWeekNumber(currentBlock.block_start_date, blockLengthWeeks(currentBlock, program)),
        sessions: await sessionsFor(
          currentBlock,
          currentWeekNumber(currentBlock.block_start_date, blockLengthWeeks(currentBlock, program))
        ),
        // The roll being off means this block stops at its end date, which is
        // what a push does to it. Said plainly on the screen rather than left
        // for a coach to discover on Monday.
        closing: !currentBlock.auto_extend,
      }
    : null;

  const next = nextBlock ? { block: nextBlock, weekNumber: 1, sessions: await sessionsFor(nextBlock, 1), closing: false } : null;

  return {
    current,
    next,
    // The Monday a new trial could start on: this one if nothing is running,
    // otherwise the one after whatever is running or queued ends.
    nextAvailableMonday: nextAvailableMonday(blocks, today),
  };
}

function nextAvailableMonday(blocks, today) {
  const thisMonday = mondayOnOrBefore(today);
  const covering = blocks.filter((b) => b.block_end_date >= thisMonday);
  if (covering.length === 0) return thisMonday;
  const lastEnd = covering.reduce((max, b) => (b.block_end_date > max ? b.block_end_date : max), covering[0].block_end_date);
  return addDays(lastEnd, 1);
}

// Starts a blank trial: one week, rolling, published. It grows itself a week
// at a time from there, so "how long is this trial" is never asked.
export async function startTrial({ program, createdBy, startDate }) {
  const block = await createBlock({
    groupProgramId: program.id,
    startDate: startDate ?? mondayOnOrBefore(todayInBoise()),
    createdBy,
    lengthWeeks: 1,
  });
  await setGroupBlockAutoExtend(block.id, true);
  const { data, error } = await programming.from("group_workouts").select("id").eq("block_id", block.id);
  if (error) throw error;
  await publishAll(data.map((w) => w.id));
  return block;
}

// Stops the roll without removing anything: the trial finishes out the week
// it's in. This is what a push does, and what "End this trial" does by hand.
export async function endTrial(blockId) {
  await setGroupBlockAutoExtend(blockId, false);
}
