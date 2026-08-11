// Server-side mirror of lib/programming/blocks.js's extendGroupBlock and
// spcBlocks.js's extendSpcBlock, for rolling blocks (auto_extend, migration
// 0049) — a block flagged rolling grows a week at a time as it nears its
// end instead of stopping, until a coach switches it off.
//
// Kept in sync with the client versions by hand, same convention as
// _shared/announcementAudience.ts. The two block families have parallel
// schemas, so one implementation covers both via the descriptors below;
// the only real difference is group exercises carry a `tempo` column and
// SPC's don't.

export type BlockKind = {
  blockTable: string;
  ownerColumn: string;
  workoutTable: string;
  workoutBlockFk: string;
  warmupTable: string;
  exerciseTable: string;
  contentWorkoutFk: string;
  exerciseFields: string[];
};

export const GROUP_BLOCK_KIND: BlockKind = {
  blockTable: "group_blocks",
  ownerColumn: "group_program_id",
  workoutTable: "group_workouts",
  workoutBlockFk: "block_id",
  warmupTable: "group_workout_warmups",
  exerciseTable: "group_workout_exercises",
  contentWorkoutFk: "group_workout_id",
  exerciseFields: ["exercise_id", "position", "sets", "reps", "tempo", "notes", "superset_group_id", "rep_scheme", "rest"],
};

export const SPC_BLOCK_KIND: BlockKind = {
  blockTable: "spc_blocks",
  ownerColumn: "spc_client_id",
  workoutTable: "spc_workouts",
  workoutBlockFk: "spc_block_id",
  warmupTable: "spc_workout_warmups",
  exerciseTable: "spc_workout_exercises",
  contentWorkoutFk: "spc_workout_id",
  exerciseFields: ["exercise_id", "position", "sets", "reps", "notes", "superset_group_id", "rep_scheme", "rest"],
};

const WARMUP_FIELDS = ["exercise_id", "position", "label", "sets", "reps", "notes"];

function addDays(dateString: string, days: number) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && startB <= endA;
}

function pick(row: Record<string, unknown>, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = row[f];
  return out;
}

export type ExtendResult = { extended: boolean; reason?: string; newEndDate?: string };

// Appends exactly one week, carrying the block's final week forward —
// content, title, and published state. Published state matters: a new week
// left as a draft is invisible to the member at the RLS layer, so a rolling
// block would silently stall the moment it grew.
export async function extendBlockByOneWeek(
  programming: any,
  kind: BlockKind,
  block: Record<string, any>
): Promise<ExtendResult> {
  const currentLength = block.block_length_weeks;
  if (!currentLength || currentLength < 1) {
    return { extended: false, reason: "block has no length" };
  }

  const newLength = currentLength + 1;
  const newEndDate = addDays(block.block_start_date, newLength * 7 - 1);

  // Same guard the client-side extend applies: never grow over the top of
  // a block already scheduled behind this one. A coach may have queued the
  // next block by hand between two cron runs.
  const { data: siblings, error: siblingsError } = await programming
    .from(kind.blockTable)
    .select("id, block_start_date, block_end_date")
    .eq(kind.ownerColumn, block[kind.ownerColumn]);
  if (siblingsError) throw siblingsError;

  const clash = (siblings ?? []).some(
    (b: any) => b.id !== block.id && rangesOverlap(block.block_start_date, newEndDate, b.block_start_date, b.block_end_date)
  );
  if (clash) return { extended: false, reason: "would overlap the next block" };

  const { data: lastWeek, error: lastWeekError } = await programming
    .from(kind.workoutTable)
    .select("id, session_number, status, title")
    .eq(kind.workoutBlockFk, block.id)
    .eq("week_number", currentLength)
    .order("session_number");
  if (lastWeekError) throw lastWeekError;
  if (!lastWeek || lastWeek.length === 0) return { extended: false, reason: "final week has no sessions to repeat" };

  const newRows = lastWeek.map((w: any) => ({
    [kind.workoutBlockFk]: block.id,
    session_number: w.session_number,
    week_number: newLength,
    title: w.title,
    status: w.status,
  }));
  const { data: inserted, error: insertError } = await programming.from(kind.workoutTable).insert(newRows).select();
  if (insertError) throw insertError;

  // Rows first, dates second — if the copy below fails, the coach is left
  // with real (if empty) weeks rather than an end date claiming weeks that
  // have no sessions behind them.
  const { error: updateError } = await programming
    .from(kind.blockTable)
    .update({ block_length_weeks: newLength, block_end_date: newEndDate })
    .eq("id", block.id);
  if (updateError) throw updateError;

  const targetBySession: Record<number, string> = {};
  for (const row of inserted ?? []) targetBySession[row.session_number] = row.id;

  for (const source of lastWeek) {
    const targetId = targetBySession[source.session_number];
    if (!targetId) continue;

    const [{ data: warmups, error: warmupError }, { data: exercises, error: exerciseError }] = await Promise.all([
      programming.from(kind.warmupTable).select("*").eq(kind.contentWorkoutFk, source.id).order("position"),
      programming.from(kind.exerciseTable).select("*").eq(kind.contentWorkoutFk, source.id).order("position"),
    ]);
    if (warmupError) throw warmupError;
    if (exerciseError) throw exerciseError;

    if (warmups?.length) {
      const { error } = await programming
        .from(kind.warmupTable)
        .insert(warmups.map((w: any) => ({ [kind.contentWorkoutFk]: targetId, ...pick(w, WARMUP_FIELDS) })));
      if (error) throw error;
    }
    if (exercises?.length) {
      const { error } = await programming
        .from(kind.exerciseTable)
        .insert(exercises.map((e: any) => ({ [kind.contentWorkoutFk]: targetId, ...pick(e, kind.exerciseFields) })));
      if (error) throw error;
    }
  }

  return { extended: true, newEndDate };
}
