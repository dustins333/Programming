import { useState, useCallback, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listPayPeriodOptions, getCurrentPeriodStart, listStaff, closePayPeriod, isPeriodClosed } from "../../../lib/payroll/periods";
import { listAllRates, updateCoreRate, updateOtherRate, updateSpcTier } from "../../../lib/payroll/rates";
import { listFinalizationsForPeriod, reopenFinalization, isLocked } from "../../../lib/payroll/finalizations";
import { formatDateMD } from "../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../lib/toast";
import { confirmClosePayPeriod } from "../../../lib/confirmDialog";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { PeriodPicker } from "../../../components/payroll/PayrollReportPieces";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";

function RateRow({ label, unit, value, onSave }) {
  const [editing, setEditing] = useState(null);
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
      <View>
        <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>{label}</Text>
        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          per {unit}
        </Text>
      </View>
      {editing !== null ? (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={editing}
            onChangeText={setEditing}
            keyboardType="decimal-pad"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            className="rounded-lg border border-stone-300 px-2 py-1.5"
            style={{ fontFamily: fonts.sans, width: 70 }}
          />
          <Pressable
            onPress={async () => {
              const n = Number(editing);
              if (!Number.isFinite(n) || n < 0) {
                toastError("Enter a valid rate");
                return;
              }
              await onSave(n);
              setEditing(null);
            }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setEditing(String(value))}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>${Number(value).toFixed(2)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const CORE_LABELS = {
  group_session: "Group session",
  program_written: "Program written",
  admin_hours: "Admin hours",
  welcome_session: "Welcome session",
  strategy_session: "Strategy session",
  ops_hours: "Ops hours",
};

export default function PayrollPeriods() {
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

  // load() is only ever recreated when nothing meaningful changes (no
  // deps), so it must never read `selectedPeriod` from its own closure —
  // that value would be frozen at whatever it was on the render that first
  // created the callback, silently resetting the picker back to the
  // current period on every refocus instead of keeping whatever period the
  // admin had picked. A ref always reflects the true latest selection.
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

  const changePeriod = async (periodStart) => {
    applySelectedPeriod(periodStart);
    setLoading(true);
    try {
      const finals = await listFinalizationsForPeriod(periodStart);
      setFinalizations(finals);
    } catch (err) {
      toastError("Failed to load finalize status", err);
    } finally {
      setLoading(false);
    }
  };

  if (profile && !isAdmin) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const currentPeriod = periodOptions.find((p) => p.start_date === selectedPeriod);
  const closed = isPeriodClosed(currentPeriod);
  const finalizationByUser = new Map(finalizations.map((f) => [f.user_id, f]));
  const finalizedCount = staff.filter((s) => isLocked(finalizationByUser.get(s.id))).length;
  const notFinalized = staff.filter((s) => !isLocked(finalizationByUser.get(s.id)));

  const handleReopen = async (finalization) => {
    try {
      await reopenFinalization(finalization.id, profile.id);
      toastSuccess("Reopened");
      await changePeriod(selectedPeriod);
    } catch (err) {
      toastError("Failed to reopen", err);
    }
  };

  const handleClose = async () => {
    const warning = notFinalized.length > 0 ? `${notFinalized.length} coach${notFinalized.length === 1 ? " hasn't" : "es haven't"} finalized yet: ${notFinalized.map((s) => s.name).join(", ")}.` : null;
    const label = currentPeriod ? `${formatDateMD(currentPeriod.start_date)} – ${formatDateMD(currentPeriod.end_date)}` : selectedPeriod;
    const ok = await confirmClosePayPeriod(label, warning);
    if (!ok) return;
    setClosing(true);
    try {
      await closePayPeriod(selectedPeriod, profile.id);
      toastSuccess("Pay period closed");
      await load();
    } catch (err) {
      toastError("Failed to close", err);
    } finally {
      setClosing(false);
    }
  };

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
        <PayrollTabBar active="periods" profile={profile} />

        {periodOptions.length > 0 && selectedPeriod ? (
          <PeriodPicker options={periodOptions} selected={selectedPeriod} onChange={changePeriod} />
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View className="mb-8 max-w-xl">
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
              Rates
            </Text>
            <View className="mb-6 max-w-xl">
              {rates.coreRates.map((r) => (
                <RateRow
                  key={r.work_type}
                  label={CORE_LABELS[r.work_type] || r.work_type}
                  unit={r.unit}
                  value={r.rate}
                  onSave={async (n) => {
                    await updateCoreRate(r.work_type, n);
                    await load();
                  }}
                />
              ))}
            </View>
            <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: "#78716c" }}>
              SPC (per session, by attendee count)
            </Text>
            <View className="mb-6 max-w-xl">
              {rates.spcTiers.map((t) => (
                <RateRow
                  key={t.attendees}
                  label={`${t.attendees} attendee${t.attendees === 1 ? "" : "s"}`}
                  unit="session"
                  value={t.rate_per_session}
                  onSave={async (n) => {
                    await updateSpcTier(t.attendees, n);
                    await load();
                  }}
                />
              ))}
            </View>
            <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: "#78716c" }}>
              Other
            </Text>
            <View className="mb-6 max-w-xl">
              {rates.otherRates.map((r) => (
                <RateRow
                  key={r.other_type}
                  label={r.other_type}
                  unit={r.unit}
                  value={r.rate}
                  onSave={async (n) => {
                    await updateOtherRate(r.other_type, { rate: n });
                    await load();
                  }}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
