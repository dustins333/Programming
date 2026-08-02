import { supabase } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { computeWeekWindows } from "./weekCycle";
import { getCurrentTarget } from "./targets";
import { isPhotoRequirementWeek, hasAllAngles } from "./photos";

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

  const { error } = await supabase
    .from("client_checkin_questions")
    .insert(template.map((q) => ({ client_id: userId, position: q.position, question_text: q.question_text })));
  if (error) throw error;
}

// week_start is always computed here, server-side, from today's date —
// never accepted as a parameter — so a stale client-held week boundary
// can't misfile the submission under the wrong week. focus/game-plan/target
// snapshots capture what was true at submission time, matching the
// standalone app's actual submitCheckin behavior (app/home/actions.js).
// Also blocks submission until that week's required progress photos are
// uploaded, if that week requires them (isPhotoRequirementWeek/hasAllAngles,
// lib/nutrition/photos.js) — same gate the standalone app enforces.
export async function submitCheckin(userId, answers) {
  const today = todayInBoise();
  const { currentWeek } = computeWeekWindows(today);

  const [{ data: focusItems }, { data: clientRow }, target] = await Promise.all([
    supabase.from("focus_items").select("text, done").eq("client_id", userId).order("position"),
    supabase
      .from("clients")
      .select("game_plan, photo_frequency, photo_frequency_started_at, photo_requirement_next_checkin")
      .eq("id", userId)
      .maybeSingle(),
    getCurrentTarget(userId, today),
  ]);

  if (clientRow && isPhotoRequirementWeek(clientRow, currentWeek.start)) {
    const { data: weekPhotos } = await supabase.from("photos").select("angle").eq("client_id", userId).gte("date", currentWeek.start);
    if (!hasAllAngles(weekPhotos ?? [])) {
      throw new Error("Upload this week's progress photos (front, side, and back) before submitting your check-in");
    }
  }

  const { data, error } = await supabase
    .from("checkin_responses")
    .insert({
      client_id: userId,
      week_start: currentWeek.start,
      answers,
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
export async function finalizeCheckin(userId, weekStart) {
  const { error } = await supabase
    .from("checkin_responses")
    .update({ finalized_at: new Date().toISOString() })
    .eq("client_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
}
