import { useState, useCallback, useRef } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Redirect, useFocusEffect } from "expo-router";
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

// Mirrors the real Glide all-employee grid, same columns as the old
// coach-Report-tab admin section.
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

export default function AdminPayrollReportWeb() {
  const { profile } = useAuth();
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

  const allStaffTotals = rateMaps ? computeTotalsByStaff(entries, rateMaps).sort((a, b) => (a.staffName || "").localeCompare(b.staffName || "")) : [];
  const grandTotal = allStaffTotals.reduce((sum, s) => sum + s.totals.total, 0);
  const openStaff = allStaffTotals.find((s) => s.key === openStaffKey);
  const openStaffEntries = openStaff ? entries.filter((e) => (e.user_id || e.staff_email) === openStaff.key) : [];

  return (
    <CoachShell>
      <ScrollView style={{ backgroundColor: colors.canvas }} className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
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
            <Text className="mb-4" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
              Total payroll: {formatMoney(grandTotal)}
            </Text>
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
                  <Pressable key={s.key} onPress={() => setOpenStaffKey(s.key)} className="flex-row border-b border-stone-100 px-3 py-2.5" style={{ backgroundColor: "white" }}>
                    <Text style={{ width: 160, fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }} numberOfLines={1}>
                      {s.staffName}
                    </Text>
                    {GRID_COLUMNS.map((c) => (
                      <Text key={c.key} style={{ width: 100, fontFamily: fonts.sans, color: "#57534e", fontSize: 13 }}>
                        {formatMoney(s.totals[c.key] || 0)}
                      </Text>
                    ))}
                    <Text style={{ width: 100, fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>{formatMoney(s.totals.total)}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </ScrollView>

      <PayrollBottomSheet visible={Boolean(openStaffKey)} onClose={() => setOpenStaffKey(null)} title={openStaff?.staffName || ""}>
        {openStaff ? <CategoryBreakdown totals={computeTotals(openStaffEntries, rateMaps)} entries={openStaffEntries} rateMaps={rateMaps} /> : null}
      </PayrollBottomSheet>
    </CoachShell>
  );
}
