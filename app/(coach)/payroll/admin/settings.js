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

// One column of the rates grid. `flexBasis` with a `minWidth` is what makes
// three columns collapse to two and then one as the window narrows, rather
// than three columns squeezing until the rate fields are unusable.
function RateCard({ title, subtitle, action, children }) {
  return (
    <View
      className="rounded-2xl border bg-white p-5"
      style={{ flexGrow: 1, flexBasis: 300, minWidth: 280, maxWidth: 420, borderColor: "#ece7e1" }}
    >
      <View className="flex-row items-start justify-between" style={{ gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c" }}>{title}</Text>
          <Text className="mb-3.5" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }}>
            {subtitle}
          </Text>
        </View>
        {action}
      </View>
      {children}
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

  // Stacked, not three inputs abreast: this lives inside a ~300px column
  // now, where a row of three would leave each field too narrow to read
  // what you'd typed.
  return (
    <View ref={cardRef} className="mb-3 rounded-xl border p-3.5" style={{ borderColor: "#f0ddd2", backgroundColor: "#fdf6f2" }}>
      <TextInput
        value={otherType}
        onChangeText={setOtherType}
        onFocus={() => scrollFieldIntoView(cardRef.current)}
        placeholder="Type name"
        className="mb-2 rounded-lg border bg-white px-3 py-2"
        style={{ fontFamily: fonts.sans, borderColor: "#e7ddd5" }}
      />
      <View className="mb-2.5 flex-row" style={{ gap: 8 }}>
        <TextInput
          value={unit}
          onChangeText={setUnit}
          onFocus={() => scrollFieldIntoView(cardRef.current)}
          placeholder="Unit (e.g. hour)"
          className="flex-1 rounded-lg border bg-white px-3 py-2"
          style={{ fontFamily: fonts.sans, borderColor: "#e7ddd5" }}
        />
        <TextInput
          value={rate}
          onChangeText={setRate}
          onFocus={() => scrollFieldIntoView(cardRef.current)}
          placeholder="Rate"
          keyboardType="decimal-pad"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          className="rounded-lg border bg-white px-3 py-2"
          style={{ fontFamily: fonts.sans, borderColor: "#e7ddd5", width: 84 }}
        />
      </View>
      <Pressable
        onPress={handleAdd}
        disabled={saving}
        className="items-center rounded-lg px-4 py-2.5"
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
  const [addingOther, setAddingOther] = useState(false);

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
            {/* Three columns rather than one long scroll: this page is only
                ever touched at a desk, and the three groups are independent
                — nobody reads them in sequence, they come here to change one
                number. Wraps to a single column below the breakpoint. */}
            <View className="flex-row flex-wrap items-start" style={{ gap: 14 }}>
              <RateCard title="Core rates" subtitle="What each logged item pays">
                {rates.coreRates.map((r) => (
                  <RateRow
                    key={r.work_type}
                    label={CORE_LABELS[r.work_type] || r.work_type}
                    unit={r.unit}
                    value={r.rate}
                    onSave={(n) => saveRate(() => updateCoreRate(r.work_type, n))}
                  />
                ))}
              </RateCard>

              <RateCard title="SPC tiers" subtitle="Paid by head count per session">
                {rates.spcTiers.map((t) => (
                  <RateRow
                    key={t.attendees}
                    label={`${t.attendees} attendee${t.attendees === 1 ? "" : "s"}`}
                    unit="session"
                    value={t.rate_per_session}
                    onSave={(n) => saveRate(() => updateSpcTier(t.attendees, n))}
                  />
                ))}
              </RateCard>

              <RateCard
                title="Other types"
                subtitle={`${activeOther.length} active · which fields each one collects`}
                action={
                  <Pressable onPress={() => setAddingOther((v) => !v)} hitSlop={6}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                      {addingOther ? "Cancel" : "+ Add"}
                    </Text>
                  </Pressable>
                }
              >
                {/* Behind a toggle rather than permanently open — adding a
                    type is rare next to editing one, and the form sitting
                    open pushed the actual list below the fold. */}
                {addingOther ? (
                  <AddOtherRateForm
                    onAdded={async () => {
                      await load();
                      setAddingOther(false);
                    }}
                    scrollViewRef={scrollViewRef}
                    scrollOffsetRef={scrollOffsetRef}
                  />
                ) : null}
                {activeOther.map((r) => (
                  <View key={r.other_type} className="mb-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "#ece7e1" }}>
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
                        hitSlop={6}
                      >
                        <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#a8a29e" }}>
                          Archive
                        </Text>
                      </Pressable>
                    </View>
                    <View className="flex-row gap-4">
                      <FieldToggle
                        label="Qty"
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

                <Pressable onPress={() => setShowArchived((v) => !v)} className="mt-1 self-start" hitSlop={6}>
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    {showArchived ? "Hide" : "Show"} archived ({archivedOther.length})
                  </Text>
                </Pressable>
                {showArchived
                  ? archivedOther.map((r) => (
                      <View
                        key={r.other_type}
                        className="mt-2 flex-row items-center justify-between rounded-xl border px-3 py-2.5"
                        style={{ borderColor: "#ece7e1", opacity: 0.6 }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>
                            {r.other_type}
                          </Text>
                          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                            ${Number(r.rate).toFixed(2)} per {r.unit}
                          </Text>
                        </View>
                        <Pressable onPress={() => saveRate(() => updateOtherRate(r.other_type, { active: true }))} hitSlop={6}>
                          <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                            Restore
                          </Text>
                        </Pressable>
                      </View>
                    ))
                  : null}
              </RateCard>
            </View>

            {/* Full width under the three columns. The mock draws a
                "push N days before the period closes" field here; that
                setting doesn't exist and re-adding it would undo the fix
                that stopped the reminder firing a week early — it's
                anchored to the period boundary now, so this card keeps its
                two real times. */}
            <View className="mt-4">
              <DeadlineReminderCard />
            </View>
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
