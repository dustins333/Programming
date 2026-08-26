// When a member's check-in should send itself.
//
// A check-in used to need a separate Finalize tap after the tasks were
// done, and members reasonably read "form answered" as "check-in done" and
// walked away — so finishing the last task now submits on its own.
//
// One definition, used by both the live week and a coach-reopened one on
// app/(member)/nutrition/checkin.js. Those are two independent submission
// targets with their own state, and a second copy of this rule would drift.
//
// `armed` is the important input: it means the member just FINISHED an
// interaction (closed the form, an upload landed, a skip reason saved), not
// that her answers happen to be complete. Keying off completeness alone
// would fire the moment the last box had one character in it — mid-word,
// mid-sentence — and a submit here is not undoable from the member's side
// (checkin_responses is insert-only for members; only a coach can reopen).
export function shouldAutoSubmit({ armed, popupOpen, alreadySubmitted, taskTotal, canSubmit }) {
  // Nothing has been finished since the last send attempt.
  if (!armed) return false;
  // She's still in a sheet. Covers reopening the form to change an answer
  // after already completing it, and completeness reached while typing.
  if (popupOpen) return false;
  if (alreadySubmitted) return false;
  // No questions and no photos due: there is nothing to send, and an empty
  // check-in on her record is worse than none at all.
  if (taskTotal === 0) return false;
  return Boolean(canSubmit);
}
