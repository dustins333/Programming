import { nutrition } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { computeWeekWindows } from "./weekCycle";
import { getCurrentTarget } from "./targets";

export async function listTemplateQuestions() {
  const { data, error } = await nutrition.from("checkin_template_questions").select("*").order("position");
  if (error) throw error;
  return data;
}

export async function addTemplateQuestion(questionText, position) {
  const { error } = await nutrition
    .from("checkin_template_questions")
    .insert({ question_text: questionText, position });
  if (error) throw error;
}

export async function deleteTemplateQuestion(id) {
  const { error } = await nutrition.from("checkin_template_questions").delete().eq("id", id);
  if (error) throw error;
}

export async function getClientQuestions(userId) {
  const { data, error } = await nutrition
    .from("client_checkin_questions")
    .select("*")
    .eq("user_id", userId)
    .order("position");
  if (error) throw error;
  return data;
}

// Physical copy, not a live join — a client's question set stays stable and
// independently editable after this, unaffected by later template edits.
// Replaces whatever the client currently has.
export async function copyTemplateToClient(userId) {
  const template = await listTemplateQuestions();
  const { error: deleteError } = await nutrition.from("client_checkin_questions").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  if (template.length === 0) return;

  const { error } = await nutrition
    .from("client_checkin_questions")
    .insert(template.map((q) => ({ user_id: userId, position: q.position, question_text: q.question_text })));
  if (error) throw error;
}

// week_start is always computed here, server-side, from today's date —
// never accepted as a parameter — so a stale client-held week boundary
// (e.g. a session left open across the Sunday rollover) can't misfile the
// submission under the wrong week. targets_snapshot captures what target
// was in effect at submission time, so viewing an old week later shows what
// was true that week, not today's live target.
export async function submitCheckin(userId, answers) {
  const today = todayInBoise();
  const { currentWeek } = computeWeekWindows(today);
  const target = await getCurrentTarget(userId, today);

  const { data, error } = await nutrition
    .from("checkin_responses")
    .insert({
      user_id: userId,
      week_start: currentWeek.start,
      answers,
      targets_snapshot: target,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCheckinForWeek(userId, weekStart) {
  const { data, error } = await nutrition
    .from("checkin_responses")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Coach-only stamp — RLS only grants staff an update policy on
// checkin_responses, members are insert-only, so this can never be called
// successfully as a member regardless of what the UI shows.
export async function finalizeCheckin(userId, weekStart) {
  const { error } = await nutrition
    .from("checkin_responses")
    .update({ finalized_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
}
