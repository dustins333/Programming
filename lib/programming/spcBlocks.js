import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { formatDateMDY } from "../formatDate";
import { rangesOverlap } from "../dateRange";

export function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Blocks have no stored name — the paper template never had one, and
// adding a real column would mean another migration for something fully
// derivable. Instead each client's blocks are labeled by chronological
// position ("Block 1", "Block 2"...) computed from block_start_date order,
// which never drifts out of sync with the actual sequence. Needs the
// client's FULL block list (not a filtered subset) to number correctly —
// callers that only want, say, past blocks should label first, then filter.
export function labelBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => (a.block_start_date < b.block_start_date ? -1 : 1));
  const labelById = new Map(sorted.map((b, i) => [b.id, `Block ${i + 1}`]));
  return blocks.map((b) => ({ ...b, label: labelById.get(b.id) }));
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
//
// Real fix for a bug found during the member-fitness rework: two overlapping
// spc_blocks rows for the same client (one with real published content, a
// newer empty one on top of it) hid the client's actual sessions from their
// own Today/My Fitness view (getCurrentSpcBlock had to be patched with a
// tiebreak to cope). That patch only treats the symptom — this stops the
// overlap from being created in the first place, regardless of whether the
// caller is the calendar grid's gap-aware "Start new block" or the plain
// manual-date modal.
export async function createSpcBlock({ spcClientId, coachId, startDate, lengthWeeks, sessionsPerWeek }) {
  const endDate = addDays(startDate, lengthWeeks * 7 - 1);

  const existingBlocks = await listBlocksForSpcClient(spcClientId);
  const overlap = existingBlocks.find((b) => rangesOverlap(startDate, endDate, b.block_start_date, b.block_end_date));
  if (overlap) {
    const label = labelBlocks(existingBlocks).find((b) => b.id === overlap.id)?.label ?? "an existing block";
    throw new Error(
      `That date range overlaps ${label} (${formatDateMDY(overlap.block_start_date)} – ${formatDateMDY(overlap.block_end_date)}). Adjust the start date or length.`
    );
  }

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

// Same "prefer whichever candidate actually has published content" tiebreak
// as memberPlan.js's getCurrentBlock — staggered per-client blocks make the
// "two blocks both match today" scenario just as reachable here as it was
// for group blocks, and a blind newest-started tiebreak would otherwise hide
// an older-but-still-active block's real published sessions behind a new,
// still-empty one.
export async function getCurrentSpcBlock(spcClientId, today = todayInBoise()) {
  const { data: candidates, error } = await programming
    .from("spc_blocks")
    .select("*")
    .eq("spc_client_id", spcClientId)
    .lte("block_start_date", today)
    .gte("block_end_date", today)
    .order("block_start_date", { ascending: false });
  if (error) throw error;
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const { data: publishedRows, error: pubError } = await programming
    .from("spc_workouts")
    .select("spc_block_id")
    .in("spc_block_id", candidates.map((b) => b.id))
    .eq("status", "published");
  if (pubError) throw pubError;
  const publishedBlockIds = new Set((publishedRows ?? []).map((r) => r.spc_block_id));
  return candidates.find((b) => publishedBlockIds.has(b.id)) ?? candidates[0];
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
