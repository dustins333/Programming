import { useState, useCallback, useContext, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listPayPeriodOptions, updatePeriodTaxes, listClosedPeriods } from "../../../../lib/payroll/periods";
import { getRateMapsForPeriod } from "../../../../lib/payroll/rates";
import { listEntriesForPeriodAllStaff } from "../../../../lib/payroll/entries";
import { computeTotalsByStaff, formatMoney } from "../../../../lib/payroll/calc";
import { buildPeriodCsv, downloadCsv } from "../../../../lib/payroll/csvExport";
import { formatDateMD } from "../../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../../components/NumericInputAccessory";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../../../lib/scrollToKeyboard";

function periodLabel(p) {
  return `${formatDateMD(p.start_date)} – ${formatDateMD(p.end_date)}`;
}

// One row in the closed-periods list — Owner/Staff/Taxes/Grand Total, a
// Taxes field the admin can fill in (or edit) any time after close, and an
// on-demand expand into that period's full per-staff breakdown, read at
// its own frozen rates (getRateMapsForPeriod) so it can never drift from
// what was actually true when it closed. Moved here from admin/periods.js
// when "This period" and "Closed periods" split into separate tabs.
function ClosedPeriodRow({ period, onTaxesSaved, scrollViewRef, scrollOffsetRef }) {
  const [taxes, setTaxes] = useState(period.taxes_paid != null ? String(period.taxes_paid) : "");
  const [savingTaxes, setSavingTaxes] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [staffTotals, setStaffTotals] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rowRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

  const ownerPay = Number(period.owner_pay) || 0;
  const staffPay = Number(period.staff_pay) || 0;
  const taxesNum = Number(taxes) || 0;
  const grandTotal = ownerPay + staffPay + taxesNum;

  const handleSaveTaxes = async () => {
    const n = Number(taxes);
    if (taxes !== "" && (!Number.isFinite(n) || n < 0)) {
      toastError("Enter a valid taxes amount");
      return;
    }
    setSavingTaxes(true);
    try {
      await updatePeriodTaxes(period.start_date, taxes === "" ? null : n);
      toastSuccess("Taxes saved");
      onTaxesSaved?.();
    } catch (err) {
      toastError("Failed to save taxes", err);
    } finally {
      setSavingTaxes(false);
    }
  };

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !staffTotals) {
      setLoadingReport(true);
      try {
        const [entries, rateMaps] = await Promise.all([listEntriesForPeriodAllStaff(period.start_date), getRateMapsForPeriod(period)]);
        setStaffTotals(computeTotalsByStaff(entries, rateMaps).sort((a, b) => b.totals.total - a.totals.total));
      } catch (err) {
        toastError("Failed to load report", err);
      } finally {
        setLoadingReport(false);
      }
    }
  };

  // A closed period's CSV is downloadable again any time, not just in the
  // moment it closed — the close flow's own auto-download is easy to miss
  // (or land in the wrong browser), and re-deriving it here at that
  // period's frozen rates gives byte-identical output.
  const handleExport = async () => {
    setExporting(true);
    try {
      const [entries, rateMaps] = await Promise.all([listEntriesForPeriodAllStaff(period.start_date), getRateMapsForPeriod(period)]);
      const ok = downloadCsv(`payroll-${period.start_date}.csv`, buildPeriodCsv(entries, rateMaps));
      if (!ok) toastError("CSV export is web-only — open this page in a browser");
    } catch (err) {
      toastError("Failed to export", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View ref={rowRef} className="mb-3 max-w-3xl rounded-xl border border-stone-200 bg-white p-4">
      {/* Export sits outside the expand Pressable rather than inside it —
          a nested press target would fire both handlers on web. */}
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable onPress={handleExpand} className="flex-1 flex-row items-center gap-2">
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{periodLabel(period)}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#a8a29e" />
        </Pressable>
        <Pressable onPress={handleExport} disabled={exporting} hitSlop={6}>
          <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
            {exporting ? "Exporting…" : "Export CSV"}
          </Text>
        </Pressable>
      </View>
      <View className="mb-3 flex-row flex-wrap" style={{ gap: 16 }}>
        <View>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
            Owner Pay
          </Text>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{formatMoney(ownerPay)}</Text>
        </View>
        <View>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
            Staff Pay
          </Text>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{formatMoney(staffPay)}</Text>
        </View>
        <View>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
            Taxes Paid
          </Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={taxes}
              onChangeText={setTaxes}
              onFocus={() => scrollFieldIntoView(rowRef.current)}
              placeholder="0.00"
              keyboardType="decimal-pad"
              inputAccessoryViewID={NUMERIC_DONE_ID}
              className="rounded-lg border border-stone-300 px-2 py-1"
              style={{ fontFamily: fonts.sans, width: 80 }}
            />
            <Pressable onPress={handleSaveTaxes} disabled={savingTaxes}>
              <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                {savingTaxes ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
        <View>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
            Grand Total
          </Text>
          <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>{formatMoney(grandTotal)}</Text>
        </View>
      </View>

      {expanded ? (
        loadingReport ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View className="border-t border-stone-100 pt-3">
            {(staffTotals || []).map((s) => (
              <View key={s.key} className="mb-1.5 flex-row items-center justify-between">
                <Text style={{ fontFamily: fonts.sansMedium, color: "#57534e", fontSize: 13 }}>{s.staffName}</Text>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 13 }}>{formatMoney(s.totals.total)}</Text>
              </View>
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

export default function AdminPayrollClosedPeriods() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [periodOptions, setPeriodOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setPeriodOptions(await listPayPeriodOptions());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && !isAdmin) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const closedPeriods = listClosedPeriods(periodOptions);

  return (
    <CoachShell>
      <ScrollView
        ref={scrollViewRef}
        style={{ backgroundColor: colors.canvas }}
        className="flex-1 px-8 pt-8"
        contentContainerStyle={{ paddingBottom: 40 + keyboardPadding }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll — Admin
        </Text>
        <AdminPayrollTabBar active="closed" />

        {loadError ? (
          <>
            <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load closed periods: {loadError}
            </Text>
            <Pressable onPress={load} className="mt-3 self-start">
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </Pressable>
          </>
        ) : loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : closedPeriods.length === 0 ? (
          <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            No closed periods yet. A period shows up here once you close it from This period.
          </Text>
        ) : (
          closedPeriods.map((p) => (
            <ClosedPeriodRow key={p.start_date} period={p} onTaxesSaved={load} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
          ))
        )}
      </ScrollView>
    </CoachShell>
  );
}
