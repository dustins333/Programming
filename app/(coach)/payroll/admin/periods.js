import { useState, useCallback, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import {
  listPayPeriodOptions,
  getCurrentPeriodStart,
  listStaff,
  closePayPeriod,
  isPeriodClosed,
  savePeriodClosingSnapshot,
  updatePeriodTaxes,
  listClosedPeriods,
} from "../../../../lib/payroll/periods";
import { listAllRates, saveRateSnapshotForPeriod, getRateMapsForPeriod } from "../../../../lib/payroll/rates";
import { listFinalizationsForPeriod, reopenFinalization, isLocked } from "../../../../lib/payroll/finalizations";
import { listPendingRequestsForPeriod } from "../../../../lib/payroll/requests";
import { listEntriesForPeriodAllStaff } from "../../../../lib/payroll/entries";
import { buildRateMaps, computeTotalsByStaff, formatMoney } from "../../../../lib/payroll/calc";
import { buildPeriodCsv, downloadCsv } from "../../../../lib/payroll/csvExport";
import { formatDateMD } from "../../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { confirmClosePayPeriod } from "../../../../lib/confirmDialog";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../../components/NumericInputAccessory";

function periodLabel(p) {
  return `${formatDateMD(p.start_date)} – ${formatDateMD(p.end_date)}`;
}

// One row in the closed-periods list — Owner/Staff/Taxes/Grand Total, a
// Taxes field the admin can fill in (or edit) any time after close, and an
// on-demand expand into that period's full per-staff breakdown, read at
// its own frozen rates (getRateMapsForPeriod) so it can never drift from
// what was actually true when it closed.
function ClosedPeriodRow({ period, onTaxesSaved }) {
  const [taxes, setTaxes] = useState(period.taxes_paid != null ? String(period.taxes_paid) : "");
  const [savingTaxes, setSavingTaxes] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [staffTotals, setStaffTotals] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

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

  return (
    <View className="mb-3 max-w-2xl rounded-xl border border-stone-200 p-4">
      <Pressable onPress={handleExpand} className="mb-3 flex-row items-center justify-between">
        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{periodLabel(period)}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#a8a29e" />
      </Pressable>
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

export default function AdminPayrollPeriods() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [staff, setStaff] = useState([]);
  const [finalizations, setFinalizations] = useState([]);
  const [rates, setRates] = useState({ coreRates: [], otherRates: [], spcTiers: [] });
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  const selectedPeriodRef = useRef(null);
  const applySelectedPeriod = useCallback((value) => {
    selectedPeriodRef.current = value;
    setSelectedPeriod(value);
  }, []);

  const load = useCallback(async () => {
    try {
      const [options, current, staffRows, allRates] = await Promise.all([listPayPeriodOptions(), getCurrentPeriodStart(), listStaff(), listAllRates()]);
      setPeriodOptions(options);
      setStaff(staffRows);
      setRates(allRates);
      const target = selectedPeriodRef.current || current;
      applySelectedPeriod(target);
      const finals = await listFinalizationsForPeriod(target);
      setFinalizations(finals);
    } catch (err) {
      toastError("Failed to load", err);
    } finally {
      setLoading(false);
    }
  }, [applySelectedPeriod]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && !isAdmin) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const currentPeriod = periodOptions.find((p) => p.start_date === selectedPeriod);
  const closed = isPeriodClosed(currentPeriod);
  const finalizationByUser = new Map(finalizations.map((f) => [f.user_id, f]));
  const finalizedCount = staff.filter((s) => isLocked(finalizationByUser.get(s.id))).length;
  const notFinalized = staff.filter((s) => !isLocked(finalizationByUser.get(s.id)));
  const closedPeriods = listClosedPeriods(periodOptions);

  const handleReopen = async (finalization) => {
    try {
      await reopenFinalization(finalization.id, profile.id);
      toastSuccess("Reopened");
      const finals = await listFinalizationsForPeriod(selectedPeriod);
      setFinalizations(finals);
    } catch (err) {
      toastError("Failed to reopen", err);
    }
  };

  const handleClose = async () => {
    // Hard block, not a warning — a pay period can't close at all while a
    // custom request for it is still undecided.
    const pending = await listPendingRequestsForPeriod(selectedPeriod);
    if (pending.length > 0) {
      toastError(
        `Can't close — ${pending.length} pending custom request${pending.length === 1 ? "" : "s"} for this period (${pending
          .map((r) => r.staff_name)
          .join(", ")}). Approve or deny them first.`
      );
      return;
    }

    const warning =
      notFinalized.length > 0
        ? `${notFinalized.length} coach${notFinalized.length === 1 ? " hasn't" : "es haven't"} finalized yet: ${notFinalized.map((s) => s.name).join(", ")}.`
        : null;
    const label = currentPeriod ? periodLabel(currentPeriod) : selectedPeriod;
    const ok = await confirmClosePayPeriod(label, warning);
    if (!ok) return;

    setClosing(true);
    try {
      await closePayPeriod(selectedPeriod, profile.id);
      await saveRateSnapshotForPeriod(selectedPeriod, rates);

      const entries = await listEntriesForPeriodAllStaff(selectedPeriod);
      const rateMaps = buildRateMaps(rates);
      const byStaff = computeTotalsByStaff(entries, rateMaps);
      const staffById = new Map(staff.map((s) => [s.id, s]));
      let ownerPay = 0;
      let staffPay = 0;
      for (const row of byStaff) {
        const isOwner = staffById.get(row.userId)?.role === "admin";
        if (isOwner) ownerPay += row.totals.total;
        else staffPay += row.totals.total;
      }
      await savePeriodClosingSnapshot(selectedPeriod, { ownerPay, staffPay });

      const csv = buildPeriodCsv(entries, rateMaps);
      const downloaded = downloadCsv(`payroll-${selectedPeriod}.csv`, csv);
      if (!downloaded) toastSuccess("Pay period closed — open this page on web to export the CSV");
      else toastSuccess("Pay period closed — CSV downloaded");

      await load();
    } catch (err) {
      toastError("Failed to close", err);
    } finally {
      setClosing(false);
    }
  };

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
        <AdminPayrollTabBar active="periods" />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View className="mb-8 max-w-xl">
              <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
                {currentPeriod ? periodLabel(currentPeriod) : selectedPeriod}
              </Text>
              <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
                Finalize status — {finalizedCount}/{staff.length}
              </Text>
              {staff.map((s) => {
                const finalization = finalizationByUser.get(s.id);
                const locked = isLocked(finalization);
                return (
                  <View key={s.id} className="mb-2 flex-row items-center justify-between rounded-xl border border-stone-200 p-3">
                    <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>{s.name}</Text>
                    {locked ? (
                      <View className="flex-row items-center gap-3">
                        <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#4d6142" }}>
                          Finalized
                        </Text>
                        {!closed ? (
                          <Pressable onPress={() => handleReopen(finalization)}>
                            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                              Reopen
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : (
                      <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                        Not yet
                      </Text>
                    )}
                  </View>
                );
              })}

              {!closed ? (
                <Pressable
                  onPress={handleClose}
                  disabled={closing}
                  className="mt-4 items-center rounded-lg px-5 py-3"
                  style={{ backgroundColor: "#b23a22", opacity: closing ? 0.6 : 1 }}
                >
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                    {closing ? "Closing…" : "Close pay period"}
                  </Text>
                </Pressable>
              ) : (
                <Text className="mt-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                  This period is closed — nobody can edit it anymore.
                </Text>
              )}
            </View>

            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Closed periods
            </Text>
            {closedPeriods.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                No closed periods yet.
              </Text>
            ) : (
              closedPeriods.map((p) => <ClosedPeriodRow key={p.start_date} period={p} onTaxesSaved={load} />)
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
