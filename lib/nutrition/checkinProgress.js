// What a member still owes on this week's check-in, in one place.
//
// Three surfaces ask the same question and used to have no shared answer at
// all: the Check-In screen itself, My Week's pill, and the nudge that fires
// when someone starts a check-in and walks away. Coaches reported members
// finishing one task, seeing it go green, and reasonably believing they were
// done — so the wording for "what's left" has to be identical wherever it
// appears, or the screen and the reminder disagree about what she still owes.
//
// Deliberately pure: every caller has already fetched what it needs (the
// member's answers, her photos for the week, whether this week requires
// them), and passing those in keeps this testable and query-free.

export const CHECKIN_TASK_PHOTOS = "photos";
export const CHECKIN_TASK_FORM = "form";

/**
 * @param photosRequired  is this a photo week (isPhotoRequirementWeek)
 * @param photosSatisfied all three angles in, or a skip reason given
 * @param questionCount   how many check-in questions she has
 * @param answeredCount   how many of them have a non-empty answer
 */
export function describeCheckinProgress({ photosRequired, photosSatisfied, questionCount, answeredCount }) {
  const formRequired = questionCount > 0;
  const formSatisfied = formRequired ? answeredCount >= questionCount : true;

  const outstanding = [];
  if (photosRequired && !photosSatisfied) outstanding.push(CHECKIN_TASK_PHOTOS);
  if (formRequired && !formSatisfied) outstanding.push(CHECKIN_TASK_FORM);

  const taskTotal = (photosRequired ? 1 : 0) + (formRequired ? 1 : 0);
  const taskDone = taskTotal - outstanding.length;

  return {
    taskTotal,
    taskDone,
    outstanding,
    photosOutstanding: outstanding.includes(CHECKIN_TASK_PHOTOS),
    formOutstanding: outstanding.includes(CHECKIN_TASK_FORM),
    remainingQuestions: formRequired ? Math.max(0, questionCount - answeredCount) : 0,
    // Nothing to send at all — no questions and no photos due. Distinct from
    // "ready to send": an empty check-in on her record is worse than none.
    nothingToDo: taskTotal === 0,
    ready: taskTotal > 0 && outstanding.length === 0,
  };
}

/**
 * Sentence fragment naming what's left, lowercase so it can follow a lead-in
 * ("Not sent yet | photos still needed"). Null when nothing is outstanding.
 */
export function outstandingLabel(progress) {
  const parts = [];
  if (progress.photosOutstanding) parts.push("photos still needed");
  if (progress.formOutstanding) {
    const n = progress.remainingQuestions;
    parts.push(n === 1 ? "1 question still to answer" : `${n} questions still to answer`);
  }
  if (parts.length === 0) return null;
  return parts.join(" and ");
}

/** Same fragment, sentence-cased, for copy that starts with it. */
export function outstandingSentence(progress) {
  const label = outstandingLabel(progress);
  if (!label) return null;
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}.`;
}

/**
 * Has she put real work in and stopped? This is what separates "hasn't
 * started" (My Week's pill is enough) from "started and walked away" (worth
 * a nudge). Anything she'd lose by forgetting counts.
 */
export function hasStartedCheckin({ answeredCount = 0, anglesInCount = 0, skipReason = null }) {
  return answeredCount > 0 || anglesInCount > 0 || Boolean(skipReason);
}
