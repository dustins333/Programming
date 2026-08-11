import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { formatDateMDY } from "../formatDate";
import { rangesOverlap } from "../dateRange";
import { copySpcWorkoutContent } from "./spcWorkouts";

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

// Creates the block plus the full empty week x session grid of
// spc_workouts rows (all drafts) — same idea as blocks.js's createBlock,
// now that SPC has one row per (week, session) instead of one recurring
// row per session with weeks living as columns.
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

  // Queueing a block behind a rolling one ends the rolling. The two would
  // collide, and the extension's own overlap guard would otherwise just
  // refuse to grow it — silently, inside the nightly scan, where nobody
  // would ever see the refusal. Ending it here makes the outcome match the
  // intent of creating the block, and it stays visible afterwards in the
  // block list's own Rolling switch rather than being a hidden state.
  const { error: rollingError } = await programming
    .from("spc_blocks")
    .update({ auto_extend: false })
    .eq("spc_client_id", spcClientId)
    .eq("auto_extend", true)
    .lt("block_end_date", startDate);
  if (rollingError) throw rollingError;

  const workoutRows = [];
  for (let week = 1; week <= lengthWeeks; week += 1) {
    for (let session = 1; session <= sessionsPerWeek; session += 1) {
      workoutRows.push({ spc_block_id: block.id, session_number: session, week_number: week });
    }
  }
  const { error: workoutsError } = await programming.from("spc_workouts").insert(workoutRows);
  if (workoutsError) throw workoutsError;

  return block;
}

// Admin-only at the RLS layer (migration 0016) — the UI should only ever
// show this for blocks that haven't started yet, so a coach can undo an
// accidental "+ New block" click before it's actually in use.
export async function deleteSpcBlock(blockId) {
  const { error } = await programming.from("spc_blocks").delete().eq("id", blockId);
  if (error) throw error;
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
    .order("week_number")
    .order("session_number");
  if (error) throw error;
  return data;
}

// Every spc_workouts row for one specific week of a block, across all
// session slots — mirrors memberPlan.js's listWorkoutsForWeek now that SPC
// has a real per-week row like group does. RLS's published-only member
// policy already filters this for member callers.
export async function listSpcWorkoutsForWeek(blockId, weekNumber) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*")
    .eq("spc_block_id", blockId)
    .eq("week_number", weekNumber)
    .order("session_number");
  if (error) throw error;
  return data;
}

// Look-ahead: every published workout in the block, grouped by week — same
// "whole block, all weeks" shape as memberPlan.js's listPublishedWorkoutsForBlock.
export async function listPublishedSpcWorkoutsForBlock(blockId) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*")
    .eq("spc_block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;
  return data;
}

// --- Extending a live block --------------------------------------------

// SPC counterpart of blocks.js's extendGroupBlock — appends whole weeks to
// a block already in progress instead of forcing a duplicate-the-whole-
// block cycle for a client who's repeating the same work indefinitely.
// copyLastWeek carries the final week's sessions forward into each new one.
export async function extendSpcBlock(blockId, { weeks = 1, copyLastWeek = true } = {}) {
  const added = Math.floor(Number(weeks));
  if (!Number.isFinite(added) || added < 1) throw new Error("Extend by at least one week.");

  const { data: block, error: blockError } = await programming
    .from("spc_blocks")
    .select("*")
    .eq("id", blockId)
    .single();
  if (blockError) throw blockError;

  const currentLength = block.block_length_weeks;
  const newLength = currentLength + added;
  const newEndDate = addDays(block.block_start_date, newLength * 7 - 1);

  const existingBlocks = await listBlocksForSpcClient(block.spc_client_id);
  const clash = existingBlocks
    .filter((b) => b.id !== blockId)
    .find((b) => rangesOverlap(block.block_start_date, newEndDate, b.block_start_date, b.block_end_date));
  if (clash) {
    const label = labelBlocks(existingBlocks).find((b) => b.id === clash.id)?.label ?? "another block";
    throw new Error(
      `Extending this far would run into ${label} (${formatDateMDY(clash.block_start_date)} – ${formatDateMDY(clash.block_end_date)}). Extend by fewer weeks, or move that block.`
    );
  }

  // Session count comes from the block's own final week rather than the
  // client's current sessions_per_week — if that setting changed midway,
  // the extension should match the block it's growing, not silently start
  // adding a session slot the rest of the block doesn't have.
  const { data: lastWeek, error: lastWeekError } = await programming
    .from("spc_workouts")
    .select("id, session_number, status")
    .eq("spc_block_id", blockId)
    .eq("week_number", currentLength)
    .order("session_number");
  if (lastWeekError) throw lastWeekError;
  const sessionNumbers = lastWeek.length > 0 ? lastWeek.map((w) => w.session_number) : [1];

  const newRows = [];
  for (let week = currentLength + 1; week <= newLength; week += 1) {
    for (const session of sessionNumbers) {
      newRows.push({ spc_block_id: blockId, session_number: session, week_number: week });
    }
  }
  const { data: inserted, error: insertError } = await programming.from("spc_workouts").insert(newRows).select();
  if (insertError) throw insertError;

  // Rows first, dates second — see the group version for why.
  const { error: updateError } = await programming
    .from("spc_blocks")
    .update({ block_length_weeks: newLength, block_end_date: newEndDate })
    .eq("id", blockId);
  if (updateError) throw updateError;

  if (copyLastWeek && lastWeek.length > 0) {
    const sourceBySession = Object.fromEntries(lastWeek.map((w) => [w.session_number, w]));
    for (const row of inserted) {
      const source = sourceBySession[row.session_number];
      if (!source) continue;
      await copySpcWorkoutContent(source.id, row.id);
      // Published state travels with the content — see the group version
      // for why a repeated week can't be left as an invisible draft.
      if (source.status === "published") {
        const { error: statusError } = await programming
          .from("spc_workouts")
          .update({ status: "published" })
          .eq("id", row.id);
        if (statusError) throw statusError;
      }
    }
  }

  return { blockId, newLength, newEndDate, weeksAdded: added };
}

// Rolling SPC block — the daily scan (supabase/functions/scan-spc-alerts)
// grows it a week at a time as it nears its end, and deliberately skips
// auto-drafting a following block while this is on, so a rolling block
// never ends up with a duplicate queued behind it.
export async function setSpcBlockAutoExtend(blockId, autoExtend) {
  const { error } = await programming.from("spc_blocks").update({ auto_extend: autoExtend }).eq("id", blockId);
  if (error) throw error;
}
