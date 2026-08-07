import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "./clients";

// Shared by all 4 member nutrition screens: resolves whether this member
// has a public.clients row at all (nutrition turned on) and, if so, whether
// they're past onboarding (objective_tracking_approved_at set) — the same
// gate the standalone app's app/home/page.js applies before showing
// HomeTabs vs. OnboardingHub. A client whose coach toggled them off
// (status "paused"/"archived") is treated identically to never having a
// row at all — turning nutrition off should be a full disappear, not just
// a locked view of the same content.
//
// "pending" (new, migration 0031) is a not-yet-approved client whose coach
// hasn't hit "Send to client" yet — same as "onboarding" except there's
// nothing to actually see or do, since the questionnaire/tracking dates the
// coach is still setting up aren't visible to them until sent.
export function useNutritionAccess(userId) {
  const [state, setState] = useState({ status: "loading", client: null, error: null });
  const requestIdRef = useRef(0);

  // Exposed so screen-level call sites can re-check on focus (Tabs keep
  // screens mounted — without this, a coach turning nutrition on or
  // approving targets while the member already has this tab open stays
  // invisible until the app restarts). _layout.js's tab-visibility check
  // intentionally does NOT call this — it only needs the mount-time value
  // to decide whether to show the tab at all, and its own "error" status
  // is now included in the visible set so a transient failure here doesn't
  // hide the tab entirely (see app/(member)/_layout.js).
  const refetch = useCallback(() => {
    if (!userId) return;
    const requestId = ++requestIdRef.current;
    (async () => {
      try {
        const client = await getClient(userId);
        if (requestId !== requestIdRef.current) return;
        if (!client || client.status !== "active") {
          setState({ status: "not-enrolled", client: null, error: null });
        } else if (!client.objective_tracking_approved_at) {
          setState({ status: client.onboarding_sent_at ? "onboarding" : "pending", client, error: null });
        } else {
          setState({ status: "active", client, error: null });
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setState({ status: "error", client: null, error: err.message ?? String(err) });
      }
    })();
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
