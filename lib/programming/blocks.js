import { programming } from "../supabase/client";
import { addDays, mondayOnOrBefore } from "../boiseDate";
import { rangesOverlap } from "../dateRange";
import { formatDateMDY } from "../formatDate";
import { copyWorkoutContent } from "./workouts";
import { currentWeekNumber } from "./schedule";

export async function listGroupPrograms() {
  const { data, error } = await programming.from("group_programs").select("*").order("name");
  if (error) throw error;
  return data;
}

// Coach-facing "add a new group program type" — group_programs.name is no
// longer locked to Flagship/Better With Age (see migration 0010), so a
// coach can spin up a specialty program (e.g. "Look Like You Lift") that
// works exactly like Flagship/BWA: shared calendar, shared coach-authored
// content, clients opted in via client_program_assignments memberships.
// sessionDays (migration 0011) is that program's own day-of-week map —
// each program can run at a different frequency/schedule now, so this is
// no longer assumed to be the Flagship/BWA Mon/Tue-Wed/Thu-Fri/Sat scheme.
// blockLengthWeeks is no longer asked for when creating a program — block
// length is picked per block in the New block dialog, so the only thing this
// column still does is act as createBlock's last-resort fallback. Callers
// pass the gym-wide default; the column is `not null` with no DB default, so
// something has to be supplied here.
export async function createGroupProgram({ name, blockLengthWeeks = 4, sessionsPerWeek, sessionDays, hubEnabled = false }) {
  const { data, error } = await programming
    .from("group_programs")
    .insert({
      name,
      block_length_weeks: blockLengthWeeks,
      sessions_per_week: sessionsPerWeek,
      session_days: sessionDays,
      hub_enabled: Boolean(hubEnabled),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Free-form patch for an existing program's settings — name, sessions/week,
// or the day-of-week map.
//
// The two fields differ in when they bite, which the modal's copy now says
// out loud: sessions_per_week is read by createBlock to build the session x
// week grid, so it only affects blocks made after the change (existing
// group_workouts rows keep the session_number/week_number they were built
// with). session_days is read LIVE by the member screens through
// sessionNumberForDate, so changing it re-routes blocks that are already
// running — which is generally what you want when a program moves days, but
// it is not "future blocks only".
export async function updateGroupProgram(programId, fields) {
  const { error } = await programming.from("group_programs").update(fields).eq("id", programId);
  if (error) throw error;
}

export async function getBlock(blockId) {
  const { data, error } = await programming
    .from("group_blocks")
    .select("*, group_programs(name, sessions_per_week)")
    .eq("id", blockId)
    .single();
  if (error) throw error;
  return data;
}

export async function listBlocks() {
  const { data, error } = await programming
    .from("group_blocks")
    .select("*, group_programs(name, sessions_per_week)")
    .order("block_start_date", { ascending: false });
  if (error) throw error;
  return data;
}

// Re-exported from lib/boiseDate.js rather than reimplemented — three
// separate copies of this existed and all three carried the same
// local-parse/UTC-format off-by-one for positive UTC offsets.
export { addDays } from "../boiseDate";

// Creates the block plus the full empty session x week grid of
// group_workouts rows (all drafts) so the builder has somewhere to land —
// full block-management UI (editing dates, viewing a calendar) is Phase 3;
// this is just enough to unblock testing the builder itself.
//
// Real overlap prevention, not just a UI convention: the grid's gap-aware
// "Start new block" button always computes a gap-free date so it can never
// trigger this in practice, but the manual-date "+ New Block" modal has no
// such guarantee — this is the same class of bug fixed for SPC (two
// overlapping spc_blocks rows for one client hid real published sessions;
// see spcBlocks.js's createSpcBlock), just scoped to "one program" instead
// of "one client" since group blocks are shared across every client in a
// program rather than per-client.
//
// lengthWeeks is optional — omit it and the block takes the program's own
// default, which is what every caller did before per-block lengths existed.
// Passing it stores that length on the block itself (migration 0049), so a
// one-off longer or shorter cycle no longer requires editing the whole
// program's default and changing every future block along with it.
export async function createBlock({ groupProgramId, startDate: requestedStart, createdBy, lengthWeeks }) {
  const { data: program, error: programError } = await programming
    .from("group_programs")
    .select("block_length_weeks, sessions_per_week")
    .eq("id", groupProgramId)
    .single();
  if (programError) throw programError;

  const weeks = Number(lengthWeeks) > 0 ? Math.floor(Number(lengthWeeks)) : program.block_length_weeks;
  // Every block runs Monday–Sunday, so a block week and a calendar week are
  // the same seven days — before this, currentWeekNumber() counted flat
  // 7-day chunks from the start date while sessionNumberForDate() assigned
  // sessions by weekday, so a mid-week start split one calendar week's
  // sessions across two block weeks. Snapping BACK rather than forward keeps
  // the block covering the date the coach asked for. A no-op for every
  // gap-aware caller: blocks are whole weeks ending Sunday, so "day after
  // the last block" is already a Monday. Migration 0063 adds the CHECK
  // constraint that makes this impossible to bypass.
  const startDate = mondayOnOrBefore(requestedStart);
  const endDate = addDays(startDate, weeks * 7 - 1);

  const existingBlocks = await listBlocksForProgram(groupProgramId);
  const overlap = existingBlocks.find((b) => rangesOverlap(startDate, endDate, b.block_start_date, b.block_end_date));
  if (overlap) {
    throw new Error(
      `That date range overlaps an existing block (${formatDateMDY(overlap.block_start_date)} – ${formatDateMDY(overlap.block_end_date)}) for this program. Adjust the start date.`
    );
  }

  const { data: block, error: blockError } = await programming
    .from("group_blocks")
    .insert({
      group_program_id: groupProgramId,
      block_start_date: startDate,
      block_length_weeks: weeks,
      block_end_date: endDate,
      created_by: createdBy,
    })
    .select()
    .single();
  if (blockError) throw blockError;

  // Queueing a block behind a rolling one ends the rolling — see the SPC
  // version in spcBlocks.js's createSpcBlock for the full reasoning.
  const { error: rollingError } = await programming
    .from("group_blocks")
    .update({ auto_extend: false })
    .eq("group_program_id", groupProgramId)
    .eq("auto_extend", true)
    .lt("block_end_date", startDate);
  if (rollingError) throw rollingError;

  const workoutRows = [];
  for (let week = 1; week <= weeks; week += 1) {
    for (let session = 1; session <= program.sessions_per_week; session += 1) {
      workoutRows.push({ block_id: block.id, session_number: session, week_number: week });
    }
  }
  const { error: workoutsError } = await programming.from("group_workouts").insert(workoutRows);
  if (workoutsError) throw workoutsError;

  return block;
}

// programId -> the length of that program's most recent block, in one query
// rather than one per program.
//
// This is what a new block's length stepper starts at: "same as last time" is
// what a coach wants nearly every time, and it's the only seed that stays
// right as a program's typical cycle changes, without anyone maintaining a
// stored default. The gym-wide `default_block_length_weeks` setting is only
// reached for a program's very first block, when there's nothing to copy.
//
// First row wins per program because the order is newest-first.
export async function listLatestBlockLengthByProgram() {
  const { data, error } = await programming
    .from("group_blocks")
    .select("group_program_id, block_length_weeks")
    .order("block_start_date", { ascending: false });
  if (error) throw error;

  const byProgram = {};
  for (const block of data) {
    if (!(block.group_program_id in byProgram)) byProgram[block.group_program_id] = block.block_length_weeks;
  }
  return byProgram;
}

// Every block for one program, oldest first — lets a caller work out
// calendar coverage (which block, if any, covers a given date) across the
// whole timeline rather than just "the one active today".
export async function listBlocksForProgram(groupProgramId) {
  const { data, error } = await programming
    .from("group_blocks")
    .select("*")
    .eq("group_program_id", groupProgramId)
    .order("block_start_date");
  if (error) throw error;
  return data;
}

// Admin-only at the RLS layer (migration 0016) — the UI should only ever
// show this for blocks that haven't started yet, so a coach can undo an
// accidental "+ New Block" click before it's actually in use.
export async function deleteBlock(blockId) {
  const { error } = await programming.from("group_blocks").delete().eq("id", blockId);
  if (error) throw error;
}

export async function listWorkoutsForBlock(blockId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("*")
    .eq("block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;
  return data;
}

// --- Extending a live block --------------------------------------------

// Appends whole weeks to a block that's already running, rather than
// making the coach duplicate the whole thing every cycle. Some clients
// genuinely keep doing the same lifts indefinitely; before this, the only
// way to express that was creating a fresh block over and over by hand.
//
// copyLastWeek carries the block's final week forward into each new one
// (warm-ups, exercises, set schemes, titles), which is the point for a
// client repeating the same work — pass false for blank weeks instead.
//
// Overlap is re-checked against the program's other blocks: a block can't
// be extended over the top of one already scheduled behind it, same guard
// createBlock() applies at creation.
export async function extendGroupBlock(blockId, { weeks = 1, copyLastWeek = true } = {}) {
  const added = Math.floor(Number(weeks));
  if (!Number.isFinite(added) || added < 1) throw new Error("Extend by at least one week.");

  const { data: block, error: blockError } = await programming
    .from("group_blocks")
    .select("*, group_programs(sessions_per_week)")
    .eq("id", blockId)
    .single();
  if (blockError) throw blockError;

  const currentLength = block.block_length_weeks;
  const newLength = currentLength + added;
  const newEndDate = addDays(block.block_start_date, newLength * 7 - 1);

  const existingBlocks = await listBlocksForProgram(block.group_program_id);
  const clash = existingBlocks
    .filter((b) => b.id !== blockId)
    .find((b) => rangesOverlap(block.block_start_date, newEndDate, b.block_start_date, b.block_end_date));
  if (clash) {
    throw new Error(
      `Extending this far would run into the next block (${formatDateMDY(clash.block_start_date)} – ${formatDateMDY(clash.block_end_date)}). Extend by fewer weeks, or move that block.`
    );
  }

  const sessionsPerWeek = block.group_programs?.sessions_per_week ?? 3;
  const newRows = [];
  for (let week = currentLength + 1; week <= newLength; week += 1) {
    for (let session = 1; session <= sessionsPerWeek; session += 1) {
      newRows.push({ block_id: blockId, session_number: session, week_number: week });
    }
  }
  const { data: inserted, error: insertError } = await programming.from("group_workouts").insert(newRows).select();
  if (insertError) throw insertError;

  // Rows first, dates second: if the copy below fails the coach is left
  // with empty-but-real weeks they can fill in, rather than a block whose
  // end date claims weeks that have no sessions behind them at all.
  const { error: updateError } = await programming
    .from("group_blocks")
    .update({ block_length_weeks: newLength, block_end_date: newEndDate })
    .eq("id", blockId);
  if (updateError) throw updateError;

  if (copyLastWeek) {
    const { data: sourceWeek, error: sourceError } = await programming
      .from("group_workouts")
      .select("id, session_number, status")
      .eq("block_id", blockId)
      .eq("week_number", currentLength);
    if (sourceError) throw sourceError;

    const sourceBySession = Object.fromEntries(sourceWeek.map((w) => [w.session_number, w]));
    for (const row of inserted) {
      const source = sourceBySession[row.session_number];
      if (!source) continue;
      await copyWorkoutContent(source.id, row.id);
      // Published state travels with the content. "Repeat last week" has
      // to mean the member actually sees it — a new week left as a draft
      // is invisible to them at the RLS layer, which for a rolling block
      // would silently stall the very thing this exists to keep going.
      // Blank weeks stay drafts, as any new week always has.
      if (source.status === "published") {
        const { error: statusError } = await programming
          .from("group_workouts")
          .update({ status: "published" })
          .eq("id", row.id);
        if (statusError) throw statusError;
      }
    }
  }

  return { blockId, newLength, newEndDate, weeksAdded: added };
}

// A rolling block keeps growing on its own — see the daily scan in
// supabase/functions/scan-spc-alerts. Turning it off just stops the
// growth; the block keeps whatever weeks it already has.
// --- Trimming a block back ---------------------------------------------
//
// The inverse of extendGroupBlock: end the block after `lastWeek` and remove
// every week past it. Deliberately trim-the-tail only, never "delete week 4 of
// 7" — a block's dates are arithmetic off block_start_date, so removing a week
// from the middle would either renumber everything below it (silently turning
// week 5's programming into week 4) or leave a hole in the calendar. Every
// real case this exists for is a tail: ending early, undoing an over-extend,
// and turning a rolling block off without being stuck with the weeks it
// already grew.
//
// **Refuses rather than cascades.** session_completions is ON DELETE CASCADE
// on group_workout_id, so deleting a week that a member already finished would
// silently erase her record of finishing it — which is what My Week's counts,
// adherence and the missed-session flags all read. Her logged sets would
// survive (logs is ON DELETE SET NULL) but be orphaned, so the damage is
// invisible until someone notices a completed week reading as missed.
export async function trimGroupBlockTo(blockId, lastWeek) {
  const keep = Math.floor(Number(lastWeek));
  if (!Number.isFinite(keep) || keep < 1) throw new Error("A block has to keep at least one week.");

  const { data: block, error: blockError } = await programming.from("group_blocks").select("*").eq("id", blockId).single();
  if (blockError) throw blockError;
  if (keep >= block.block_length_weeks) return { removedWeeks: 0, wasRolling: false };

  const current = currentWeekNumber(block.block_start_date, block.block_length_weeks);
  if (keep < current) {
    throw new Error(`This block is in week ${current}. It can end after week ${current} at the earliest, not partway through a week already in progress.`);
  }

  const { data: doomed, error: doomedError } = await programming
    .from("group_workouts")
    .select("id, week_number")
    .eq("block_id", blockId)
    .gt("week_number", keep);
  if (doomedError) throw doomedError;

  if (doomed.length) {
    const ids = doomed.map((w) => w.id);
    const { data: finished, error: finishedError } = await programming
      .from("session_completions")
      .select("group_workout_id")
      .in("group_workout_id", ids);
    if (finishedError) throw finishedError;
    if (finished.length) {
      const byId = new Map(doomed.map((w) => [w.id, w.week_number]));
      const weeks = [...new Set(finished.map((f) => byId.get(f.group_workout_id)).filter(Boolean))].sort((a, b) => a - b);
      throw new Error(
        `Week ${weeks.join(", ")} already has a finished session. Ending the block there would erase that record — clear the lifts instead, or leave the week in place.`
      );
    }
    const { error: deleteError } = await programming.from("group_workouts").delete().in("id", ids);
    if (deleteError) throw deleteError;
  }

  const { error: updateError } = await programming
    .from("group_blocks")
    .update({
      block_length_weeks: keep,
      block_end_date: addDays(block.block_start_date, keep * 7 - 1),
      // A rolling block would regrow exactly what we just removed on the next
      // scan, so trimming one necessarily stops it rolling.
      auto_extend: false,
    })
    .eq("id", blockId);
  if (updateError) throw updateError;

  return { removedWeeks: block.block_length_weeks - keep, wasRolling: Boolean(block.auto_extend) };
}

export async function setGroupBlockAutoExtend(blockId, autoExtend) {
  const { error } = await programming.from("group_blocks").update({ auto_extend: autoExtend }).eq("id", blockId);
  if (error) throw error;
}
