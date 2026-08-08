import { useState, useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { listPayPeriodOptions, getCurrentPeriodStart } from "./periods";
import { listAllRates } from "./rates";
import { listEntriesForPeriod } from "./entries";
import { buildRateMaps, computeTotals } from "./calc";

// Shared by report.js (native) and report.web.js — every coach's own
// pay-period picker + totals, independent of whatever the admin-only
// all-employee section on top of it looks like per platform.
export function useOwnReport(userId) {
  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [rates, setRates] = useState({ coreRates: [], otherRates: [], spcTiers: [] });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // useFocusEffect's callback below only depends on [userId] (it must not
  // re-fire on every selectedPeriod change, or picking a period would
  // re-trigger a full reload loop) — a ref is what lets it always read the
  // TRUE latest selection instead of the value from whichever render first
  // created the closure, which would otherwise silently reset back to the
  // current period on every refocus regardless of what the coach picked.
  const selectedPeriodRef = useRef(null);
  const applySelectedPeriod = useCallback((value) => {
    selectedPeriodRef.current = value;
    setSelectedPeriod(value);
  }, []);

  const loadPeriodsAndRates = useCallback(async () => {
    const [options, allRates, current] = await Promise.all([listPayPeriodOptions(), listAllRates(), getCurrentPeriodStart()]);
    setPeriodOptions(options);
    setRates(allRates);
    if (!selectedPeriodRef.current) applySelectedPeriod(current);
    return { current };
  }, [applySelectedPeriod]);

  const loadEntriesForPeriod = useCallback(
    async (periodStart) => {
      if (!userId || !periodStart) return;
      const data = await listEntriesForPeriod(userId, periodStart);
      setEntries(data);
    },
    [userId]
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const { current } = await loadPeriodsAndRates();
          if (!cancelled) await loadEntriesForPeriod(selectedPeriodRef.current || current);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, loadPeriodsAndRates, loadEntriesForPeriod])
  );

  const changePeriod = useCallback(
    async (periodStart) => {
      applySelectedPeriod(periodStart);
      setLoading(true);
      try {
        await loadEntriesForPeriod(periodStart);
      } finally {
        setLoading(false);
      }
    },
    [applySelectedPeriod, loadEntriesForPeriod]
  );

  const rateMaps = useMemo(() => buildRateMaps(rates), [rates]);
  const totals = useMemo(() => computeTotals(entries, rateMaps), [entries, rateMaps]);

  return { periodOptions, selectedPeriod, changePeriod, rates, rateMaps, entries, totals, loading };
}
