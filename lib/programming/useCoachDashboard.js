import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { getCoachDashboardStats } from "./coachDashboard";
import { getLaunchpadExtras, scopeSpcToCoach } from "./launchpad";
import { listDismissals } from "./dashboardDismissals";
import { getNutritionToday } from "./dashboardCards";

// One load() for all three coach-home wrappers — the web desktop screen, the
// web mobile screen, and native. Extracted for the same reason
// clientsRoster.js was: three copies of a fetch diverge, and the two that
// existed before this already had (native's was still on the pre-launchpad
// stat-tile model and never picked up resume, gym-today or payroll).
//
// Loading is staged deliberately. `stats` is the only hard dependency — a
// failure there is a real error screen. Everything after it is additive to a
// dashboard that has already rendered, and each piece swallows its own
// failure internally, so a missing migration or a slow payroll query costs
// one card rather than the page.
export function useCoachDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(null);
  const [extras, setExtras] = useState(null);
  const [dismissals, setDismissals] = useState({});
  const [nutritionToday, setNutritionToday] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    let loaded;
    try {
      // Dismissals are fetched WITH stats, not after them. Loaded second,
      // the attention list rendered once unfiltered and then had rows yanked
      // out from under the reader a beat later — items visibly appearing and
      // then clearing to "nothing's on fire", which reads like a bug even
      // though the filtering is correct. It's a cheap query and runs in
      // parallel, so nothing is slower for it.
      //
      // Its own .catch, so a dismissals failure can never be what rejects
      // this Promise.all — only a genuine stats failure reaches the error
      // screen. An empty set just means nothing is filtered, which is the
      // right way to fail: it shows too much rather than hiding work.
      const [stats_, dismissed] = await Promise.all([
        getCoachDashboardStats(),
        listDismissals().catch(() => ({})),
      ]);
      // The SPC "needs a new program" rows are scoped to whoever is looking
      // here, once, rather than at each of the four places that render them
      // (Needs You, the SPC launch card's count, and the mobile SPC tile and
      // its sheet). getCoachDashboardStats stays profile-blind — it's a data
      // function, and the roster counts beside these are genuinely gym-wide.
      loaded = { ...stats_, spcNeedsNewProgram: scopeSpcToCoach(stats_.spcNeedsNewProgram, profile) };
      loaded.spcIssues = loaded.spcNeedsNewProgram;
      setDismissals(dismissed);
      setStats(loaded);
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    setExtras(await getLaunchpadExtras(profile, loaded));
    // Only the mobile dashboard's Nutrition card reads this, and it's the
    // one card whose detail isn't already inside stats/extras. Isolated so a
    // nutrition failure costs that card alone — `null` is "couldn't load",
    // distinct from a real zero.
    try {
      setNutritionToday(await getNutritionToday());
    } catch (err) {
      console.error("Dashboard: nutrition card failed", err);
      setNutritionToday(null);
    }
  }, [profile]);

  // useFocusEffect, not a mount-only useEffect — every coach root screen is a
  // Tabs child on native and stays mounted across tab switches, so a
  // mount-only load left the dashboard stale for a whole session.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { profile, stats, extras, dismissals, setDismissals, nutritionToday, loadError, reload: load };
}
