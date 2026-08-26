import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { getMyDocuments } from "./documents";

// How many documents are waiting on this person's signature — the number
// behind the nav badge. Deliberately built from getMyDocuments() rather
// than its own leaner count query: "what counts as pending" has real rules
// (archived, reference-only, re-signature after a version bump) and two
// implementations of it would eventually disagree, leaving a badge that
// points at a list with nothing in it.
//
// Returns `refresh` so a screen that stays mounted (native's More tab) can
// re-count on focus. On web CoachShell remounts on every page navigation,
// so the mount-effect alone keeps it current there.
export function usePendingDocuments() {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { pending } = await getMyDocuments(profile.id);
      setCount(pending.length);
    } catch {
      // A badge is an affordance, not information the app depends on —
      // a failed count stays at its last value rather than surfacing an
      // error over the whole nav.
    }
  }, [profile?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, refresh };
}
