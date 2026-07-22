import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getSpcBlock(blockId) {
  const { data, error } = await programming.from("spc_blocks").select("*").eq("id", blockId).single();
  if (error) throw error;
  return data;
}

export async function listBlocksForSpcClient(spcClientId) {
  const { data, error } = await programming
    .from("spc_blocks")
    .select("*")
    .eq("spc_client_id", spcClientId)
    .order("block_start_date", { ascending: false });
  if (error) throw error;
  return data;
}

// Creates the block plus one blank-draft spc_workouts row per session
// (1..sessionsPerWeek) — same "seed the grid so the builder has somewhere
// to land" idea as blocks.js's createBlock, just 1-D instead of a
// week x session grid since SPC weeks live as columns, not rows.
export async function createSpcBlock({ spcClientId, coachId, startDate, lengthWeeks, sessionsPerWeek }) {
  const endDate = addDays(startDate, lengthWeeks * 7 - 1);

  const { data: block, error: blockError } = await programming
    .from("spc_blocks")
    .insert({
      spc_client_id: spcClientId,
      coach_id: coachId,
      block_start_date: startDate,
      block_length_weeks: lengthWeeks,
      block_end_date: endDate,
    })
    .select()
    .single();
  if (blockError) throw blockError;

  const workoutRows = [];
  for (let session = 1; session <= sessionsPerWeek; session += 1) {
    workoutRows.push({ spc_block_id: block.id, session_number: session });
  }
  const { error: workoutsError } = await programming.from("spc_workouts").insert(workoutRows);
  if (workoutsError) throw workoutsError;

  return block;
}

// Same .order(...).limit(1).maybeSingle() guard as memberPlan.js's
// getCurrentBlock — staggered per-client blocks make the "two blocks both
// match today" scenario just as reachable here as it was for group blocks.
export async function getCurrentSpcBlock(spcClientId, today = todayInBoise()) {
  const { data, error } = await programming
    .from("spc_blocks")
    .select("*")
    .eq("spc_client_id", spcClientId)
    .lte("block_start_date", today)
    .gte("block_end_date", today)
    .order("block_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLatestSpcBlock(spcClientId) {
  const { data, error } = await programming
    .from("spc_blocks")
    .select("*")
    .eq("spc_client_id", spcClientId)
    .order("block_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listSpcWorkoutsForBlock(blockId) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*")
    .eq("spc_block_id", blockId)
    .order("session_number");
  if (error) throw error;
  return data;
}

// RLS's member-read policy already requires status = 'published', so a
// draft session simply won't come back — no separate filter needed, same
// pattern as memberPlan.js's getWorkout for group sessions.
export async function listPublishedSpcWorkoutsForBlock(blockId) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*")
    .eq("spc_block_id", blockId)
    .order("session_number");
  if (error) throw error;
  return data;
}
