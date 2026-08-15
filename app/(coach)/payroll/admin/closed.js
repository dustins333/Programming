import { useState, useCallback, useContext, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listPayPeriodOptions, updatePeriodTaxes, listClosedPeriods, listStaff } from "../../../../lib/payroll/periods";
import { getRateMapsForPeriod, listAllRates } from "../../../../lib/payroll/rates";
import { listEntriesForPeriodAllStaff, listEntriesForPeriods } from "../../../../lib/payroll/entries";
import { computeTotalsByStaff, buildRateMaps, formatMoney, formatQuantity } from "../../../../lib/payroll/calc";
import { buildPeriodCsv, downloadCsv } from "../../../../lib/payroll/csvExport";
import { formatDateMDY, formatDateRange } from "../../../../lib/formatDate";
import { dateInBoise } from "../../../../lib/boiseDate";
import {
  REVIEW_COLUMNS,
  COL_WIDTH,
  PAY_WIDTH,
  STAFF_WIDTH,
  CELL_GAP,
  COL_LABEL_STYLE,
} from "../../../../components/payroll/StaffReviewRow";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../../components/NumericInputAccessory";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../../../lib/scrollToKeyboard";

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.045, shadowRadius: 14 };

// The breakdown reuses This period's exact column metrics rather than the
// mock's shorter abbreviations — two admin tables of the same data reading
// differently is worse than either one being a few pixels wider, and it
// means one set of widths to keep in step.
const breakdownWidth = STAFF_WIDTH + REVIEW_COLUMNS.length * COL_WIDTH + PAY_WIDTH + (REVIEW_COLUMNS.length + 1) * CELL_GAP + 40;

function periodLabel(p) {
  return formatDateRange(p.start_date, p.end_date);
}

function FigureLabel({ children, align }) {
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e", marginBottom: 3, textAlign: align }}
    >
      {children}
    </Text>
  );
}

function Figure({ label, value }) {
  return (
    <View>
      <FigureLabel>{label}</FigureLabel>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#2a211c" }}>{value}</Text>
    </View>
  );
}

// One row in the closed-periods list — Owner/Staff/Taxes/Grand Total, a
// Taxes field the admin can fill in (or edit) any time after close, and an
// on-demand expand into that period's full per-staff breakdown, read at
// its own frozen rates (getRateMapsForPeriod) so it can never drift from
// what was actually true when it closed. Moved here from admin/periods.js
// when "This period" and "Closed periods" split into separate tabs.
function ClosedPeriodRow({ period, derived, onTaxesSaved, scrollViewRef, scrollOffsetRef }) {
  const [taxes, setTaxes] = useState(period.taxes_paid != null ? String(period.taxes_paid) : "");
  const [savingTaxes, setSavingTaxes] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [staffTotals, setStaffTotals] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rowRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

  // owner_pay/staff_pay are written by the app's own close flow. Every
  // period closed before that existed — which is all 22 historical ones,
  // closed by the Glide import's SQL rather than through the app — has
  // them null, and reading `Number(null) || 0` rendered that as a
  // confident $0.00 on a period that plainly had entries in it. The
  // figures are recomputed from those entries instead whenever the stored
  // value is missing, so this page can't disagree with the Report tab.
  const ownerPay = period.owner_pay != null ? Number(period.owner_pay) : derived?.ownerPay;
  const staffPay = period.staff_pay != null ? Number(period.staff_pay) : derived?.staffPay;
  const isDerived = period.owner_pay == null || period.staff_pay == null;
  const taxesNum = Number(taxes) || 0;
  const known = ownerPay != null && staffPay != null;
  const grandTotal = known ? ownerPay + staffPay + taxesNum : null;

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
    <View
      ref={rowRef}
      className="mb-3 overflow-hidden rounded-2xl border bg-white"
      style={[{ borderColor: "#ece7e1" }, CARD_SHADOW]}
    >
      {/* A finished period is a receipt, so the row leads with the four
          numbers that make it one — owner, staff, taxes, grand total — and
          the period itself is just the label on it. */}
      <View className="flex-row flex-wrap items-center px-5 py-4" style={{ gap: 24 }}>
        <View style={{ minWidth: 130 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#2a211c" }}>{periodLabel(period)}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e", marginTop: 2 }}>
            Closed {period.closed_at ? formatDateMDY(dateInBoise(new Date(period.closed_at))) : "—"}
          </Text>
        </View>

        <Figure label="OWNER PAY" value={ownerPay != null ? formatMoney(ownerPay) : "—"} />
        <Figure label="STAFF PAY" value={staffPay != null ? formatMoney(staffPay) : "—"} />

        <View>
          <FigureLabel>TAXES</FigureLabel>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <TextInput
              value={taxes}
              onChangeText={setTaxes}
              onFocus={() => scrollFieldIntoView(rowRef.current)}
              placeholder="Add"
              placeholderTextColor="#b5aea7"
              keyboardType="decimal-pad"
              inputAccessoryViewID={NUMERIC_DONE_ID}
              style={{
                fontFamily: fonts.sansSemiBold,
                fontSize: 14,
                color: "#2a211c",
                width: 92,
                borderRadius: 9,
                borderWidth: 1,
                // Dashed while empty so an unfilled figure reads as
                // outstanding rather than as a real zero.
                borderStyle: taxes ? "solid" : "dashed",
                borderColor: taxes ? "#e7e5e4" : "#ddd6cf",
                backgroundColor: taxes ? "#faf8f6" : "white",
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            />
            {taxes !== String(period.taxes_paid ?? "") ? (
              <Pressable onPress={handleSaveTaxes} disabled={savingTaxes} hitSlop={6}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>
                  {savingTaxes ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 120, alignItems: "flex-end" }}>
          <FigureLabel align="right">GRAND TOTAL</FigureLabel>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 19, color: "#2a211c" }}>
            {grandTotal != null ? formatMoney(grandTotal) : "—"}
          </Text>
          {isDerived && known ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: "#a8a29e", marginTop: 2 }}>recalculated from entries</Text>
          ) : null}
        </View>

        {/* Export sits outside the expand Pressable rather than inside it —
            a nested press target fires both handlers on web. */}
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Pressable
            onPress={handleExport}
            disabled={exporting}
            style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 8, paddingHorizontal: 15, opacity: exporting ? 0.6 : 1 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Text>
          </Pressable>
          <Pressable onPress={handleExpand} hitSlop={6} className="flex-row items-center" style={{ gap: 3 }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: colors.primaryOnWhite }}>
              {expanded ? "Hide breakdown" : "Show breakdown"}
            </Text>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={12} color={colors.primaryOnWhite} />
          </Pressable>
        </View>
      </View>

      {expanded ? (
        loadingReport ? (
          <View className="px-5 pb-5">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === "web"}>
            <View style={{ width: breakdownWidth }}>
              <View
                className="flex-row items-center px-5 py-2.5"
                style={{ gap: CELL_GAP, backgroundColor: "#faf8f6", borderTopWidth: 1, borderTopColor: "#ece7e1" }}
              >
                <Text className="uppercase text-stone-400" style={[COL_LABEL_STYLE, { width: STAFF_WIDTH }]}>
                  Staff
                </Text>
                {REVIEW_COLUMNS.map((col) => (
                  <Text key={col.key} className="uppercase text-stone-400" style={[COL_LABEL_STYLE, { width: COL_WIDTH, textAlign: "right" }]} numberOfLines={1}>
                    {col.label}
                  </Text>
                ))}
                <Text className="uppercase text-stone-400" style={[COL_LABEL_STYLE, { width: PAY_WIDTH, textAlign: "right" }]} numberOfLines={1}>
                  Pay · frozen
                </Text>
              </View>

              {(staffTotals || []).map((s) => (
                <View key={s.key} className="flex-row items-center px-5 py-3" style={{ gap: CELL_GAP, borderTopWidth: 1, borderTopColor: "#f4f0ec" }}>
                  <Text numberOfLines={1} style={{ width: STAFF_WIDTH, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }}>
                    {s.staffName}
                  </Text>
                  {REVIEW_COLUMNS.map((col) => {
                    const v = col.value(s.totals);
                    return (
                      <Text
                        key={col.key}
                        style={{
                          width: COL_WIDTH,
                          textAlign: "right",
                          fontFamily: v ? fonts.sansSemiBold : fonts.sans,
                          fontSize: 13,
                          color: v ? "#44403c" : "#c9c4bd",
                        }}
                      >
                        {!v ? "—" : col.money ? formatMoney(v) : formatQuantity(v)}
                      </Text>
                    );
                  })}
                  <Text style={{ width: PAY_WIDTH, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 13, color: "#2a211c" }}>
                    {formatMoney(s.totals.total)}
                  </Text>
                </View>
              ))}

              <View
                className="flex-row items-center px-5 py-3"
                style={{ gap: CELL_GAP, backgroundColor: "#faf8f6", borderTopWidth: 1, borderTopColor: "#ece7e1" }}
              >
                <Text className="text-stone-500" style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 11.5, textAlign: "right" }}>
                  {(staffTotals || []).length} staff · at the rates frozen when this period closed
                </Text>
                <Text style={{ width: PAY_WIDTH, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 14, color: colors.primaryOnWhite }}>
                  {formatMoney((staffTotals || []).reduce((sum, s) => sum + s.totals.total, 0))}
                </Text>
              </View>
            </View>
          </ScrollView>
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
  const [derivedByPeriod, setDerivedByPeriod] = useState(new Map());
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
      const options = await listPayPeriodOptions();
      setPeriodOptions(options);

      // Fill in owner/staff pay for any closed period the app never wrote
      // them for. Two queries for the whole page (all periods' entries in
      // one `in` filter, plus the staff roster for the admin/coach split)
      // rather than a pair per row.
      const needsDerivation = listClosedPeriods(options).filter((p) => p.owner_pay == null || p.staff_pay == null);
      if (needsDerivation.length === 0) {
        setDerivedByPeriod(new Map());
        return;
      }
      const [entriesByPeriod, staffRows, allRates] = await Promise.all([
        listEntriesForPeriods(needsDerivation.map((p) => p.start_date)),
        listStaff(),
        listAllRates(),
      ]);
      // None of these periods has a frozen rate snapshot (they predate the
      // close flow that writes one), so getRateMapsForPeriod would fall
      // back to live rates for every one of them anyway — this just does
      // that once instead of per period.
      const maps = buildRateMaps(allRates);
      const roleByKey = new Map();
      for (const s of staffRows) {
        if (s.id) roleByKey.set(s.id, s.role);
        if (s.email) roleByKey.set(s.email, s.role);
      }
      const next = new Map();
      for (const p of needsDerivation) {
        let ownerPay = 0;
        let staffPay = 0;
        for (const row of computeTotalsByStaff(entriesByPeriod.get(p.start_date) ?? [], maps)) {
          if (roleByKey.get(row.key) === "admin") ownerPay += row.totals.total;
          else staffPay += row.totals.total;
        }
        next.set(p.start_date, { ownerPay, staffPay });
      }
      setDerivedByPeriod(next);
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
            <ClosedPeriodRow key={p.start_date} period={p} derived={derivedByPeriod.get(p.start_date)} onTaxesSaved={load} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
          ))
        )}
      </ScrollView>
    </CoachShell>
  );
}
