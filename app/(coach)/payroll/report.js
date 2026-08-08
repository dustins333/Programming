import { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useOwnReport } from "../../../lib/payroll/useOwnReport";
import { listEntriesForPeriodAllStaff } from "../../../lib/payroll/entries";
import { computeTotalsByStaff, formatMoney } from "../../../lib/payroll/calc";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { PeriodPicker, CategoryBreakdown } from "../../../components/payroll/PayrollReportPieces";

export default function PayrollReport() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";
  const report = useOwnReport(profile?.id);

  const [allStaffTotals, setAllStaffTotals] = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);

  const loadAllStaff = useCallback(async () => {
    if (!isAdmin || !report.selectedPeriod) return;
    setLoadingAll(true);
    try {
      const entries = await listEntriesForPeriodAllStaff(report.selectedPeriod);
      setAllStaffTotals(computeTotalsByStaff(entries, report.rateMaps));
    } catch (err) {
      toastError("Failed to load all-employee totals", err);
    } finally {
      setLoadingAll(false);
    }
  }, [isAdmin, report.selectedPeriod, report.rateMaps]);

  useFocusEffect(
    useCallback(() => {
      loadAllStaff();
    }, [loadAllStaff])
  );

  const grandTotal = allStaffTotals.reduce((sum, s) => sum + s.totals.total, 0);

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll
        </Text>
        <PayrollTabBar active="report" profile={profile} />

        <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
          Your pay
        </Text>
        {report.periodOptions.length > 0 && report.selectedPeriod ? (
          <PeriodPicker options={report.periodOptions} selected={report.selectedPeriod} onChange={report.changePeriod} />
        ) : null}
        {report.loading ? <ActivityIndicator color={colors.primary} /> : <CategoryBreakdown totals={report.totals} />}

        {isAdmin ? (
          <View className="mt-10">
            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              All employees
            </Text>
            {loadingAll ? (
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
                {allStaffTotals
                  .sort((a, b) => b.totals.total - a.totals.total)
                  .map((s) => (
                    <View key={s.key} className="mb-2 max-w-md flex-row items-center justify-between rounded-xl border border-stone-200 p-4">
                      <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>{s.staffName}</Text>
                      <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>{formatMoney(s.totals.total)}</Text>
                    </View>
                  ))}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </CoachShell>
  );
}
