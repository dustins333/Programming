import { useEffect, useState } from "react";
import { getClient } from "./clients";

// Shared by all 4 member nutrition screens: resolves whether this member
// has a public.clients row at all (nutrition turned on) and, if so, whether
// they're past onboarding (objective_tracking_approved_at set) — the same
// gate the standalone app's app/home/page.js applies before showing
// HomeTabs vs. OnboardingHub.
export function useNutritionAccess(userId) {
  const [state, setState] = useState({ status: "loading", client: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await getClient(userId);
        if (cancelled) return;
        if (!client) {
          setState({ status: "not-enrolled", client: null, error: null });
        } else if (!client.objective_tracking_approved_at) {
          setState({ status: "onboarding", client, error: null });
        } else {
          setState({ status: "active", client, error: null });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", client: null, error: err.message ?? String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
