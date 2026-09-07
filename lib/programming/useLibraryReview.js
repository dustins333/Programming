import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { isLibraryReviewer, listExercises, listPendingExercises } from "./exercises";
import { findDuplicateCandidates, listMergeDismissals, pairKey } from "./exerciseMerge";

// The two figures on the desktop dashboard's Library review section: how many
// entries are waiting for a decision, and how many pairs still look like the
// same lift twice.
//
// REVIEWER ONLY, and it doesn't query at all for anyone else. A non-reviewer
// can read pending rows (the library's SELECT policy is plain is_staff()), so
// asking would come back populated and light up a section they can't act on.
//
// The dupe half costs two small reads of a ~160-row table, which is why it's
// gated and isolated rather than folded into getCoachDashboardStats: it's the
// least urgent thing on the page, it changes about once a month, and a
// failure here must cost one tile rather than the dashboard. Both halves fall
// back to null (not 0) so a broken read never claims a clean queue.
//
// The pure detector is reused rather than reimplemented. Its rules are hard
// won — an earlier substring version produced 35 suggestions from a real
// library of which almost none were real, and a dashboard tile promising
// "2 likely dupes" has to mean the same 2 the merge page will show.
export function useLibraryReview() {
  const { profile } = useAuth();
  const reviewer = isLibraryReviewer(profile);
  const [state, setState] = useState({ pendingCount: null, authorCount: null, dupeCount: null });

  const refresh = useCallback(async () => {
    if (!reviewer) {
      setState({ pendingCount: 0, authorCount: 0, dupeCount: 0 });
      return;
    }
    try {
      const pending = await listPendingExercises();
      setState((prev) => ({
        ...prev,
        pendingCount: pending.length,
        authorCount: new Set(pending.map((e) => e.created_by).filter(Boolean)).size,
      }));
    } catch {
      setState((prev) => ({ ...prev, pendingCount: null, authorCount: null }));
    }
    try {
      const [exercises, dismissals] = await Promise.all([listExercises(), listMergeDismissals()]);
      const dismissed = new Set(dismissals.map((d) => pairKey(d.exercise_a_id, d.exercise_b_id)));
      setState((prev) => ({ ...prev, dupeCount: findDuplicateCandidates(exercises, dismissed).length }));
    } catch {
      setState((prev) => ({ ...prev, dupeCount: null }));
    }
  }, [reviewer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, reviewer, refresh };
}
