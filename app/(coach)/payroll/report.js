import { useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
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
// View has its own dedicated Report tab (admin/report.js) so an admin's
// personal pay never mixes with the staff-wide report on the same page,
// per explicit ask.
export default function PayrollReport() {
  const { profile } = useAuth();
  const router = useRouter();
  const report = useOwnReport(profile);

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

  return (
    <CoachShell>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 32 }}>
          {Platform.OS !== "web" ? (
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll/entries"))} className="mb-4 self-start">
              <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
            </Pressable>
          ) : null}
          <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            Payroll
          </Text>
          <PayrollTabBar active="report" />

          <View className="mx-auto w-full" style={{ maxWidth: 460 }}>
            {report.periodOptions.length > 0 && report.selectedPeriod ? (
              <PayPeriodBand
                options={report.periodOptions}
                selected={report.selectedPeriod}
                onChange={report.changePeriod}
                total={report.totals.total}
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
                <CategoryBreakdown totals={report.totals} entries={report.entries} rateMaps={report.rateMaps} />
                {locked ? (
                  <Text className="mt-4 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    {closed ? "This pay period is closed." : "You've finalized this period — an admin can send it back if something needs changing."}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Docked, because finalizing is the reason this screen exists at the
            end of a period and it shouldn't be something you have to scroll
            a breakdown to reach. */}
        {!report.loading && !report.loadError && !locked ? (
          <View style={{ borderTopWidth: 1, borderTopColor: "#ece7e1", backgroundColor: "white", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}>
            <View className="mx-auto w-full" style={{ maxWidth: 460 }}>
              <Pressable
                onPress={() => setFinalizeOpen(true)}
                disabled={report.entries.length === 0}
                className="items-center"
                style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, opacity: report.entries.length === 0 ? 0.45 : 1 }}
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
                  {report.entries.length === 0 ? "Nothing to finalize yet" : "Finalize this period"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

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
