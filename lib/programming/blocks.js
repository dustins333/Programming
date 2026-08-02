import { programming } from "../supabase/client";
import { rangesOverlap } from "../dateRange";
import { formatDateMDY } from "../formatDate";

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
export async function createGroupProgram({ name, blockLengthWeeks, sessionsPerWeek, sessionDays }) {
  const { data, error } = await programming
    .from("group_programs")
    .insert({ name, block_length_weeks: blockLengthWeeks, sessions_per_week: sessionsPerWeek, session_days: sessionDays })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Free-form patch for an existing program's settings — name, block
// length, sessions/week, or the day-of-week map. Only affects blocks
// created after the change; existing group_workouts rows already have
// their session_number/week_number baked in and aren't touched.
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

export function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
export async function createBlock({ groupProgramId, startDate, createdBy }) {
  const { data: program, error: programError } = await programming
    .from("group_programs")
    .select("block_length_weeks, sessions_per_week")
    .eq("id", groupProgramId)
    .single();
  if (programError) throw programError;

  const endDate = addDays(startDate, program.block_length_weeks * 7 - 1);

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
      block_end_date: endDate,
      created_by: createdBy,
    })
    .select()
    .single();
  if (blockError) throw blockError;

  const workoutRows = [];
  for (let week = 1; week <= program.block_length_weeks; week += 1) {
    for (let session = 1; session <= program.sessions_per_week; session += 1) {
      workoutRows.push({ block_id: block.id, session_number: session, week_number: week });
    }
  }
  const { error: workoutsError } = await programming.from("group_workouts").insert(workoutRows);
  if (workoutsError) throw workoutsError;

  return block;
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
