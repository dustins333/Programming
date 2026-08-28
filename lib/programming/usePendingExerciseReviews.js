import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { countPendingExercises, isLibraryReviewer } from "./exercises";

// How many library entries are waiting for review — the number behind the
// nav badge, and the reason the review row exists at all.
//
// Returns 0 for anyone who isn't a reviewer without querying: a
// non-reviewer CAN read pending rows (the library's SELECT policy is plain
// is_staff()), so the count would come back populated and light up a badge
// for a row they can't even see.
//
// Returns `refresh` so a screen that stays mounted (native's More tab)
// re-counts on focus. On web CoachShell remounts on every page navigation,
// so the mount effect alone keeps it current there.
export function usePendingExerciseReviews() {
  const { profile } = useAuth();
  const reviewer = isLibraryReviewer(profile);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!reviewer) {
      setCount(0);
      return;
    }
    try {
      setCount(await countPendingExercises());
    } catch {
      // A badge is an affordance, not information the app depends on — a
      // failed count holds its last value rather than surfacing an error
      // across the whole nav.
    }
  }, [reviewer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, refresh };
}
