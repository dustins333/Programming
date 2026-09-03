import { useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useOwnReport } from "../../../lib/payroll/useOwnReport";
import { computePeriodEnd, isPeriodClosed } from "../../../lib/payroll/periods";
import { getOwnFinalization, isLocked as isFinalizationLocked } from "../../../lib/payroll/finalizations";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { PayPeriodBand, CategoryBreakdown } from "../../../components/payroll/PayrollReportPieces";
import { todayInBoise } from "../../../lib/boiseDate";
import { FinalizeModal } from "../../../components/payroll/FinalizeModal";

// Own-pay report only — no admin all-employee section here anymore. Admin
// View has its own dedicated Report tab (admin/report.web.js) so an
// admin's personal pay never mixes with the staff-wide report on the same
// page, per explicit ask.
export default function PayrollReportWeb() {
  const { profile } = useAuth();
  // ?period= comes from the deadline-reminder push and from the finalize
  // banner on the Log tab / dashboard — both point at the period that's
  // actually owed, which by then is usually not the current one.
  const params = useLocalSearchParams();
  const report = useOwnReport(profile, typeof params.period === "string" ? params.period : null);

  const [finalization, setFinalization] = useState(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  // useFocusEffect, not a plain useEffect — useOwnReport restores the same
  // selectedPeriod on refocus, so an effect keyed on it alone never re-runs
  // on a return visit and the lock state would sit stale (e.g. after an
  // admin reopens a finalization) even though the totals beside it refresh.
  useFocusEffect(
    useCallback(() => {
      if (!profile?.id || !report.selectedPeriod) return;
      let cancelled = false;
      getOwnFinalization(profile.id, report.selectedPeriod).then((f) => {
        if (!cancelled) setFinalization(f);
      });
      return () => {
        cancelled = true;
      };
    }, [profile?.id, report.selectedPeriod])
  );

  const currentPeriodRow = report.periodOptions.find((p) => p.start_date === report.selectedPeriod);
  const closed = isPeriodClosed(currentPeriodRow);
  const locked = isFinalizationLocked(finalization) || closed;
  // Suppressed once the period is locked: after finalizing these are real
  // rows already (so the preview is empty anyway), and on a period that
  // closed without being finalized there is no finalize step left to
  // promise. Only ever shown while the coach can still act on it.
  const pendingNutrition = !locked ? report.pendingNutrition : null;
  // A coach whose only pay this period is 1:1 Nutrition billing has no
  // pay_entries rows of their own yet — those are written by the finalize
  // step itself. Gating purely on entries.length locked them out of the one
  // action that would create them.
  const hasSomethingToFinalize = report.entries.length > 0 || (pendingNutrition?.count || 0) > 0;

  return (
    <CoachShell>
      <ScrollView style={{ backgroundColor: colors.canvas }} className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll
        </Text>
        <PayrollTabBar active="report" />

        <View style={{ maxWidth: 460 }}>
          {report.periodOptions.length > 0 && report.selectedPeriod ? (
            <PayPeriodBand
              options={report.periodOptions}
              selected={report.selectedPeriod}
              onChange={report.changePeriod}
              total={report.totals.total + (pendingNutrition?.amount || 0)}
              today={todayInBoise()}
            />
          ) : null}

          {report.loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : report.loadError ? (
            <View className="mt-4">
              <Text className="mb-3 text-red-600" style={{ fontFamily: fonts.sans }}>
                Couldn't load your pay for this period. {report.loadError}
              </Text>
              <Pressable onPress={report.retry} className="self-start">
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View className="mt-3">
              <CategoryBreakdown totals={report.totals} entries={report.entries} rateMaps={report.rateMaps} pending={pendingNutrition} />
              {!locked ? (
                <Pressable
                  onPress={() => setFinalizeOpen(true)}
                  disabled={!hasSomethingToFinalize}
                  className="mt-4 items-center"
                  style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, opacity: !hasSomethingToFinalize ? 0.45 : 1 }}
                >
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
                    {!hasSomethingToFinalize ? "Nothing to finalize yet" : "Finalize this period"}
                  </Text>
                </Pressable>
              ) : (
                <Text className="mt-4 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {closed ? "This pay period is closed." : "You've finalized this period — an admin can send it back if something needs changing."}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <FinalizeModal
        visible={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        onFinalized={async () => {
          const f = await getOwnFinalization(profile.id, report.selectedPeriod);
          setFinalization(f);
          await report.changePeriod(report.selectedPeriod);
        }}
        profile={profile}
        periodStart={report.selectedPeriod}
        periodEnd={report.selectedPeriod ? computePeriodEnd(report.selectedPeriod) : null}
        entries={report.entries}
        rateMaps={report.rateMaps}
      />
    </CoachShell>
  );
}
