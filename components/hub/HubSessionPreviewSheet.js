import { useEffect, useState } from "react";
import { SessionSheet } from "../SessionSheet";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";

// The eye on a session row in the hub pickers: what's actually in this
// session, before committing anyone to it.
//
// It is the member's own SessionSheet, which is what the ask was — "the same
// one you would see when clicking a session on my week" — and the same one
// CoachSpcOverview already opens from a block week. Deliberately NOT the
// print-sheet block overview (components/coach/SpcSessionPreview): that
// screen answers "how has this block gone week by week", which is the
// question you ask when REVIEWING a staged group, not the one you ask while
// scanning a roster for who is on the board tomorrow.
//
// `state="future"` because nothing here is loggable: a coach is looking at
// someone else's session, and the sheet's own CTA has no meaning. The pill
// says what the session is instead.

// Same one-line prescription CoachSpcOverview renders. A varying rep scheme
// is spelled out ("10, 8, 8") — flattening it to the first number would hide
// exactly the thing a coach is checking for.
function prescriptionLine(ex) {
  const reps = Array.isArray(ex.rep_scheme) && new Set(ex.rep_scheme).size > 1 ? ex.rep_scheme.join(", ") : ex.reps;
  return `${ex.sets ?? "–"} × ${reps ?? "–"}`;
}

export function HubSessionPreviewSheet({ visible, onClose, target }) {
  // { clientName, weekNumber, session: { spcWorkoutId, sessionNumber, title, completed } }
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const workoutId = target?.session?.spcWorkoutId ?? null;

  const load = () => {
    if (!workoutId) return;
    setError(null);
    setContent(null);
    Promise.all([listSpcWarmups(workoutId), listSpcWorkoutExercises(workoutId)])
      .then(([warmups, rows]) => {
        setContent({
          warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
          exercises: rows.map((ex) => ({
            id: ex.id,
            exerciseId: ex.exercises?.id ?? ex.exercise_id,
            name: ex.exercises?.name ?? "Exercise",
            detail: prescriptionLine(ex),
            supersetGroupId: ex.superset_group_id,
            targetSets: ex.sets,
          })),
        });
      })
      .catch((err) => setError(err.message ?? String(err)));
  };

  // Keyed on the workout, so opening a second session after the first
  // re-reads rather than showing the previous one's lifts.
  useEffect(load, [workoutId]);

  const session = target?.session;
  return (
    <SessionSheet
      key={workoutId ?? "none"}
      visible={visible}
      onClose={onClose}
      eyebrow={target ? `${target.clientName} | Week ${target.weekNumber}` : ""}
      title={session ? session.title || `Session ${session.sessionNumber}` : ""}
      state="future"
      pillLabel={session?.completed ? "DONE THIS WEEK" : `SESSION ${session?.sessionNumber ?? ""}`}
      loading={!error && !content}
      error={error}
      onRetry={load}
      exercises={content?.exercises ?? []}
      footerNote="Preview only — nothing is logged from here"
    />
  );
}
