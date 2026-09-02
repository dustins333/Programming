import { supabase, programming } from "../supabase/client";
import { todayInBoise, addDays } from "../boiseDate";
import { computeWeekWindows } from "./weekCycle";
import { getCurrentTarget } from "./targets";
import { isPhotoRequirementWeek, hasAllAngles, photosForRequirementWeek } from "./photos";

export async function listTemplateQuestions() {
  const { data, error } = await supabase.from("checkin_template_questions").select("*").order("position");
  if (error) throw error;
  return data;
}

export async function addTemplateQuestion(questionText, position) {
  const { error } = await supabase
    .from("checkin_template_questions")
    .insert({ question_text: questionText, position });
  if (error) throw error;
}

// Backs both rename (fields = {question_text}) and reorder (fields =
// {position}) — a reorder swaps two rows' positions via two calls to this.
export async function updateTemplateQuestion(id, fields) {
  const { error } = await supabase.from("checkin_template_questions").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteTemplateQuestion(id) {
  const { error } = await supabase.from("checkin_template_questions").delete().eq("id", id);
  if (error) throw error;
}

export async function getClientQuestions(userId) {
  const { data, error } = await supabase
    .from("client_checkin_questions")
    .select("*")
    .eq("client_id", userId)
    .order("position");
  if (error) throw error;
  return data;
}

// Per-client editing, direct — used by the Client Settings modal so a coach
// can adjust one client's weekly check-in questions without touching the
// shared template.
export async function addClientQuestion(userId, questionText, position) {
  const { error } = await supabase
    .from("client_checkin_questions")
    .insert({ client_id: userId, question_text: questionText, position });
  if (error) throw error;
}

export async function updateClientQuestion(id, fields) {
  const { error } = await supabase.from("client_checkin_questions").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteClientQuestion(id) {
  const { error } = await supabase.from("client_checkin_questions").delete().eq("id", id);
  if (error) throw error;
}

// Physical copy, not a live join — a client's question set stays stable and
// independently editable after this, unaffected by later template edits.
// Replaces whatever the client currently has.
export async function copyTemplateToClient(userId) {
  const template = await listTemplateQuestions();
  const { error: deleteError } = await supabase.from("client_checkin_questions").delete().eq("client_id", userId);
  if (deleteError) throw deleteError;
  if (template.length === 0) return;

  const { error } = await supabase.from("client_checkin_questions").insert(
    template.map((q) => ({
      client_id: userId,
      position: q.position,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options,
      booking_option: q.booking_option,
    }))
  );
  if (error) throw error;
}

// week_start defaults to the live currentWeek, computed here server-side
// from today's date, never client-supplied — so a stale client-held week
// boundary can't misfile the submission under the wrong week. Passing
// `weekStart` explicitly is the one sanctioned exception: filing a
// coach-reopened missed week late (see reopenCheckin below) genuinely
// needs to target a specific past week, not whatever's currently live.
// focus/game-plan/target snapshots capture what was true at submission
// time, matching the standalone app's actual submitCheckin behavior
// (app/home/actions.js). Also blocks submission until that week's required
// progress photos are uploaded, if that week requires them
// (isPhotoRequirementWeek/hasAllAngles, lib/nutrition/photos.js) — same
// gate the standalone app enforces — unless the caller passes
// photosSkipReason (member explained why they can't this week).
// Deliberately not a new column on the shared checkin_responses table
// (public.*, also used by the standalone Nutrition Tracker app) — the skip
// reason is just appended as one more {question, answer} pair into the
// existing `answers` jsonb array, so this stays fully additive/harmless to
// that app's own rows and rendering.
export async function submitCheckin(userId, answers, { photosSkipReason, weekStart } = {}) {
  const today = todayInBoise();
  const { currentWeek } = computeWeekWindows(today);
  const targetWeekStart = weekStart ?? currentWeek.start;

  const [{ data: focusItems }, { data: clientRow }, target] = await Promise.all([
    supabase.from("focus_items").select("text, done").eq("client_id", userId).order("position"),
    supabase
      .from("clients")
      .select("game_plan, photo_frequency, photo_frequency_started_at, photo_requirement_next_checkin")
      .eq("id", userId)
      .maybeSingle(),
    getCurrentTarget(userId, today),
  ]);

  let finalAnswers = answers;
  if (clientRow && isPhotoRequirementWeek(clientRow, targetWeekStart)) {
    // For a coach-reopened past week (weekStart override), photos count from
    // that week's own start with no upper bound — a today-relative recency
    // window can never be satisfied for a weeks-old week, which used to make
    // the UI's ✓ (which correctly counted from week_start) submit into an
    // unrecoverable error. The normal path runs through the shared
    // photosForRequirementWeek window so this server-side gate can't disagree
    // with what the member's UI and the coach's timeline both count.
    const { data: candidatePhotos } = await supabase
      .from("photos")
      .select("angle, date")
      .eq("client_id", userId)
      .gte("date", targetWeekStart);
    const relevantPhotos = weekStart ? candidatePhotos ?? [] : photosForRequirementWeek(candidatePhotos ?? [], currentWeek);
    if (!hasAllAngles(relevantPhotos)) {
      if (!photosSkipReason) {
        throw new Error("Upload this week's progress photos (front, side, and back) before submitting your check-in, or explain why you can't.");
      }
      finalAnswers = [...answers, { question: "Progress photos this week", answer: `Not provided — ${photosSkipReason}` }];
    }
  }

  const { data, error } = await supabase
    .from("checkin_responses")
    .insert({
      client_id: userId,
      week_start: targetWeekStart,
      answers: finalAnswers,
      focus_snapshot: focusItems ?? [],
      game_plan_snapshot: clientRow?.game_plan ?? null,
      targets_snapshot: target,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Batch fetch for the check-in status timeline — avoids one round-trip per
// displayed week.
export async function listCheckinsSince(userId, sinceDate) {
  const { data, error } = await supabase
    .from("checkin_responses")
    .select("*")
    .eq("client_id", userId)
    .gte("week_start", sinceDate)
    .order("week_start");
  if (error) throw error;
  return data;
}

export async function getCheckinForWeek(userId, weekStart) {
  const { data, error } = await supabase
    .from("checkin_responses")
    .select("*")
    .eq("client_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Coach-only stamp — RLS only grants staff an update policy on
// checkin_responses, members are insert-only, so this can never be called
// successfully as a member regardless of what the UI shows.
//
// Finalizing also RE-CAPTURES the focus items and game plan as they stand
// right now. submitCheckin snapshots them at submission, but the coach edits
// both while reading the check-in — that editing IS the review — so the
// version worth keeping against the week is the one she finished with, not
// the one the client happened to submit against. Until it's finalized the
// Check-In tab shows those two live and editable; afterwards it shows what
// this wrote.
//
// targets_snapshot is deliberately NOT re-captured: a target change made
// during review takes effect going forward (createTarget writes a new row
// with its own effective_date), so overwriting the week's snapshot with it
// would retroactively claim she was working to numbers that didn't exist yet.
export async function finalizeCheckin(userId, weekStart) {
  const [{ data: focusItems }, { data: clientRow }] = await Promise.all([
    supabase.from("focus_items").select("text, done").eq("client_id", userId).order("position"),
    supabase.from("clients").select("game_plan").eq("id", userId).maybeSingle(),
  ]);

  const { error } = await supabase
    .from("checkin_responses")
    .update({
      finalized_at: new Date().toISOString(),
      focus_snapshot: focusItems ?? [],
      game_plan_snapshot: clientRow?.game_plan ?? null,
    })
    .eq("client_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

// Undoes a finalize. Finalizing is a single click with no confirmation, so
// a misclick used to be permanent from inside the app — the only way back
// was a raw database write.
//
// Deliberately leaves focus_snapshot/game_plan_snapshot alone rather than
// nulling them: re-finalizing overwrites both anyway, and neither is
// rendered anywhere now, so clearing them would be churn with a real
// downside (a failure between the two writes would leave a finalized row
// with its snapshots wiped).
export async function unfinalizeCheckin(userId, weekStart) {
  const { error } = await supabase
    .from("checkin_responses")
    .update({ finalized_at: null })
    .eq("client_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

// Grants a client a late-filing window for one specific missed week (see
// migration 0028). `expiresAt` is pinned to the deadline that already
// governs the *current* filing cycle (the same Sunday computeWeekWindows
// would otherwise just let quietly pass) — so a reopened week can never
// bleed into the next cycle, matching "reopen it, but it recloses before
// the new one comes available" exactly, with no cron job needed to enforce
// it: once today passes expiresAt, getActiveCheckinReopen below just stops
// returning it.
export async function reopenCheckin(userId, weekStart, openedBy, today = todayInBoise()) {
  const { currentWeek } = computeWeekWindows(today);
  const expiresAt = addDays(currentWeek.end, 7);
  const { error } = await programming
    .from("nutrition_checkin_reopens")
    .insert({ user_id: userId, week_start: weekStart, opened_by: openedBy, expires_at: expiresAt });
  if (error) throw error;
}

// Batch fetch for the check-in status timeline, same shape as
// listCheckinsSince — lets the coach see which past weeks are currently
// reopened without a round-trip per row.
export async function listCheckinReopensSince(userId, sinceDate) {
  const { data, error } = await programming
    .from("nutrition_checkin_reopens")
    .select("*")
    .eq("user_id", userId)
    .gte("week_start", sinceDate)
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return data;
}

// The member-facing check: is there a missed week this client can still
// file late? Excludes anything already submitted (no point re-offering a
// week that already has a response) and anything past its own deadline —
// so this naturally returns null again once either the client catches up
// or the safeguard window lapses.
export async function getActiveCheckinReopen(userId, today = todayInBoise()) {
  const { data, error } = await programming
    .from("nutrition_checkin_reopens")
    .select("*")
    .eq("user_id", userId)
    .gte("expires_at", today)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const existingResponse = await getCheckinForWeek(userId, data.week_start);
  return existingResponse ? null : data;
}

// --- Close-outs (migration 0111) --------------------------------------
//
// A week the coach has resolved without a submission. Answers the real
// problem that a client who simply doesn't check in sat on the roster as
// "Awaiting client check-in" — urgent, red — with no way out but waiting
// for the cycle to roll over.
//
// Deliberately does NOT block the member: a closed-out week stays
// submittable, and a real response supersedes the close-out wherever it's
// read (see deriveCheckinStatus). So the worst case of closing one out
// early is that it un-closes itself when she files.

export async function listCheckinCloseoutsSince(userId, sinceDate) {
  const { data, error } = await programming
    .from("nutrition_checkin_closeouts")
    .select("*")
    .eq("user_id", userId)
    .gte("week_start", sinceDate)
    .order("week_start", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Batch counterpart for the roster, which asks the same question about one
// specific week for every client at once. Returns a Set of user ids.
export async function listClosedOutUserIdsForWeek(userIds, weekStart) {
  if (userIds.length === 0) return new Set();
  const { data, error } = await programming
    .from("nutrition_checkin_closeouts")
    .select("user_id")
    .in("user_id", userIds)
    .eq("week_start", weekStart);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.user_id));
}

// Upsert rather than insert: the table is unique on (user_id, week_start),
// so a double-tap is a no-op instead of a constraint error the coach has to
// read and dismiss.
export async function closeOutCheckin(userId, weekStart, closedBy) {
  const { error } = await programming
    .from("nutrition_checkin_closeouts")
    .upsert({ user_id: userId, week_start: weekStart, closed_by: closedBy }, { onConflict: "user_id,week_start" });
  if (error) throw error;
}

export async function undoCheckinCloseout(userId, weekStart) {
  const { error } = await programming
    .from("nutrition_checkin_closeouts")
    .delete()
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
}
