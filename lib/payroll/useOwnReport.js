import { useState, useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { listPayPeriodOptions, getCurrentPeriodStart } from "./periods";
import { getRateMapsForPeriod } from "./rates";
import { listEntriesForPeriod } from "./entries";
import { computeTotals } from "./calc";
import { computePeriodEnd } from "./periods";
import {
  listNutritionBillingForPeriod,
  summarizeNutritionBilling,
  NUTRITION_OTHER_TYPE,
} from "./nutritionAssignments";

// Shared by report.js (native) and report.web.js — every coach's own
// pay-period picker + totals, independent of whatever the admin-only
// all-employee section on top of it looks like per platform.
//
// Takes the whole profile rather than just an id: a coach's pre-cutover
// history is in rows imported from Glide that carry only staff_email (no
// user_id at all), so listEntriesForPeriod needs both to find it.
// initialPeriodStart lets a caller open the screen on a specific period —
// the deadline-reminder push and the on-screen finalize banner both carry
// one, and without it a coach tapping "finalize the period that just ended"
// landed on the CURRENT period with nothing to submit. Only ever the
// starting selection: once the coach picks something else, that wins for
// the rest of the visit (the ref below is seeded, not re-applied).
export function useOwnReport(profile, initialPeriodStart = null) {
  const userId = profile?.id;
  const staffEmail = profile?.email;
  const isNutritionCoach = profile?.role === "admin" || Boolean(profile?.can_view_nutrition);

  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriodStart || null);
  const [rateMaps, setRateMaps] = useState({ core: {}, other: {}, spc: {} });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  // A failed load used to fall through to "$0.00" with an empty period
  // picker and no indication anything had gone wrong — the worst possible
  // silent failure on a screen whose whole job is telling someone what they
  // earned.
  const [loadError, setLoadError] = useState(null);
  // 1:1 Nutrition billing that this period will pick up but hasn't yet —
  // the money only becomes a real pay_entries row when the coach confirms
  // the roster at finalize, which used to mean a nutrition coach saw
  // nothing at all for it on My Pay until the very end of the period and
  // had no way to tell whether it was working. Previewed here instead.
  const [pendingNutrition, setPendingNutrition] = useState(null);

  // useFocusEffect's callback below only depends on [userId] (it must not
  // re-fire on every selectedPeriod change, or picking a period would
  // re-trigger a full reload loop) — a ref is what lets it always read the
  // TRUE latest selection instead of the value from whichever render first
  // created the closure, which would otherwise silently reset back to the
  // current period on every refocus regardless of what the coach picked.
  const selectedPeriodRef = useRef(initialPeriodStart || null);
  const optionsRef = useRef([]);
  const applySelectedPeriod = useCallback((value) => {
    selectedPeriodRef.current = value;
    setSelectedPeriod(value);
  }, []);

  const loadPeriods = useCallback(async () => {
    const [options, current] = await Promise.all([listPayPeriodOptions(), getCurrentPeriodStart()]);
    optionsRef.current = options;
    setPeriodOptions(options);
    if (!selectedPeriodRef.current) applySelectedPeriod(current);
    return { current, options };
  }, [applySelectedPeriod]);

  // Rates are resolved PER PERIOD, not once globally: a closed period is
  // audit-locked to the rates frozen into closed_period_rate_snapshots at
  // close time (getRateMapsForPeriod falls back to live rates for an open
  // one). Reading live rates here meant a coach looking back at an already-
  // paid period saw it silently repriced by any later rate change — and
  // disagreeing with both the CSV they were paid from and the admin's own
  // view of the same period.
  const loadEntriesForPeriod = useCallback(
    async (periodStart, options) => {
      if (!userId || !periodStart) return;
      const periodRow = (options ?? optionsRef.current).find((p) => p.start_date === periodStart) ?? null;
      const [data, maps] = await Promise.all([
        listEntriesForPeriod(userId, periodStart, staffEmail),
        getRateMapsForPeriod(periodRow),
      ]);
      setEntries(data);
      setRateMaps(maps);

      // Isolated: a nutrition roster that fails to load must not take down
      // the pay figures beside it, which are the reason this screen exists.
      if (!isNutritionCoach) {
        setPendingNutrition(null);
        return;
      }
      try {
        const rows = await listNutritionBillingForPeriod({
          coachId: userId,
          periodStart,
          periodEnd: computePeriodEnd(periodStart),
          entries: data,
        });
        // Priced off the same rate table the finalize sheet bills from, so
        // the preview and the amount on the Finalize button always agree.
        setPendingNutrition(summarizeNutritionBilling(rows, maps?.other?.[NUTRITION_OTHER_TYPE] ?? 0));
      } catch {
        setPendingNutrition(null);
      }
    },
    [userId, staffEmail, isNutritionCoach]
  );

  const runLoad = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { current, options } = await loadPeriods();
      await loadEntriesForPeriod(selectedPeriodRef.current || current, options);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [loadPeriods, loadEntriesForPeriod]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setLoadError(null);
        try {
          const { current, options } = await loadPeriods();
          if (!cancelled) await loadEntriesForPeriod(selectedPeriodRef.current || current, options);
        } catch (err) {
          if (!cancelled) setLoadError(err.message ?? String(err));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, loadPeriods, loadEntriesForPeriod])
  );

  const changePeriod = useCallback(
    async (periodStart) => {
      applySelectedPeriod(periodStart);
      setLoading(true);
      setLoadError(null);
      try {
        await loadEntriesForPeriod(periodStart);
      } catch (err) {
        // Clear the previous period's rows rather than leaving them on
        // screen under the newly-selected period's label — showing one
        // period's money attributed to another is worse than showing none.
        setEntries([]);
        setPendingNutrition(null);
        setLoadError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    },
    [applySelectedPeriod, loadEntriesForPeriod]
  );

  const totals = useMemo(() => computeTotals(entries, rateMaps), [entries, rateMaps]);

  return { periodOptions, selectedPeriod, changePeriod, rateMaps, entries, totals, pendingNutrition, loading, loadError, retry: runLoad };
}
