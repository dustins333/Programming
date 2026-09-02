import { useEffect, useState } from "react";
import { listMyAssignments } from "./memberPlan";
import { getSpcClient, isSpcActive } from "./spcClients";
import { listActiveOneOffWorkoutsForUser } from "./oneOffWorkouts";
import { getLiveAlternateProgramForUser } from "./alternatePrograms";

// Whether this member has any fitness programming at all — a group
// membership, active SPC, an open one-off, or a live alternate run. Backs
// hiding the My Fitness
// tab for nutrition-only clients (mirror of the nutrition tab's own
// enrollment gating in app/(member)/_layout.js). Defaults to TRUE while
// loading and on error — the opposite default from the nutrition tab,
// deliberately: most members train, so flashing the tab out-then-in would
// hit the majority, and a transient fetch failure must never hide a tab a
// member genuinely has (same reasoning as the nutrition tab including
// "error" in its visible set).
export function useHasFitness(userId) {
  const [hasFitness, setHasFitness] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [assignments, spcClient, oneOffs, alternate] = await Promise.all([
          listMyAssignments(userId),
          getSpcClient(userId),
          listActiveOneOffWorkoutsForUser(userId),
          getLiveAlternateProgramForUser(userId),
        ]);
        if (!cancelled) {
          setHasFitness(
            assignments.length > 0 || isSpcActive(spcClient) || oneOffs.length > 0 || !!alternate
          );
        }
      } catch {
        if (!cancelled) setHasFitness(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return hasFitness;
}
