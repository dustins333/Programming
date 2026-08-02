import { supabase } from "../supabase/client";
import { todayInBoise } from "../boiseDate";

// Independent per-phase completion (order-agnostic) — same shape as the
// standalone app's lib/clientStatus.js. Kova drops that app's 4th "Account"
// step (email-invite confirmation) since a Kova member already has a
// working login before nutrition is ever turned on — see the onboarding
// section of the nutrition-rebuild plan.
export function computeOnboardingPhases(hasResponse, trackingComplete, hasBaselinePhotos) {
  return {
    questionnaire: hasResponse,
    tracking: trackingComplete,
    photos: hasBaselinePhotos,
    readyForReview: hasResponse && trackingComplete && hasBaselinePhotos,
  };
}

function average(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Averages a client's Objective Tracking days into the baseline shown on
// review — same formula the standalone app's lib/objectiveTrackingBaseline.js
// uses.
export function computeBaseline(trackingLogs) {
  if (!trackingLogs || trackingLogs.length === 0) return null;

  const avgProtein = average(trackingLogs.map((l) => Number(l.protein_g)));
  const avgCarb = average(trackingLogs.map((l) => Number(l.carb_g)));
  const avgFat = average(trackingLogs.map((l) => Number(l.fat_g)));
  const avgFiber = average(trackingLogs.map((l) => Number(l.fiber_g)));
  const avgCalories = 4 * avgProtein + 4 * avgCarb + 9 * avgFat;

  return {
    protein: avgProtein,
    carb: avgCarb,
    fat: avgFat,
    fiber: avgFiber,
    calories: avgCalories,
    proteinPct: (4 * avgProtein / avgCalories) * 100,
    carbPct: (4 * avgCarb / avgCalories) * 100,
    fatPct: (9 * avgFat / avgCalories) * 100,
  };
}

// Everything both the coach's pre-approval branch and the member's
// onboarding hub need — one aggregate fetch so neither screen duplicates
// the phase-computation logic.
export async function getOnboardingStatus(userId) {
  const [
    { data: response },
    { data: trackingDates },
    { data: trackingLogs },
    { data: baselinePhotos },
  ] = await Promise.all([
    supabase.from("questionnaire_responses").select("answers, submitted_at, highlights").eq("client_id", userId).maybeSingle(),
    supabase.from("objective_tracking_dates").select("id, date").eq("client_id", userId).order("date"),
    supabase.from("objective_tracking_logs").select("date, protein_g, carb_g, fat_g, fiber_g").eq("client_id", userId),
    supabase.from("photos").select("angle").eq("client_id", userId),
  ]);

  const angles = new Set((baselinePhotos ?? []).map((p) => p.angle));
  const hasBaselinePhotos = ["front", "side", "back"].every((a) => angles.has(a));

  const loggedDates = new Set((trackingLogs ?? []).map((l) => l.date));
  const dates = trackingDates ?? [];
  const allAssignedLogged = dates.length > 0 && dates.every((d) => loggedDates.has(d.date));

  const today = todayInBoise();
  const overdueDates = dates.filter((d) => !loggedDates.has(d.date) && d.date < today);
  const loggedCount = dates.filter((d) => loggedDates.has(d.date)).length;

  const phases = computeOnboardingPhases(!!response, allAssignedLogged, hasBaselinePhotos);

  return {
    response,
    trackingDates: dates,
    trackingLogs: trackingLogs ?? [],
    logsByDate: Object.fromEntries((trackingLogs ?? []).map((l) => [l.date, l])),
    trackingCount: dates.length,
    loggedCount,
    overdueCount: overdueDates.length,
    trackingState: allAssignedLogged && dates.length > 0 ? "done" : overdueDates.length > 0 ? "overdue" : "pending",
    hasBaselinePhotos,
    phases,
  };
}

// --- Coach-side mutations ---

export async function listQuestionnaireTemplateQuestions() {
  const { data, error } = await supabase.from("questionnaire_template_questions").select("*").order("position");
  if (error) throw error;
  return data;
}

export async function addQuestionnaireTemplateQuestion(questionText, position) {
  const { error } = await supabase.from("questionnaire_template_questions").insert({ question_text: questionText, position });
  if (error) throw error;
}

export async function deleteQuestionnaireTemplateQuestion(id) {
  const { error } = await supabase.from("questionnaire_template_questions").delete().eq("id", id);
  if (error) throw error;
}

export async function listQuestionnaireQuestions(userId) {
  const { data, error } = await supabase
    .from("client_questionnaire_questions")
    .select("*")
    .eq("client_id", userId)
    .order("position");
  if (error) throw error;
  return data;
}

// Physical copy from the master template, same convention as
// checkin.js's copyTemplateToClient — used both as the automatic bootstrap
// when a brand-new-to-nutrition client is created (see
// lib/nutrition/clients.js) and as a manual fallback if a coach needs to
// re-copy for someone who somehow has none.
export async function copyQuestionnaireTemplateToClient(userId) {
  const { data: template, error: templateError } = await supabase
    .from("questionnaire_template_questions")
    .select("position, question_text")
    .order("position");
  if (templateError) throw templateError;
  if (!template || template.length === 0) return;

  const { error } = await supabase
    .from("client_questionnaire_questions")
    .insert(template.map((q) => ({ client_id: userId, position: q.position, question_text: q.question_text })));
  if (error) throw error;
}

export async function addTrackingDate(userId, date) {
  const { error } = await supabase.from("objective_tracking_dates").insert({ client_id: userId, date });
  if (error) throw error;
}

export async function removeTrackingDate(dateId) {
  const { error } = await supabase.from("objective_tracking_dates").delete().eq("id", dateId);
  if (error) throw error;
}

export async function updatePrepNotes(userId, notes) {
  const { error } = await supabase.from("clients").update({ objective_tracking_prep_notes: notes }).eq("id", userId);
  if (error) throw error;
}

// "Graduation" — insert the client's first target, stamp
// objective_tracking_approved_at, and seed their check-in questions from the
// template (same three things the standalone app's approveAndSetTargets
// does, ported verbatim).
export async function approveAndSetTargets({
  userId,
  coachId,
  proteinG,
  carbG,
  fatG,
  fiberG,
  stepGoal,
  sleepHoursGoal,
  note,
}) {
  const { error: targetsError } = await supabase.from("targets").insert({
    client_id: userId,
    set_by: coachId,
    protein_g: proteinG,
    carb_g: carbG,
    fat_g: fatG,
    fiber_g: fiberG,
    step_goal: stepGoal ?? null,
    sleep_hours_goal: sleepHoursGoal ?? null,
    note: note || null,
    effective_date: todayInBoise(),
  });
  if (targetsError) throw targetsError;

  const { error: clientError } = await supabase
    .from("clients")
    .update({ objective_tracking_approved_at: new Date().toISOString() })
    .eq("id", userId);
  if (clientError) throw clientError;

  const { data: checkinTemplate, error: templateError } = await supabase
    .from("checkin_template_questions")
    .select("position, question_text")
    .order("position");
  if (templateError) throw templateError;
  if (checkinTemplate && checkinTemplate.length > 0) {
    const { error: checkinQuestionsError } = await supabase
      .from("client_checkin_questions")
      .insert(checkinTemplate.map((q) => ({ client_id: userId, position: q.position, question_text: q.question_text })));
    if (checkinQuestionsError) throw checkinQuestionsError;
  }
}

// --- Member-side mutations ---

export async function submitQuestionnaire(userId, answers) {
  const { error } = await supabase.from("questionnaire_responses").insert({ client_id: userId, answers });
  if (error) throw error;
}

export async function logObjectiveTrackingDay(userId, date, values) {
  const { error } = await supabase.from("objective_tracking_logs").upsert(
    {
      client_id: userId,
      date,
      protein_g: Number(values.protein_g),
      carb_g: Number(values.carb_g),
      fat_g: Number(values.fat_g),
      fiber_g: Number(values.fiber_g),
    },
    { onConflict: "client_id,date" }
  );
  if (error) throw error;
}
