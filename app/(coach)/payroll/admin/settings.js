import { useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listAllRates, updateCoreRate, updateSpcTier, updateOtherRate, createOtherRate } from "../../../../lib/payroll/rates";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { RateRow } from "../../../../components/payroll/RateRow";
import { NUMERIC_DONE_ID } from "../../../../components/NumericInputAccessory";

// Small pill toggle for the two per-Other-type entry-form field switches
// (Quantity/Notes) — deliberately not a full Switch component, since these
// sit inline in an already-dense row alongside the rate editor and Archive
// link.
function FieldToggle({ label, value, onToggle }) {
  return (
    <Pressable onPress={onToggle} className="flex-row items-center gap-1" hitSlop={6}>
      <Ionicons name={value ? "checkbox" : "square-outline"} size={16} color={value ? colors.primaryOnWhite : "#a8a29e"} />
      <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: value ? "#44403c" : "#a8a29e" }}>
        {label}
      </Text>
    </Pressable>
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

// New-Other-rate form — the first real caller of createOtherRate, which
// existed in lib/payroll/rates.js but was dead code until now.
function AddOtherRateForm({ onAdded }) {
  const [otherType, setOtherType] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const n = Number(rate);
    if (!otherType.trim() || !unit.trim() || !Number.isFinite(n) || n < 0) {
      toastError("A type, unit, and valid rate are all required");
      return;
    }
    setSaving(true);
    try {
      await createOtherRate({ otherType: otherType.trim(), unit: unit.trim(), rate: n });
      toastSuccess(`"${otherType.trim()}" added`);
      setOtherType("");
      setUnit("");
      setRate("");
      await onAdded();
    } catch (err) {
      toastError("Failed to add", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-4 max-w-xl rounded-xl border border-stone-200 p-4">
      <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
        Add a new type
      </Text>
      <View className="mb-2 flex-row gap-2">
        <TextInput
          value={otherType}
          onChangeText={setOtherType}
          placeholder="Type name"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans }}
        />
        <TextInput
          value={unit}
          onChangeText={setUnit}
          placeholder="Unit (e.g. hour)"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans }}
        />
        <TextInput
          value={rate}
          onChangeText={setRate}
          placeholder="Rate"
          keyboardType="decimal-pad"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          className="w-24 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans }}
        />
      </View>
      <Pressable
        onPress={handleAdd}
        disabled={saving}
        className="items-center self-start rounded-lg px-4 py-2"
        style={{ backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }}
      >
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
          {saving ? "Adding…" : "Add type"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function AdminPayrollSettings() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [rates, setRates] = useState({ coreRates: [], otherRates: [], spcTiers: [] });
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      setRates(await listAllRates());
    } catch (err) {
      toastError("Failed to load rates", err);
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

  const activeOther = rates.otherRates.filter((r) => r.active);
  const archivedOther = rates.otherRates.filter((r) => !r.active);

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
        <AdminPayrollTabBar active="settings" />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
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
            <Text className="mb-3 max-w-xl text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Quantity/Notes control which fields show on the entry form for that type — turn either off for a type that
              doesn't need it (e.g. a flat one-time item with no notes).
            </Text>
            <AddOtherRateForm onAdded={load} />
            <View className="mb-2 max-w-xl">
              {activeOther.map((r) => (
                <View key={r.other_type} className="mb-2 rounded-lg border border-stone-200 px-3 py-2.5">
                  <View className="mb-2 flex-row items-center gap-2">
                    <View style={{ flex: 1 }}>
                      <RateRow
                        label={r.other_type}
                        unit={r.unit}
                        value={r.rate}
                        onSave={async (n) => {
                          await updateOtherRate(r.other_type, { rate: n });
                          await load();
                        }}
                      />
                    </View>
                    <Pressable
                      onPress={async () => {
                        await updateOtherRate(r.other_type, { active: false });
                        await load();
                      }}
                    >
                      <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#a8a29e" }}>
                        Archive
                      </Text>
                    </Pressable>
                  </View>
                  <View className="flex-row gap-4">
                    <FieldToggle
                      label="Quantity"
                      value={r.has_qty}
                      onToggle={async () => {
                        await updateOtherRate(r.other_type, { has_qty: !r.has_qty });
                        await load();
                      }}
                    />
                    <FieldToggle
                      label="Notes"
                      value={r.has_notes}
                      onToggle={async () => {
                        await updateOtherRate(r.other_type, { has_notes: !r.has_notes });
                        await load();
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>

            <Pressable onPress={() => setShowArchived((v) => !v)} className="mb-3 self-start">
              <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                {showArchived ? "Hide" : "Show"} archived ({archivedOther.length})
              </Text>
            </Pressable>
            {showArchived ? (
              <View className="max-w-xl">
                {archivedOther.map((r) => (
                  <View key={r.other_type} className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5" style={{ opacity: 0.6 }}>
                    <View>
                      <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>{r.other_type}</Text>
                      <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                        ${Number(r.rate).toFixed(2)} per {r.unit}
                      </Text>
                    </View>
                    <Pressable
                      onPress={async () => {
                        await updateOtherRate(r.other_type, { active: true });
                        await load();
                      }}
                    >
                      <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                        Restore
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
