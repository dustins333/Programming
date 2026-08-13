import { useState, useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { listPayPeriodOptions, getCurrentPeriodStart } from "./periods";
import { getRateMapsForPeriod } from "./rates";
import { listEntriesForPeriod } from "./entries";
import { computeTotals } from "./calc";

// Shared by report.js (native) and report.web.js — every coach's own
// pay-period picker + totals, independent of whatever the admin-only
// all-employee section on top of it looks like per platform.
//
// Takes the whole profile rather than just an id: a coach's pre-cutover
// history is in rows imported from Glide that carry only staff_email (no
// user_id at all), so listEntriesForPeriod needs both to find it.
export function useOwnReport(profile) {
  const userId = profile?.id;
  const staffEmail = profile?.email;

  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [rateMaps, setRateMaps] = useState({ core: {}, other: {}, spc: {} });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  // A failed load used to fall through to "$0.00" with an empty period
  // picker and no indication anything had gone wrong — the worst possible
  // silent failure on a screen whose whole job is telling someone what they
  // earned.
  const [loadError, setLoadError] = useState(null);

  // useFocusEffect's callback below only depends on [userId] (it must not
  // re-fire on every selectedPeriod change, or picking a period would
  // re-trigger a full reload loop) — a ref is what lets it always read the
  // TRUE latest selection instead of the value from whichever render first
  // created the closure, which would otherwise silently reset back to the
  // current period on every refocus regardless of what the coach picked.
  const selectedPeriodRef = useRef(null);
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
    },
    [userId, staffEmail]
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
        setLoadError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    },
    [applySelectedPeriod, loadEntriesForPeriod]
  );

  const totals = useMemo(() => computeTotals(entries, rateMaps), [entries, rateMaps]);

  return { periodOptions, selectedPeriod, changePeriod, rateMaps, entries, totals, loading, loadError, retry: runLoad };
}
