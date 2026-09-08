import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { getMyDocuments } from "./documents";

// How many documents are waiting on this person's signature — the number
// behind the nav badge. Deliberately built from getMyDocuments() rather
// than its own leaner count query: "what counts as pending" has real rules
// (archived, reference-only, re-signature after a version bump) and two
// implementations of it would eventually disagree, leaving a badge that
// points at a list with nothing in it.
//
// Counts on FOCUS, not on mount. The old comment here claimed CoachShell
// remounts on every web navigation so a mount effect was enough — that is
// only true of a push to a sibling route. Pushing into a nested dynamic route
// (/documents/[documentId] is one) leaves the screen, and therefore this
// hook, mounted, so signing something left the badge on its old number.
// `refresh` is still returned for callers that want to re-count by hand.
export function usePendingDocuments() {
  const { profile } = useAuth();
  const [pending, setPending] = useState([]);

  const refresh = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { pending: rows } = await getMyDocuments(profile.id);
      setPending(rows);
    } catch {
      // A badge is an affordance, not information the app depends on —
      // a failed count stays at its last value rather than surfacing an
      // error over the whole nav.
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // `pending` as well as the count: the dashboard's documents row names the
  // first couple of titles ("Floor SOP v3 · Injury reporting"), and this
  // call already has them — a second query for the same rows is how the
  // badge and the row it sits above end up disagreeing.
  return { count: pending.length, pending, refresh };
}
