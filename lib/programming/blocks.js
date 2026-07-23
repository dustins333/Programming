import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";

export async function listGroupPrograms() {
  const { data, error } = await programming.from("group_programs").select("*").order("name");
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

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Creates the block plus the full empty session x week grid of
// group_workouts rows (all drafts) so the builder has somewhere to land —
// full block-management UI (editing dates, viewing a calendar) is Phase 3;
// this is just enough to unblock testing the builder itself.
export async function createBlock({ groupProgramId, startDate, createdBy }) {
  const { data: program, error: programError } = await programming
    .from("group_programs")
    .select("block_length_weeks, sessions_per_week")
    .eq("id", groupProgramId)
    .single();
  if (programError) throw programError;

  const endDate = addDays(startDate, program.block_length_weeks * 7 - 1);

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

// Most recent block for a program regardless of whether it's active,
// ended, or not started yet — same .order().limit(1).maybeSingle() guard
// used elsewhere for "at most one row" queries. Used to find the gap-free
// next start date, and to tell "nothing scheduled" apart from "already has
// a future block queued up".
export async function getLatestBlock(groupProgramId) {
  const { data, error } = await programming
    .from("group_blocks")
    .select("*")
    .eq("group_program_id", groupProgramId)
    .order("block_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Auto-creates the next block starting the day after the program's most
// recently-ended block (or today, if this program has never had one) — so
// a coach filling a programming gap never has to think about what start
// date prevents a lapse, and can't accidentally leave one by picking the
// wrong date by hand.
export async function startNextBlock(groupProgramId, createdBy) {
  const latest = await getLatestBlock(groupProgramId);
  const startDate = latest ? addDays(latest.block_end_date, 1) : todayInBoise();
  return createBlock({ groupProgramId, startDate, createdBy });
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
