// Pairs a submitted check-in's answers against the same client's previous
// submission, so the coach reads this week against last week rather than in
// isolation (coach web v2, screen 22).
//
// No interpretation anywhere in here, per the handoff's own decision:
// nothing summarizes an answer or suggests what to do about it. This only
// says which question is which and what she said last time. Every answer is
// rendered every week — an earlier version folded the ones that matched last
// week behind a count, which is the same thing as deciding for the coach
// which parts of a check-in are worth reading.

// Answers are stored as a jsonb array of {question, answer} pairs — the
// question TEXT is the only stable identifier across two submissions, since
// checkin_responses snapshots the wording rather than referencing a question
// row. So a coach renaming a question mid-programme legitimately breaks the
// pairing for that one question, once. Matching on a normalized form absorbs
// the trivial cases (trailing whitespace, casing) without pretending to
// absorb a real rewrite.
function normalize(text) {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// `templateQuestions` distinguishes the gym-wide questions from the ones
// written for this client alone — the HERS ONLY badge. Pass null when the
// template hasn't loaded and every answer renders unbadged, which is the
// right failure mode: silently badging all 18 questions as client-specific
// would be worse than badging none.
export function pairAnswers(answers, priorAnswers, templateQuestions) {
  const priorByQuestion = new Map((priorAnswers ?? []).map((a) => [normalize(a.question), a.answer]));
  const templateSet = templateQuestions ? new Set(templateQuestions.map((q) => normalize(q.question_text))) : null;

  return (answers ?? []).map((a, index) => {
    const hasPrior = priorByQuestion.has(normalize(a.question));
    const lastAnswer = hasPrior ? priorByQuestion.get(normalize(a.question)) : null;
    return {
      // The original array index — highlights are stored keyed by it
      // (checkin_responses.highlights), so it must survive any reordering or
      // filtering a consumer does.
      index,
      question: a.question,
      answer: a.answer,
      lastAnswer,
      hasPrior,
      hersOnly: templateSet ? !templateSet.has(normalize(a.question)) : false,
    };
  });
}


// The metric strip above the answers — this check-in week's averages against
// the week before it. Arithmetic only; a delta is a delta, never "good" or
// "bad", because which direction is which depends entirely on what the
// client is actually working toward.
export const CHECKIN_METRICS = [
  { key: "weight", label: "Weight", digits: 1 },
  { key: "sleep_hours", label: "Sleep", digits: 1, unit: " h" },
  { key: "sleep_quality", label: "Quality", digits: 1 },
  { key: "steps", label: "Steps", digits: 0 },
  { key: "hunger", label: "Hunger", digits: 1 },
  { key: "energy", label: "Energy", digits: 1 },
];

export function metricDeltas(summary, priorSummary) {
  return CHECKIN_METRICS.map((metric) => {
    const value = summary?.averages?.[metric.key] ?? null;
    const prior = priorSummary?.averages?.[metric.key] ?? null;
    const delta = value !== null && prior !== null ? value - prior : null;
    return { ...metric, value, prior, delta };
  });
}
