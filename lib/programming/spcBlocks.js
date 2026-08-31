import { programming } from "../supabase/client";
import { addDays, todayInBoise, mondayOnOrBefore } from "../boiseDate";
import { formatDateMDY } from "../formatDate";
import { rangesOverlap } from "../dateRange";
import { copySpcWorkoutContent } from "./spcWorkouts";
import { currentWeekNumber } from "./schedule";

// Re-exported from lib/boiseDate.js rather than reimplemented — three
// separate copies of this existed and all three carried the same
// local-parse/UTC-format off-by-one for positive UTC offsets.
export { addDays } from "../boiseDate";

// Blocks have no stored name — the paper template never had one, and
// adding a real column would mean another migration for something fully
// derivable. Instead each client's blocks are labeled by chronological
// position ("Block 1", "Block 2"...) computed from block_start_date order,
// which never drifts out of sync with the actual sequence. Needs the
// client's FULL block list (not a filtered subset) to number correctly —
// callers that only want, say, past blocks should label first, then filter.
export function labelBlocks(blocks) {
  // A draft has no dates yet (0089), so it has no position in the sequence
  // either — numbering it now would renumber it under the coach the moment
  // another block was sent ahead of it. It's "Draft" until it's scheduled.
  const dated = blocks.filter((b) => b.block_start_date);
  const drafts = blocks.filter((b) => !b.block_start_date);
  const sorted = [...dated].sort((a, b) => (a.block_start_date < b.block_start_date ? -1 : 1));
  const labelById = new Map(sorted.map((b, i) => [b.id, `Block ${i + 1}`]));
  [...drafts]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .forEach((b, i) => labelById.set(b.id, drafts.length > 1 ? `Draft ${i + 1}` : "Draft"));
  return blocks.map((b) => ({ ...b, label: labelById.get(b.id) }));
}

// Whether a block has been sent to the client. Reads off the status column
// rather than the dates so the intent is stated, but the two always agree —
// spc_blocks_active_has_dates (0089) makes an undated active block
// impossible.
export function isDraftBlock(block) {
  return block?.status === "draft";
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
    // nullsFirst false or every draft would sort ahead of the real blocks on
    // a descending order — Postgres puts NULLs first for DESC by default.
    .order("block_start_date", { ascending: false, nullsFirst: false });
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
export async function createSpcBlock({
  spcClientId,
  coachId,
  startDate: requestedStart,
  lengthWeeks,
  sessionsPerWeek,
  // 'draft' creates the block with NO dates — nothing is scheduled, nothing
  // is visible to the client, and nothing else has to plan around it until
  // publishSpcBlock() below gives it a start date. See 0089's header for why
  // a coach clicking "Build next block" now gets this instead of a live block
  // whose week 1 quietly runs out while she's still writing it.
  status = "active",
  // 'sessions' is the simplified model (0102): one workout row per session,
  // no week grid — the run's calendar is arithmetic off block_start_date and
  // lengthWeeks is just its duration. The default stays 'weekly' so every
  // legacy caller keeps its exact behavior; new-model callers opt in.
  format = "weekly",
}) {
  const draft = status === "draft";

  // Every block runs Monday–Sunday, so a block week and a calendar week are
  // the same seven days (see mondayOnOrBefore's note, and the CHECK
  // constraint in migration 0063 that makes this impossible to bypass).
  // Snapping BACK rather than forward keeps the block covering the date the
  // coach asked for instead of leaving her client with nothing until Monday.
  // In practice this is a no-op for every gap-aware caller: blocks are whole
  // weeks ending Sunday, so "day after the last block" is already a Monday.
  const startDate = draft ? null : mondayOnOrBefore(requestedStart);
  const endDate = draft ? null : addDays(startDate, lengthWeeks * 7 - 1);

  if (!draft) {
    await assertNoOverlap(spcClientId, startDate, endDate);
  }

  const { data: block, error: blockError } = await programming
    .from("spc_blocks")
    .insert({
      spc_client_id: spcClientId,
      coach_id: coachId,
      block_start_date: startDate,
      block_length_weeks: lengthWeeks,
      block_end_date: endDate,
      status,
      format,
    })
    .select()
    .single();
  if (blockError) throw blockError;

  if (!draft) await endRollingBlocksBefore(spcClientId, startDate);

  // A sessions-format run has one row per session, not a week grid — every
  // row is authored week 1 and the calendar weeks are derived.
  await insertWorkoutGrid(block.id, format === "sessions" ? 1 : lengthWeeks, sessionsPerWeek);

  return block;
}

// The week x session skeleton every SPC block is born with — a draft gets the
// same grid as a live block, which is what makes it something a coach can
// actually write into before it has a date.
async function insertWorkoutGrid(blockId, lengthWeeks, sessionsPerWeek) {
  const workoutRows = [];
  for (let week = 1; week <= lengthWeeks; week += 1) {
    for (let session = 1; session <= sessionsPerWeek; session += 1) {
      workoutRows.push({ spc_block_id: blockId, session_number: session, week_number: week });
    }
  }
  const { error } = await programming.from("spc_workouts").insert(workoutRows);
  if (error) throw error;
}

// Real fix for a bug found during the member-fitness rework: two overlapping
// spc_blocks rows for the same client (one with real published content, a
// newer empty one on top of it) hid the client's actual sessions from their
// own Today/My Fitness view (getCurrentSpcBlock had to be patched with a
// tiebreak to cope). That patch only treats the symptom — this stops the
// overlap from being created in the first place.
//
// Drafts are excluded on both sides: they hold no dates, so they can't
// overlap anything and nothing has to schedule around them.
// FOREVER stands in for a NULL end date (an ongoing program, 0103) so the
// interval test's plain string comparison keeps working: an ongoing program
// overlaps everything that starts after it does.
const FOREVER = "9999-12-31";

async function assertNoOverlap(spcClientId, startDate, endDate, exceptBlockId = null) {
  const existingBlocks = await listBlocksForSpcClient(spcClientId);
  const scheduled = existingBlocks.filter((b) => b.block_start_date && b.id !== exceptBlockId);
  const overlap = scheduled.find((b) =>
    rangesOverlap(startDate, endDate ?? FOREVER, b.block_start_date, b.block_end_date ?? FOREVER)
  );
  if (!overlap) return;
  const label = labelBlocks(existingBlocks).find((b) => b.id === overlap.id)?.label ?? "an existing block";
  const overlapEnd = overlap.block_end_date ? formatDateMDY(overlap.block_end_date) : "ongoing";
  throw new Error(
    `That date range overlaps ${label} (${formatDateMDY(overlap.block_start_date)} – ${overlapEnd}). Pick a later Monday.`
  );
}

// Publishing a new program over an existing one, two cases (design handoff +
// Terra's "publish now" follow-up, 2026-08-30):
//  - It started BEFORE the new start: shortened to end the day before (a
//    Sunday, since starts are Mondays). Nothing is deleted; completions and
//    logs stay exactly where they are, so her lift history is untouched.
//  - It starts ON or AFTER the new start (publishing "now" over a program
//    that began this same Monday, or over a queued one): it's being REPLACED.
//    If she has already logged in it, refuse with a sentence — silently
//    destroying finished sessions is never on the table. Otherwise it's
//    demoted back to an undated draft (status flip, content intact), so the
//    work returns to the build space instead of being lost.
async function endProgramsBefore(spcClientId, startDate, endDate, exceptBlockId) {
  const existingBlocks = await listBlocksForSpcClient(spcClientId);
  const newEnd = addDays(startDate, -1);
  const overlapping = existingBlocks.filter(
    (b) =>
      b.id !== exceptBlockId &&
      b.status === "active" &&
      b.block_start_date &&
      rangesOverlap(startDate, endDate ?? FOREVER, b.block_start_date, b.block_end_date ?? FOREVER)
  );
  for (const b of overlapping) {
    if (b.block_start_date < startDate) {
      const { error } = await programming.from("spc_blocks").update({ block_end_date: newEnd }).eq("id", b.id);
      if (error) throw error;
      continue;
    }
    const { data: workouts, error: wErr } = await programming
      .from("spc_workouts")
      .select("id")
      .eq("spc_block_id", b.id);
    if (wErr) throw wErr;
    if (workouts.length) {
      const { count, error: cErr } = await programming
        .from("session_completions")
        .select("id", { count: "exact", head: true })
        .in("spc_workout_id", workouts.map((w) => w.id));
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        throw new Error(
          `She's already logged sessions in the program that started ${formatDateMDY(b.block_start_date)}. Pick a later Monday instead of replacing it.`
        );
      }
    }
    const { error } = await programming
      .from("spc_blocks")
      .update({ status: "draft", block_start_date: null, block_end_date: null })
      .eq("id", b.id);
    if (error) throw error;
  }
}

// The Sessions tab's editable end date, "+ Add a week", and the Ongoing
// toggle all write through here. endDate null = ongoing (sessions format
// only, 0103). Setting a real end also recomputes the stored length so the
// two can't disagree; the length is unread while the end is null.
export async function setSpcProgramEnd(blockId, endDate) {
  const block = await getSpcBlock(blockId);
  if (block.format !== "sessions") throw new Error("Only a sessions-format program's end date can be edited here.");
  if (block.status === "draft") throw new Error("A draft has no dates — they're picked when you publish it.");
  if (endDate == null) {
    const { error } = await programming.from("spc_blocks").update({ block_end_date: null }).eq("id", blockId);
    if (error) throw error;
    return { endDate: null, ongoing: true };
  }
  if (endDate < block.block_start_date) throw new Error("A program can't end before it starts.");
  await assertNoOverlap(block.spc_client_id, block.block_start_date, endDate, blockId);
  const days = Math.round((new Date(`${endDate}T12:00:00`) - new Date(`${block.block_start_date}T12:00:00`)) / 86400000) + 1;
  const lengthWeeks = Math.max(1, Math.ceil(days / 7));
  const { error } = await programming
    .from("spc_blocks")
    .update({ block_end_date: endDate, block_length_weeks: lengthWeeks })
    .eq("id", blockId);
  if (error) throw error;
  return { endDate, ongoing: false, lengthWeeks };
}

// Queueing a block behind a rolling one ends the rolling. The two would
// collide, and the extension's own overlap guard would otherwise just
// refuse to grow it — silently, inside the nightly scan, where nobody
// would ever see the refusal. Ending it here makes the outcome match the
// intent of scheduling the block, and it stays visible afterwards in the
// block list's own Rolling switch rather than being a hidden state.
async function endRollingBlocksBefore(spcClientId, startDate) {
  const { error } = await programming
    .from("spc_blocks")
    .update({ auto_extend: false })
    .eq("spc_client_id", spcClientId)
    .eq("auto_extend", true)
    .lt("block_end_date", startDate);
  if (error) throw error;
}

// Send a draft block to the client: give it the Monday it starts on, publish
// everything in it that has any lifts, and flip it active.
//
// ORDER MATTERS. Sessions are published first and the block is activated
// last, because the block's own status is the visibility gate — so the member
// goes from seeing nothing to seeing the whole block in one step, never a
// half-published one.
//
// A session with no lifts stays a draft: there is nothing to show, and
// publishing an empty session would put a blank card on her My Week.
//
// This is also the sessions-format "Push" (0102), unchanged: give the run its
// start Monday, publish every session that has lifts, keep empty ones hidden.
// The member sees nothing until the start date regardless — RLS gates her
// reads on block_start_date <= today — so publishing early can't leak.
export async function publishSpcBlock(blockId, { startDate: requestedStart, lengthWeeks = null, ongoing = false }) {
  const block = await getSpcBlock(blockId);
  if (block.status !== "draft") throw new Error("This block has already been sent to the client.");
  if (!requestedStart) throw new Error("Pick the Monday this block starts on.");

  const startDate = mondayOnOrBefore(requestedStart);
  const weeks = lengthWeeks ?? block.block_length_weeks;
  // Ongoing (0103, sessions format only): no end date, runs until the coach
  // sets one. The stored length is unread while the end is null.
  const endDate = ongoing && block.format === "sessions" ? null : addDays(startDate, weeks * 7 - 1);

  // Publishing a sessions-format program that starts before the current one
  // ends SHORTENS the current one to end the day before — the modal says so
  // in words and that sentence is the confirmation (design handoff v1, open
  // question 2). Weekly blocks keep the old refuse-on-overlap behavior so the
  // legacy modal's guarantees don't silently change under it.
  if (block.format === "sessions") {
    await endProgramsBefore(block.spc_client_id, startDate, endDate, blockId);
  }
  // Still asserted after the shortening: a QUEUED program starting later can
  // legitimately collide and must refuse, not be silently eaten.
  await assertNoOverlap(block.spc_client_id, startDate, endDate, blockId);

  const workouts = await listSpcWorkoutsForBlock(blockId);
  const workoutIds = workouts.map((w) => w.id);
  const withLifts = new Set();
  if (workoutIds.length > 0) {
    const { data: lifts, error: liftsError } = await programming
      .from("spc_workout_exercises")
      .select("spc_workout_id")
      .in("spc_workout_id", workoutIds);
    if (liftsError) throw liftsError;
    for (const row of lifts) withLifts.add(row.spc_workout_id);
  }

  const toPublish = workouts.filter((w) => withLifts.has(w.id) && w.status !== "published").map((w) => w.id);
  if (toPublish.length > 0) {
    const { error: publishError } = await programming
      .from("spc_workouts")
      .update({ status: "published" })
      .in("id", toPublish);
    if (publishError) throw publishError;
  }

  await endRollingBlocksBefore(block.spc_client_id, startDate);

  const { error: activateError } = await programming
    .from("spc_blocks")
    .update({ status: "active", block_start_date: startDate, block_end_date: endDate, block_length_weeks: weeks })
    .eq("id", blockId);
  if (activateError) throw activateError;

  return {
    startDate,
    endDate,
    ongoing: endDate == null,
    sessionsSent: withLifts.size,
    sessionsEmpty: workouts.length - withLifts.size,
  };
}

// How many sets she has actually logged inside this block. Cheap: one indexed
// count over programming.logs.spc_workout_id (0063), not a scan.
export async function countLoggedSetsForBlock(blockId) {
  const workouts = await listSpcWorkoutsForBlock(blockId);
  const ids = workouts.map((w) => w.id);
  if (ids.length === 0) return 0;
  const { count, error } = await programming
    .from("logs")
    .select("id", { count: "exact", head: true })
    .in("spc_workout_id", ids);
  if (error) throw error;
  return count ?? 0;
}

// Slide a LIVE block to a different Monday.
//
// Until this existed there was no way to change a block's dates once it had
// been sent — publishSpcBlock() wrote them on the draft→active transition and
// nothing touched them again, so a coach who set one up wrong had to ask an
// admin. The dates are pure arithmetic off block_start_date (the calendar is
// derived, not stored per week), so moving one is a single update and every
// week, session and grid row follows.
//
// LOCKED ONCE SHE HAS TRAINED IN IT. The check reads logged SETS rather than
// finished sessions on purpose: logging autosaves per set, so a session she is
// part-way through counts. Her calendar must not slide underneath her just
// because nobody pressed Finalize. A block nobody has touched is free to move.
export async function moveSpcBlock(blockId, requestedStart) {
  const block = await getSpcBlock(blockId);
  if (block.status === "draft") {
    throw new Error("This block hasn't been sent yet — its start date is picked when you send it.");
  }
  if (!requestedStart) throw new Error("Pick the Monday this block starts on.");

  const logged = await countLoggedSetsForBlock(blockId);
  if (logged > 0) {
    throw new Error(
      `She's already logged ${logged} set${logged === 1 ? "" : "s"} in this block, so its dates are fixed. Moving it now would slide finished sessions into different weeks.`
    );
  }

  const startDate = mondayOnOrBefore(requestedStart);
  const endDate = addDays(startDate, block.block_length_weeks * 7 - 1);
  if (startDate === block.block_start_date) return { startDate, endDate, moved: false };

  await assertNoOverlap(block.spc_client_id, startDate, endDate, blockId);

  const { error } = await programming
    .from("spc_blocks")
    .update({ block_start_date: startDate, block_end_date: endDate })
    .eq("id", blockId);
  if (error) throw error;

  return { startDate, endDate, moved: true };
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
    // A draft holds no dates, so the range filter below already excludes it —
    // this says so out loud rather than leaving it to a NULL comparison.
    .eq("status", "active")
    .eq("spc_client_id", spcClientId)
    .lte("block_start_date", today)
    // NULL end = an ongoing program (0103): it covers today by definition.
    .or(`block_end_date.gte.${today},block_end_date.is.null`)
    .order("block_start_date", { ascending: false });
  if (error) throw error;
  if (!candidates || candidates.length === 0) {
    // Lapsed fallback, sessions-format runs only (Terra, 2026-08-30): past
    // the end date with nothing queued, the member keeps seeing and logging
    // the current program — better than a blank screen. The roster status
    // burns red for the coach instead. Weekly blocks keep the old behavior
    // (they end when they end) so nothing changes for legacy clients until
    // the cutover; the start-date filter also keeps a queued future run from
    // being surfaced early.
    const { data: past, error: pastError } = await programming
      .from("spc_blocks")
      .select("*")
      .eq("status", "active")
      .eq("spc_client_id", spcClientId)
      .lte("block_start_date", today)
      .order("block_start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pastError) throw pastError;
    return past && past.format === "sessions" ? past : null;
  }
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

// The latest SCHEDULED block. A draft has no dates, so it is not a candidate
// for "what runs last" — every caller of this is working out where the next
// block would land on the calendar, and a draft isn't on it yet.
export async function getLatestSpcBlock(spcClientId) {
  const { data, error } = await programming
    .from("spc_blocks")
    .select("*")
    .eq("status", "active")
    .eq("spc_client_id", spcClientId)
    .order("block_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Batch variant for screens reading several blocks at once (the client
// page's History tab) — one query instead of one per block.
export async function listSpcWorkoutsForBlocks(blockIds) {
  if (!blockIds.length) return [];
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*")
    .in("spc_block_id", blockIds)
    .order("week_number")
    .order("session_number");
  if (error) throw error;
  return data;
}

// A new session slot on a sessions-format run — what appears when a client's
// frequency is bumped (2x → 3x) and the coach needs a blank Session 3 card.
// Born a draft: RLS keeps a lift-less session invisible to the member, and
// the Sessions tab's Update publishes it once it has content.
export async function addSpcSessionSlot(blockId, sessionNumber) {
  const { data, error } = await programming
    .from("spc_workouts")
    .insert({ spc_block_id: blockId, session_number: sessionNumber, week_number: 1, status: "draft" })
    .select()
    .single();
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
export async function listSpcWorkoutsForWeek(blockId, weekNumber, block = null) {
  // Sessions-format runs (0102) have no per-week rows at all — every session
  // applies to every week, so the week number doesn't filter anything.
  // Callers that already hold the block row pass it to skip the extra read.
  let blk = block;
  if (!blk || blk.id !== blockId || blk.format == null) {
    const { data: fetched, error: blkError } = await programming
      .from("spc_blocks")
      .select("id, format")
      .eq("id", blockId)
      .maybeSingle();
    if (blkError) throw blkError;
    blk = fetched;
  }
  if (blk?.format === "sessions") {
    const { data, error } = await programming
      .from("spc_workouts")
      .select("*")
      .eq("spc_block_id", blockId)
      .order("session_number");
    if (error) throw error;
    return data;
  }

  // Effective week, not authored week (0101): a session moved with
  // scheduled_week belongs to the week it was moved to, and the week it came
  // from shows nothing. This one function is the choke point for My Fitness,
  // My Week, weeklyProgress and the coach's recent-sessions read, so
  // coalescing here is what makes a move visible everywhere at once.
  const week = Number(weekNumber);
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*")
    .eq("spc_block_id", blockId)
    .or(`scheduled_week.eq.${week},and(scheduled_week.is.null,week_number.eq.${week})`)
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
  // A draft has no start date to measure from and nothing to collide with —
  // it just gets longer, and picks up its dates when it is sent.
  const draft = block.status === "draft";
  const newEndDate = draft ? null : addDays(block.block_start_date, newLength * 7 - 1);

  if (!draft) {
    const existingBlocks = await listBlocksForSpcClient(block.spc_client_id);
    const clash = existingBlocks
      .filter((b) => b.id !== blockId && b.block_start_date)
      .find((b) => rangesOverlap(block.block_start_date, newEndDate, b.block_start_date, b.block_end_date));
    if (clash) {
      const label = labelBlocks(existingBlocks).find((b) => b.id === clash.id)?.label ?? "another block";
      throw new Error(
        `Extending this far would run into ${label} (${formatDateMDY(clash.block_start_date)} – ${formatDateMDY(clash.block_end_date)}). Extend by fewer weeks, or move that block.`
      );
    }
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
// SPC counterpart of blocks.js's trimGroupBlockTo — see that function for the
// full reasoning. Short version: tail-only (a block's calendar is arithmetic
// off block_start_date, so removing a middle week would renumber everything
// after it), and it refuses rather than cascades, because
// session_completions.spc_workout_id is ON DELETE CASCADE and would take her
// record of finishing the session with it.
export async function trimSpcBlockTo(blockId, lastWeek) {
  const keep = Math.floor(Number(lastWeek));
  if (!Number.isFinite(keep) || keep < 1) throw new Error("A block has to keep at least one week.");

  const { data: block, error: blockError } = await programming.from("spc_blocks").select("*").eq("id", blockId).single();
  if (blockError) throw blockError;
  if (keep >= block.block_length_weeks) return { removedWeeks: 0, wasRolling: false };

  // A draft isn't running, so there's no week in progress to protect and no
  // completion that could exist against it — it can be shortened freely.
  const draft = block.status === "draft";
  const current = draft ? 1 : currentWeekNumber(block.block_start_date, block.block_length_weeks);
  if (keep < current) {
    throw new Error(`This block is in week ${current}. It can end after week ${current} at the earliest, not partway through a week already in progress.`);
  }

  const { data: doomed, error: doomedError } = await programming
    .from("spc_workouts")
    .select("id, week_number")
    .eq("spc_block_id", blockId)
    .gt("week_number", keep);
  if (doomedError) throw doomedError;

  if (doomed.length) {
    const ids = doomed.map((w) => w.id);
    const { data: finished, error: finishedError } = await programming
      .from("session_completions")
      .select("spc_workout_id")
      .in("spc_workout_id", ids);
    if (finishedError) throw finishedError;
    if (finished.length) {
      const byId = new Map(doomed.map((w) => [w.id, w.week_number]));
      const weeks = [...new Set(finished.map((f) => byId.get(f.spc_workout_id)).filter(Boolean))].sort((a, b) => a - b);
      throw new Error(
        `Week ${weeks.join(", ")} already has a finished session. Ending the block there would erase that record — clear the lifts instead, or leave the week in place.`
      );
    }
    const { error: deleteError } = await programming.from("spc_workouts").delete().in("id", ids);
    if (deleteError) throw deleteError;
  }

  // A session authored inside the kept weeks but MOVED past the new end
  // (0101) would survive the delete above and then sit outside the block,
  // where nothing renders it and the trigger would reject its next write.
  // Clearing the move puts it back in its authored week, which is inside the
  // block by construction.
  const { error: strandedError } = await programming
    .from("spc_workouts")
    .update({ scheduled_week: null })
    .eq("spc_block_id", blockId)
    .gt("scheduled_week", keep);
  if (strandedError) throw strandedError;

  const { error: updateError } = await programming
    .from("spc_blocks")
    .update({
      block_length_weeks: keep,
      block_end_date: draft ? null : addDays(block.block_start_date, keep * 7 - 1),
      // Rolling would regrow exactly what was just removed on the next scan.
      auto_extend: false,
    })
    .eq("id", blockId);
  if (updateError) throw updateError;

  return { removedWeeks: block.block_length_weeks - keep, wasRolling: Boolean(block.auto_extend) };
}

export async function setSpcBlockAutoExtend(blockId, autoExtend) {
  const { error } = await programming.from("spc_blocks").update({ auto_extend: autoExtend }).eq("id", blockId);
  if (error) throw error;
}
