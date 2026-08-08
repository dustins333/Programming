import { useState, useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useOwnReport } from "../../../lib/payroll/useOwnReport";
import { listEntriesForPeriodAllStaff } from "../../../lib/payroll/entries";
import { computeTotalsByStaff, formatMoney } from "../../../lib/payroll/calc";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { PeriodPicker, CategoryBreakdown } from "../../../components/payroll/PayrollReportPieces";

// Mirrors the real Glide all-employee grid (screenshot): Employee | Group |
// Admin | Ops | SPC | SSesh | Programs | Welcome | Other | Custom | Total.
const GRID_COLUMNS = [
  { key: "groupAmount", label: "Group" },
  { key: "adminAmount", label: "Admin" },
  { key: "opsAmount", label: "Ops" },
  { key: "spcAmount", label: "SPC" },
  { key: "strategyAmount", label: "SSesh" },
  { key: "programsAmount", label: "Programs" },
  { key: "welcomeAmount", label: "Welcome" },
  { key: "otherAmount", label: "Other" },
  { key: "customAmount", label: "Custom" },
];

export default function PayrollReportWeb() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const report = useOwnReport(profile?.id);

  const [allStaffTotals, setAllStaffTotals] = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);

  const loadAllStaff = useCallback(async () => {
    if (!isAdmin || !report.selectedPeriod) return;
    setLoadingAll(true);
    try {
      const entries = await listEntriesForPeriodAllStaff(report.selectedPeriod);
      setAllStaffTotals(computeTotalsByStaff(entries, report.rateMaps).sort((a, b) => (a.staffName || "").localeCompare(b.staffName || "")));
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
            <Text className="mb-1 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              All employees
            </Text>
            <Text className="mb-4" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
              Total payroll: {formatMoney(grandTotal)}
            </Text>

            {loadingAll ? (
              <ActivityIndicator color={colors.primary} />
            ) : allStaffTotals.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                Nobody has logged anything for this period yet.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator style={{ borderWidth: 1, borderColor: "#e7e5e4", borderRadius: 12 }}>
                <View>
                  <View className="flex-row border-b border-stone-200 bg-stone-50 px-3 py-2.5">
                    <Text style={{ width: 160, fontFamily: fonts.sansSemiBold, color: "#78716c", fontSize: 12 }}>Employee</Text>
                    {GRID_COLUMNS.map((c) => (
                      <Text key={c.key} style={{ width: 100, fontFamily: fonts.sansSemiBold, color: "#78716c", fontSize: 12 }}>
                        {c.label}
                      </Text>
                    ))}
                    <Text style={{ width: 100, fontFamily: fonts.sansSemiBold, color: "#78716c", fontSize: 12 }}>Total</Text>
                  </View>
                  {allStaffTotals.map((s) => (
                    <View key={s.key} className="flex-row border-b border-stone-100 px-3 py-2.5">
                      <Text style={{ width: 160, fontFamily: fonts.sansMedium, color: "#44403c", fontSize: 13 }} numberOfLines={1}>
                        {s.staffName}
                      </Text>
                      {GRID_COLUMNS.map((c) => (
                        <Text key={c.key} style={{ width: 100, fontFamily: fonts.sans, color: "#57534e", fontSize: 13 }}>
                          {formatMoney(s.totals[c.key] || 0)}
                        </Text>
                      ))}
                      <Text style={{ width: 100, fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
                        {formatMoney(s.totals.total)}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        ) : null}
      </ScrollView>
    </CoachShell>
  );
}
