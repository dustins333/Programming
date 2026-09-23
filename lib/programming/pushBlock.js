import { programming } from "../supabase/client";
import { todayInBoise, mondayOnOrBefore, addDays } from "../boiseDate";
import { createBlock, listBlocksForProgram, setGroupBlockAutoExtend } from "./blocks";
import { exerciseCopyFields, warmupCopyFields, setWorkoutStatusBulk } from "./workouts";

// "Push to…" on the Group Programs page: take a block a coach has trialed
// (the Trial Group is a normal group program with only coaches on it) and
// make it the next block of a real program.
//
// Never overwrites. The content lands in either:
//   - a brand-new block starting the Monday after the target's last block
//     ends (or this Monday, if nothing is running), or
//   - the target's queued future block, but only if that block is entirely
//     empty. A coach who clicked "Start new block" before the trial was done
//     shouldn't end up with an empty block sitting in front of the real one.
// Anything else with content in it is left alone.
//
// ONE week of the source goes out, repeated across every week of the target:
// the week the coaches are on right now, which is the version they settled on
// after changing it on the fly. Earlier weeks of the trial are the drafts they
// moved past, so sending them would ship work they had already rejected.
//
// Both programs have to run the same number of sessions a week. Session 3
// of a 3x program has nowhere to go in a 2x program, and silently dropping
// it is worse than refusing.

// Pushing only ever goes one way: out of the trial program, into a real one.
//
// group_programs.is_trial (migration 0134) is the answer. The name check is
// kept only for the window where a deploy is live and that migration hasn't
// been run: the column is absent then, so every program would read as
// not-the-trial and the bench would vanish.
export function isTrialProgram(program) {
  if (typeof program?.is_trial === "boolean") return program.is_trial;
  return /trial/i.test(program?.name ?? "");
}

async function contentCounts(workoutIds) {
  if (workoutIds.length === 0) return new Map();
  const [ex, wu] = await Promise.all([
    programming.from("group_workout_exercises").select("group_workout_id").in("group_workout_id", workoutIds),
    programming.from("group_workout_warmups").select("group_workout_id").in("group_workout_id", workoutIds),
  ]);
  if (ex.error) throw ex.error;
  if (wu.error) throw wu.error;
  const counts = new Map();
  for (const r of [...ex.data, ...wu.data]) counts.set(r.group_workout_id, (counts.get(r.group_workout_id) ?? 0) + 1);
  return counts;
}

async function workoutsFor(blockId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("id, week_number, session_number, title, status")
    .eq("block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;
  return data;
}

// Where a push into this program would land. Read-only, so the dialog can
// show "Starts Mon 10/5" before anything is written.
export async function planPush(targetProgramId) {
  const blocks = await listBlocksForProgram(targetProgramId);
  const today = todayInBoise();
  const last = blocks[blocks.length - 1] ?? null;

  if (last && last.block_start_date > today) {
    const workouts = await workoutsFor(last.id);
    const counts = await contentCounts(workouts.map((w) => w.id));
    if (workouts.every((w) => !counts.get(w.id))) {
      return { mode: "fill", block: last, startDate: last.block_start_date, endDate: last.block_end_date, lengthWeeks: last.block_length_weeks };
    }
  }

  const thisMonday = mondayOnOrBefore(today);
  const afterLast = last ? addDays(last.block_end_date, 1) : thisMonday;
  const startDate = afterLast > thisMonday ? afterLast : thisMonday;
  return {
    mode: "create",
    startDate,
    lastBlock: last,
    // A rolling block keeps growing, so "after it ends" is only true once the
    // new block ends it. createBlock turns rolling off for exactly this case.
    endsRolling: Boolean(last?.auto_extend),
    seedLengthWeeks: last?.block_length_weeks ?? null,
  };
}

export async function pushBlockToProgram({ sourceBlockId, sourceWeekNumber, targetProgramId, lengthWeeks, publish, createdBy }) {
  const [{ data: source, error: sourceError }, { data: target, error: targetError }] = await Promise.all([
    programming.from("group_blocks").select("*, group_programs(id, name, sessions_per_week)").eq("id", sourceBlockId).single(),
    programming.from("group_programs").select("id, name, sessions_per_week").eq("id", targetProgramId).single(),
  ]);
  if (sourceError) throw sourceError;
  if (targetError) throw targetError;
  if (!isTrialProgram(source.group_programs)) throw new Error("Blocks can only be pushed from the trial program.");
  if (isTrialProgram(target)) throw new Error("Pick a program other than the trial one to push to.");
  if (source.group_programs.sessions_per_week !== target.sessions_per_week) {
    throw new Error(
      `${target.name} runs ${target.sessions_per_week} sessions a week and ${source.group_programs.name} runs ${source.group_programs.sessions_per_week}, so the sessions don't line up.`
    );
  }

  const allSourceWorkouts = await workoutsFor(sourceBlockId);
  const week = sourceWeekNumber ?? Math.max(...allSourceWorkouts.map((w) => w.week_number));
  const sourceWorkouts = allSourceWorkouts.filter((w) => w.week_number === week);
  const sourceIds = sourceWorkouts.map((w) => w.id);
  const [{ data: warmups, error: wuError }, { data: exercises, error: exError }, { data: education, error: edError }] =
    await Promise.all([
      programming.from("group_workout_warmups").select("*").in("group_workout_id", sourceIds),
      programming.from("group_workout_exercises").select("*").in("group_workout_id", sourceIds),
      programming.from("session_education").select("*").eq("group_block_id", sourceBlockId),
    ]);
  if (wuError) throw wuError;
  if (exError) throw exError;
  if (edError) throw edError;
  if (warmups.length + exercises.length === 0) throw new Error("That block has nothing in it to push.");

  // Re-planned here rather than trusting what the dialog showed: someone may
  // have filled the queued block, or added one, since it opened.
  const plan = await planPush(targetProgramId);
  const targetBlock =
    plan.mode === "fill"
      ? plan.block
      : await createBlock({ groupProgramId: targetProgramId, startDate: plan.startDate, createdBy, lengthWeeks });

  const targetWorkouts = await workoutsFor(targetBlock.id);
  const sourceBySession = new Map(sourceWorkouts.map((w) => [w.session_number, w]));

  const warmupRows = [];
  const exerciseRows = [];
  const titleUpdates = new Map(); // title -> target ids
  const filledIds = [];
  for (const t of targetWorkouts) {
    const src = sourceBySession.get(t.session_number);
    if (!src) continue;
    const w = warmups.filter((r) => r.group_workout_id === src.id);
    const e = exercises.filter((r) => r.group_workout_id === src.id);
    if (w.length + e.length === 0) continue;
    for (const r of w) warmupRows.push({ group_workout_id: t.id, ...warmupCopyFields(r) });
    for (const r of e) exerciseRows.push({ group_workout_id: t.id, ...exerciseCopyFields(r) });
    filledIds.push(t.id);
    if (src.title) titleUpdates.set(src.title, [...(titleUpdates.get(src.title) ?? []), t.id]);
  }

  // One insert per table instead of one per session: a 6-week block is 18
  // sessions, and the per-session copy is eight round trips each.
  if (warmupRows.length) {
    const { error } = await programming.from("group_workout_warmups").insert(warmupRows);
    if (error) throw error;
  }
  if (exerciseRows.length) {
    const { error } = await programming.from("group_workout_exercises").insert(exerciseRows);
    if (error) throw error;
  }
  for (const [title, ids] of titleUpdates) {
    const { error } = await programming.from("group_workouts").update({ title }).in("id", ids);
    if (error) throw error;
  }

  // Coach education is keyed to (block, session number), so it carries over
  // once per session rather than once per week. Skipped if the target block
  // already has some, the same no-overwrite rule as the lifts.
  if (education.length) {
    const { count, error: existingError } = await programming
      .from("session_education")
      .select("id", { count: "exact", head: true })
      .eq("group_block_id", targetBlock.id);
    if (existingError) throw existingError;
    if (!count) {
      const { error } = await programming.from("session_education").insert(
        education.map((r) => ({
          group_block_id: targetBlock.id,
          session_number: r.session_number,
          exercise_id: r.exercise_id,
          notes: r.notes,
          video_urls: r.video_urls,
          scope: r.scope,
          position: r.position,
          created_by: createdBy,
        }))
      );
      if (error) throw error;
    }
  }

  if (publish && filledIds.length) await setWorkoutStatusBulk(filledIds, "published");

  // Closing the trial out: the roll stops, so the block it was built in ends
  // on its own that Sunday and the bench is clear for the next one. Nothing is
  // deleted — the trial stays in block history with everything logged against
  // it. Last, so a push that failed halfway leaves the trial running.
  if (source.auto_extend) await setGroupBlockAutoExtend(sourceBlockId, false);

  return {
    block: targetBlock,
    mode: plan.mode,
    sessions: filledIds.length,
    targetName: target.name,
    trialEnds: source.block_end_date,
  };
}
