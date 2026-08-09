import { supabase } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { hasAllAngles } from "./photos";

// Independent per-phase completion (order-agnostic) — same shape as the
// standalone app's lib/clientStatus.js. Kova originally dropped that app's
// 4th "Account" step (email-invite confirmation) on the assumption a Kova
// member always has a working login before nutrition is ever turned on —
// that assumption turned out to be wrong (a real client was found approved
// via a manual account link, with a client_id turned on for nutrition,
// having never actually signed into Kova once). That's now tracked
// separately as an account-level concern on the main Clients page
// (core.get_login_activity, migration 0022), not folded into this
// nutrition-specific 3-phase stepper.
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
  // Zero assigned days = objective tracking deliberately skipped for this
  // client (the coach chose not to select any before hitting Send) — it
  // counts as complete and the member never sees the task, rather than
  // being an unfinishable requirement. Per direct ask 2026-08-09.
  const trackingComplete = dates.length === 0 || dates.every((d) => loggedDates.has(d.date));

  const today = todayInBoise();
  const overdueDates = dates.filter((d) => !loggedDates.has(d.date) && d.date < today);
  const loggedCount = dates.filter((d) => loggedDates.has(d.date)).length;

  const phases = computeOnboardingPhases(!!response, trackingComplete, hasBaselinePhotos);

  return {
    response,
    trackingDates: dates,
    trackingLogs: trackingLogs ?? [],
    logsByDate: Object.fromEntries((trackingLogs ?? []).map((l) => [l.date, l])),
    trackingCount: dates.length,
    loggedCount,
    overdueCount: overdueDates.length,
    trackingState: trackingComplete ? "done" : overdueDates.length > 0 ? "overdue" : "pending",
    hasBaselinePhotos,
    phases,
  };
}

// Batched (fixed number of queries, not one per client) onboarding-phase
// computation for a set of not-yet-approved clients — backs the nutrition
// dashboard's "New clients" tile split (Objective tracking set up /
// Objective tracking / Ready for review, see rosterStatus.js). Replaces the
// former getOnboardingRoster (which powered a now-removed dedicated
// Onboarding pipeline page — that page's "resend invite"/"never signed in"
// half moved to the main Clients page instead, since going forward not
// every Kova client is a nutrition client, so that's an account-level
// concern, not a nutrition one).
export async function getOnboardingPhasesForClients(userIds) {
  if (userIds.length === 0) return {};

  const [
    { data: responses, error: responsesError },
    { data: trackingDates, error: datesError },
    { data: trackingLogs, error: logsError },
    { data: photos, error: photosError },
  ] = await Promise.all([
    supabase.from("questionnaire_responses").select("client_id").in("client_id", userIds),
    supabase.from("objective_tracking_dates").select("client_id, date").in("client_id", userIds),
    supabase.from("objective_tracking_logs").select("client_id, date").in("client_id", userIds),
    supabase.from("photos").select("client_id, angle").in("client_id", userIds),
  ]);
  if (responsesError) throw responsesError;
  if (datesError) throw datesError;
  if (logsError) throw logsError;
  if (photosError) throw photosError;

  const respondedIds = new Set((responses ?? []).map((r) => r.client_id));
  const datesByClient = {};
  for (const row of trackingDates ?? []) {
    (datesByClient[row.client_id] ??= []).push(row.date);
  }
  const loggedByClient = {};
  for (const row of trackingLogs ?? []) {
    (loggedByClient[row.client_id] ??= new Set()).add(row.date);
  }
  const photosByClient = {};
  for (const row of photos ?? []) {
    (photosByClient[row.client_id] ??= []).push(row);
  }

  const result = {};
  for (const id of userIds) {
    const dates = datesByClient[id] ?? [];
    const logged = loggedByClient[id] ?? new Set();
    // Zero assigned days = tracking skipped/complete — same rule as
    // getOnboardingStatus above.
    const trackingComplete = dates.length === 0 || dates.every((d) => logged.has(d));
    result[id] = {
      phases: computeOnboardingPhases(respondedIds.has(id), trackingComplete, hasAllAngles(photosByClient[id] ?? [])),
      trackingDatesCount: dates.length,
      trackingLoggedCount: logged.size,
    };
  }
  return result;
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

// Backs both rename (fields = {question_text}) and reorder (fields =
// {position}), same convention as checkin.js's updateTemplateQuestion.
export async function updateQuestionnaireTemplateQuestion(id, fields) {
  const { error } = await supabase.from("questionnaire_template_questions").update(fields).eq("id", id);
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

// Per-client editing, direct — same convention as checkin.js's
// addClientQuestion/updateClientQuestion/deleteClientQuestion, applied here
// so a coach can adjust one client's copied-from-template questionnaire
// before sending it (see clients.js's sendOnboardingToClient) without
// touching the shared template.
export async function addQuestionnaireQuestion(userId, questionText, position) {
  const { error } = await supabase
    .from("client_questionnaire_questions")
    .insert({ client_id: userId, question_text: questionText, position });
  if (error) throw error;
}

export async function updateQuestionnaireQuestion(id, fields) {
  const { error } = await supabase.from("client_questionnaire_questions").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteQuestionnaireQuestion(id) {
  const { error } = await supabase.from("client_questionnaire_questions").delete().eq("id", id);
  if (error) throw error;
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
//
// Also reused for a real edge case this same review screen needs to handle:
// a client who's already approved (objective_tracking_approved_at set —
// e.g. a pre-existing standalone-app client whose Kova nutrition switch was
// just turned on, never run through Kova's own onboarding cycle) but has
// zero targets yet. For that case, only the target insert should happen —
// re-stamping approved_at would overwrite their real original approval
// date, and re-seeding checkin_template_questions would duplicate whatever
// check-in questions they already have.
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
  const { data: clientRow, error: clientFetchError } = await supabase
    .from("clients")
    .select("objective_tracking_approved_at")
    .eq("id", userId)
    .maybeSingle();
  if (clientFetchError) throw clientFetchError;
  const alreadyApproved = !!clientRow?.objective_tracking_approved_at;

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

  if (alreadyApproved) return;

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

// Ported from the standalone app's bypassObjectiveTracking (its "migrate an
// existing pre-app client" action) — for a client who won't do the
// questionnaire/tracking/photos in-app at all (a legacy client being
// migrated in, someone who prefers a paper/verbal intake, a client who's
// simply never going to log into the app). Marks them approved immediately
// with none of the 3 phases done, and — same as the standalone app's
// version — deliberately does NOT insert a target; the coach still does
// that afterward via the normal review/approve screen (reachable once
// approved via the "No target set yet" banner on the client page). Kova has
// no client_drafts (the standalone app's version is a draft-stage action,
// pre-account-creation) — this is the same skip, just applied to an
// existing Kova member's already-real public.clients row instead.
export async function bypassOnboarding(userId) {
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

// Full history (not windowed to the onboarding period) — backs the Targets
// tab's Objective Tracking section, so a coach can pull up a client's OT
// data any time after onboarding too, not just during the initial review.
export async function listObjectiveTrackingLogs(userId) {
  const { data, error } = await supabase
    .from("objective_tracking_logs")
    .select("date, protein_g, carb_g, fat_g, fiber_g")
    .eq("client_id", userId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
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
