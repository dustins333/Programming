import { useState, useCallback, useRef } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listPayPeriodOptions, getCurrentPeriodStart } from "../../../../lib/payroll/periods";
import { getRateMapsForPeriod } from "../../../../lib/payroll/rates";
import { listEntriesForPeriodAllStaff } from "../../../../lib/payroll/entries";
import { computeTotalsByStaff, computeTotals, formatMoney } from "../../../../lib/payroll/calc";
import { toastError } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { PeriodPicker, CategoryBreakdown } from "../../../../components/payroll/PayrollReportPieces";
import { PayrollBottomSheet } from "../../../../components/payroll/PayrollBottomSheet";

export default function AdminPayrollReport() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [entries, setEntries] = useState([]);
  const [rateMaps, setRateMaps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openStaffKey, setOpenStaffKey] = useState(null);

  const selectedPeriodRef = useRef(null);

  const loadForPeriod = useCallback(async (periodStart, options) => {
    const periodRow = (options || []).find((p) => p.start_date === periodStart);
    const [rows, maps] = await Promise.all([listEntriesForPeriodAllStaff(periodStart), getRateMapsForPeriod(periodRow)]);
    setEntries(rows);
    setRateMaps(maps);
  }, []);

  const load = useCallback(async () => {
    try {
      const [options, current] = await Promise.all([listPayPeriodOptions(), getCurrentPeriodStart()]);
      setPeriodOptions(options);
      const target = selectedPeriodRef.current || current;
      selectedPeriodRef.current = target;
      setSelectedPeriod(target);
      await loadForPeriod(target, options);
    } catch (err) {
      toastError("Failed to load report", err);
    } finally {
      setLoading(false);
    }
  }, [loadForPeriod]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && !isAdmin) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const changePeriod = async (periodStart) => {
    selectedPeriodRef.current = periodStart;
    setSelectedPeriod(periodStart);
    setLoading(true);
    try {
      await loadForPeriod(periodStart, periodOptions);
    } finally {
      setLoading(false);
    }
  };

  const allStaffTotals = rateMaps ? computeTotalsByStaff(entries, rateMaps).sort((a, b) => b.totals.total - a.totals.total) : [];
  const grandTotal = allStaffTotals.reduce((sum, s) => sum + s.totals.total, 0);
  const openStaff = allStaffTotals.find((s) => s.key === openStaffKey);
  const openStaffEntries = openStaff ? entries.filter((e) => (e.user_id || e.staff_email) === openStaff.key) : [];

  return (
    <CoachShell>
      <ScrollView style={{ backgroundColor: colors.canvas }} className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll — Admin
        </Text>
        <AdminPayrollTabBar active="report" />

        {periodOptions.length > 0 && selectedPeriod ? <PeriodPicker options={periodOptions} selected={selectedPeriod} onChange={changePeriod} /> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : allStaffTotals.length === 0 ? (
          <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            Nobody has logged anything for this period yet.
          </Text>
        ) : (
          <>
            <Text className="mb-3" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
              Total payroll: {formatMoney(grandTotal)}
            </Text>
            {allStaffTotals.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setOpenStaffKey(s.key)}
                className="mb-2 max-w-md flex-row items-center justify-between rounded-xl border border-stone-200 p-4"
                style={{ backgroundColor: "white" }}
              >
                <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>{s.staffName}</Text>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>{formatMoney(s.totals.total)}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <PayrollBottomSheet visible={Boolean(openStaffKey)} onClose={() => setOpenStaffKey(null)} title={openStaff?.staffName || ""}>
        {openStaff ? <CategoryBreakdown totals={computeTotals(openStaffEntries, rateMaps)} entries={openStaffEntries} rateMaps={rateMaps} /> : null}
      </PayrollBottomSheet>
    </CoachShell>
  );
}
