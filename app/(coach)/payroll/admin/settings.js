import { useState, useCallback, useContext, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listAllRates, updateCoreRate, updateSpcTier, updateOtherRate, createOtherRate } from "../../../../lib/payroll/rates";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { confirmArchiveOtherRate } from "../../../../lib/confirmDialog";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { RateRow } from "../../../../components/payroll/RateRow";
import { DeadlineReminderCard } from "../../../../components/payroll/DeadlineReminderCard";
import { NUMERIC_DONE_ID } from "../../../../components/NumericInputAccessory";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../../../lib/scrollToKeyboard";

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
// existed in lib/payroll/rates.js but was dead code until now. This card
// sits mid-page (below the Rates and SPC Tiers sections) on a fairly long
// admin screen, so its 3 fields are a real risk of ending up behind the
// keyboard — scrollFieldIntoView targets the whole card (cardRef), same
// whole-unit-not-just-field approach ExerciseCard.js uses, since all 3
// fields sit close enough together that scrolling the card into view
// reveals whichever one is focused.
function AddOtherRateForm({ onAdded, scrollViewRef, scrollOffsetRef }) {
  const [otherType, setOtherType] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const cardRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

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
    <View ref={cardRef} className="mb-4 max-w-xl rounded-xl border border-stone-200 p-4">
      <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
        Add a new type
      </Text>
      <View className="mb-2 flex-row gap-2">
        <TextInput
          value={otherType}
          onChangeText={setOtherType}
          onFocus={() => scrollFieldIntoView(cardRef.current)}
          placeholder="Type name"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans }}
        />
        <TextInput
          value={unit}
          onChangeText={setUnit}
          onFocus={() => scrollFieldIntoView(cardRef.current)}
          placeholder="Unit (e.g. hour)"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans }}
        />
        <TextInput
          value={rate}
          onChangeText={setRate}
          onFocus={() => scrollFieldIntoView(cardRef.current)}
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

  // This page runs Rates → SPC Tiers → Other (new-type form + list) — by
  // the time a coach reaches the Add-a-new-type fields there's often not
  // enough scrollable room below to bring a lower field above the keyboard,
  // same class of bug lib/scrollToKeyboard.js's own comment describes.
  // tabBarHeight is subtracted since this route is a Tabs.Screen under
  // (coach)'s navigator (href:null hides it from the tab bar row, not the
  // bar itself).
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  // Every rate mutation on this page goes through here. They were all bare
  // `await x(); await load();` — a write blocked by RLS became an unhandled
  // rejection, the toggle silently snapped back on the next reload, and
  // nothing on screen said why.
  const load = useCallback(async () => {
    try {
      setRates(await listAllRates());
    } catch (err) {
      toastError("Failed to load rates", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveRate = useCallback(
    async (write) => {
      try {
        await write();
        await load();
      } catch (err) {
        toastError("Failed to save", err);
      }
    },
    [load]
  );

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
        <AdminPayrollTabBar active="settings" />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {/* First rather than below the rate tables: it's short, and the
                Other section below it ends in a long archived list that
                would bury it. */}
            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Reminders
            </Text>
            <DeadlineReminderCard />

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
                  onSave={(n) => saveRate(() => updateCoreRate(r.work_type, n))}
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
                  onSave={(n) => saveRate(() => updateSpcTier(t.attendees, n))}
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
            <AddOtherRateForm onAdded={load} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
            <View className="mb-2 max-w-xl">
              {activeOther.map((r) => (
                <View key={r.other_type} className="mb-2 rounded-lg border border-stone-200 px-3 py-2.5">
                  <View className="mb-2 flex-row items-center gap-2">
                    <View style={{ flex: 1 }}>
                      <RateRow
                        label={r.other_type}
                        unit={r.unit}
                        value={r.rate}
                        onSave={(n) => saveRate(() => updateOtherRate(r.other_type, { rate: n }))}
                      />
                    </View>
                    <Pressable
                      onPress={async () => {
                        if (!(await confirmArchiveOtherRate(r.other_type))) return;
                        await saveRate(() => updateOtherRate(r.other_type, { active: false }));
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
                      onToggle={() => saveRate(() => updateOtherRate(r.other_type, { has_qty: !r.has_qty }))}
                    />
                    <FieldToggle
                      label="Notes"
                      value={r.has_notes}
                      onToggle={() => saveRate(() => updateOtherRate(r.other_type, { has_notes: !r.has_notes }))}
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
                    <Pressable onPress={() => saveRate(() => updateOtherRate(r.other_type, { active: true }))}>
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
