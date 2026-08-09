import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, Image, TextInput, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise, addDays, daysBetween } from "../../../lib/boiseDate";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { getCheckinForWeek } from "../../../lib/nutrition/checkin";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { getCurrentTarget, deriveCalories } from "../../../lib/nutrition/targets";
import { getLogForDate, saveDraftLog, finalizeLog } from "../../../lib/nutrition/dailyLog";
import { listFocusItems, toggleFocusItem } from "../../../lib/nutrition/coachClient";
import { listActiveMilestones, listCompletedMilestones, getUnseenCompletedMilestone, acknowledgeMilestone, MILESTONE_COLORS } from "../../../lib/nutrition/milestones";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { TodayCardSlider } from "../../../components/nutrition/TodayCardSlider";
import { MilestoneCongratsModal } from "../../../components/nutrition/MilestoneCongratsModal";
import { MilestoneDetailModal } from "../../../components/nutrition/MilestoneDetailModal";
import { CalorieOverrideModal } from "../../../components/nutrition/CalorieOverrideModal";
import { TargetField } from "../../../components/nutrition/TargetField";
import { RatingSelect } from "../../../components/nutrition/RatingSelect";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { fonts, colors } from "../../../lib/theme";
import { toastError, toastSuccess } from "../../../lib/toast";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { useScrollToKeyboard, useKeyboardHeight, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";

const AUTOSAVE_DELAY_MS = 900;
const CANVAS = "#faf8f6";

const EMPTY_VALUES = {
  weight: "",
  protein_g: "",
  carb_g: "",
  fat_g: "",
  fiber_g: "",
  calories_override: "",
  steps: "",
  sleep_hours: "",
  sleep_quality: "",
  hunger: "",
  energy: "",
  client_note: "",
};

function toRowValues(log) {
  if (!log) return EMPTY_VALUES;
  const values = {};
  for (const key of Object.keys(EMPTY_VALUES)) {
    values[key] = log[key] === null || log[key] === undefined ? "" : String(log[key]);
  }
  return values;
}

// Display-only weekday label ("Sun, Aug 2") — never used for storage/
// comparison, same rule as every other date formatter in this app.
function formatDateWeekday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// design_handoff_v2_settings_nutrition — the 3 Daily Log cards need visible
// separation. First two attempts tinted the whole card body: too subtle at
// near-white, then too heavy/muddy once saturated enough to actually read,
// and the saturated version fought with each field's fixed target-pill
// color (steps' pale blue landing on a tan card looked especially bad, per
// direct feedback). Landed on tinting only a thin header band instead —
// same two-tone-header technique My Week's WeekSection cards already use —
// so the pill colors sit on plain white further down and never clash.
function DailyLogCard({ color, title, children }) {
  return (
    <View className="mb-4 rounded-lg border border-stone-200" style={{ overflow: "hidden" }}>
      <View style={{ backgroundColor: color, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text className="text-xs uppercase text-stone-500" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
          {title}
        </Text>
      </View>
      <View style={{ padding: 16, backgroundColor: "white" }}>{children}</View>
    </View>
  );
}

function FocusRow({ item, onChanged }) {
  const [busy, setBusy] = useState(false);
  const handleToggle = async () => {
    setBusy(true);
    try {
      await toggleFocusItem(item.id, !item.done);
      await onChanged();
    } catch (err) {
      toastError("Failed to update", err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={handleToggle} disabled={busy} className="mb-1.5 flex-row items-center gap-2.5">
      <View
        className="items-center justify-center rounded border"
        style={{ width: 18, height: 18, borderColor: item.done ? "#4d6142" : "#d6d3d1", backgroundColor: item.done ? "#4d6142" : "transparent" }}
      >
        {item.done ? <Ionicons name="checkmark" size={13} color="white" /> : null}
      </View>
      <Text style={{ fontFamily: fonts.sans, color: item.done ? "#a8a29e" : "#44403c", textDecorationLine: item.done ? "line-through" : "none" }}>
        {item.text}
      </Text>
    </Pressable>
  );
}

export default function NutritionToday() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const today = todayInBoise();
  const access = useNutritionAccess(profile.id);
  // automaticallyAdjustKeyboardInsets (previously on the ScrollView below)
  // uses iOS's own native keyboard-tracking to reveal a focused field —
  // accurate for the real keyboard, but confirmed on a real device that
  // it's blind to KeyboardDoneButton's floating bar sitting on top of it
  // (app/_layout.js): it scrolls the field flush against the real
  // keyboard's edge with zero awareness that the bar then covers it right
  // back up. Extra bottom padding doesn't fix this — the native behavior
  // decides where to scroll based only on the real keyboard frame, not on
  // how much scrollable content exists below it. Switched to the same
  // manual measure-and-scroll approach already proven for supersets (see
  // lib/scrollToKeyboard.js) instead.
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const notesRef = useRef(null);
  const [calorieModalOpen, setCalorieModalOpen] = useState(false);
  // Notes is the very last field before Finalize, with little real content
  // below it — measureInWindow-based scrolling (above) can only reveal a
  // field if the ScrollView actually has enough scrollable distance left to
  // reach it; a ScrollView clamps its max offset to contentHeight -
  // viewportHeight, so without this the keyboard (plus the floating Done
  // bar sitting on top of it) simply covers Notes with nowhere left to
  // scroll. Same full occludedHeight pattern as SessionFocusModal.js /
  // MessageThread.js, tabBarHeight subtracted since this screen sits inside
  // (member)/_layout.js's Tabs navigator and that space is already
  // reserved in the layout (padding by the raw keyboard height would
  // double-count it).
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  const [dateOffset, setDateOffset] = useState(0);
  const selectedDate = addDays(today, -dateOffset);
  // A tap on a specific My Week nutrition day-bubble arrives here as a
  // `date` param — sync it into dateOffset once per fresh navigation. Tabs
  // stay mounted, so a plain mount-only read of the param would miss a
  // second visit; same "applied param ref" idiom plan.js already uses for
  // its own `program` param. Only past-or-today dates are ever linked here
  // (My Week only makes past/today day-bubbles tappable), so no negative
  // offset (future-date) case to guard against.
  const appliedDateParamRef = useRef(undefined);
  useEffect(() => {
    if (!params.date || appliedDateParamRef.current === params.date) return;
    appliedDateParamRef.current = params.date;
    setDateOffset(Math.max(0, daysBetween(today, params.date)));
  }, [params.date, today]);

  const [target, setTarget] = useState(null);
  const [focusItems, setFocusItems] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [completedMilestones, setCompletedMilestones] = useState([]);
  const [selectedMilestone, setSelectedMilestone] = useState(null);
  const [congratsMilestone, setCongratsMilestone] = useState(null);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [ready, setReady] = useState(false);
  const [checkinDue, setCheckinDue] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [saveState, setSaveState] = useState("idle");
  const [finalizedAt, setFinalizedAt] = useState(null);
  const [finalizeError, setFinalizeError] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const debounceRef = useRef(null);
  // The load effect below sets `values` from the server, which would
  // otherwise immediately re-trigger the autosave effect on first render —
  // this skips exactly that one load-triggered run, not any real edit.
  const skipAutosaveRef = useRef(true);

  const loadFocus = async () => {
    try {
      setFocusItems(await listFocusItems(profile.id));
    } catch (err) {
      console.error("Failed to load focus items:", err);
    }
  };

  const loadMilestones = async () => {
    try {
      setMilestones(await listActiveMilestones(profile.id));
    } catch (err) {
      console.error("Failed to load milestones:", err);
    }
    try {
      setCompletedMilestones(await listCompletedMilestones(profile.id));
    } catch (err) {
      console.error("Failed to load completed milestones:", err);
    }
  };

  // useNutritionAccess itself only fetches on mount otherwise — a coach
  // turning nutrition on, approving targets, or sending onboarding while
  // this tab is already open (Tabs keep screens mounted) wouldn't be
  // picked up until the app restarted.
  useFocusEffect(useCallback(() => access.refetch(), [access.refetch]));

  // useFocusEffect (not a mount-only useEffect) so returning to this tab —
  // from Weekly/Check-in/Photos, or backgrounding and re-foregrounding the
  // app — re-checks for anything the coach changed elsewhere, e.g. a newly
  // closed-out milestone. A plain useEffect only ran once on first mount,
  // which is why the congrats popup needed a full page reload to appear —
  // same class of bug noted elsewhere in this app (My Week/My Fitness).
  useFocusEffect(
    useCallback(() => {
      if (access.status !== "active") return;
      loadFocus();
      loadMilestones();
      getUnseenCompletedMilestone(profile.id)
        .then(setCongratsMilestone)
        .catch((err) => console.error("Failed to check for completed milestones:", err));
      // Check-in due signal (dot on the Check-In segment + a line below) —
      // isolated so a failure just hides the nudge.
      (async () => {
        try {
          const { currentWeek } = computeWeekWindows(todayInBoise());
          const checkin = await getCheckinForWeek(profile.id, currentWeek.start);
          setCheckinDue(!checkin);
        } catch {
          setCheckinDue(false);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [access.status])
  );

  const handleCloseCongrats = async () => {
    const milestone = congratsMilestone;
    setCongratsMilestone(null);
    try {
      await acknowledgeMilestone(milestone.id);
    } catch (err) {
      console.error("Failed to acknowledge milestone:", err);
    }
  };

  useEffect(() => {
    if (access.status !== "active") return;
    setReady(false);
    setLoadError(null);
    (async () => {
      try {
        const [targetRow, log] = await Promise.all([
          getCurrentTarget(profile.id, selectedDate),
          getLogForDate(profile.id, selectedDate),
        ]);
        setTarget(targetRow);
        skipAutosaveRef.current = true;
        setValues(toRowValues(log));
        setFinalizedAt(log?.finalized_at ?? null);
        setReady(true);
      } catch (err) {
        setLoadError(err.message ?? String(err));
      }
    })();
  }, [access.status, profile.id, selectedDate, retryKey]);

  useEffect(() => {
    if (!ready) return;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("pending");
    debounceRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveDraftLog(profile.id, selectedDate, values);
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, ready]);

  const update = (field, text) => setValues((v) => ({ ...v, [field]: text }));

  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeError(null);
    try {
      // finalizeLog throws on failure (it never returns an error field) —
      // the old `result.error` branch here was dead code.
      const result = await finalizeLog(profile.id, selectedDate, values);
      setFinalizedAt(result.data.finalized_at);
      toastSuccess("Day finalized — nice work!");
    } catch (err) {
      setFinalizeError(err.message ?? String(err));
    } finally {
      setFinalizing(false);
    }
  };

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} onRetry={access.refetch} />;
  }

  // Calculated live from whatever's currently typed in the macro fields, not
  // just what's saved — so it updates as they type, before autosave lands.
  const calculatedCalories = Math.round(
    deriveCalories({ protein_g: Number(values.protein_g) || 0, carb_g: Number(values.carb_g) || 0, fat_g: Number(values.fat_g) || 0 })
  );
  const calorieTarget = target ? Math.round(deriveCalories(target)) : null;
  const isCalorieOverridden = values.calories_override !== "" && values.calories_override !== null && values.calories_override !== undefined;
  const displayedCalories = isCalorieOverridden ? Math.round(Number(values.calories_override)) : calculatedCalories;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24, backgroundColor: CANVAS }}>
        <View className="flex-row items-center gap-3">
          <Text className="mb-1 flex-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }} numberOfLines={1}>
            My Nutrition
          </Text>
          <Image source={require("../../../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
        </View>

        <SegmentedControl
          segments={NUTRITION_TABS}
          activeKey="today"
          badges={checkinDue ? ["checkin"] : null}
          onSelect={(key) => {
            const seg = NUTRITION_TABS.find((s) => s.key === key);
            if (seg && seg.key !== "today") router.push(seg.href);
          }}
        />
        {checkinDue ? (
          <Pressable onPress={() => router.push("/(member)/nutrition/checkin")} className="mb-3 -mt-4 self-start" hitSlop={8}>
            <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: "#b23a22" }}>
              This week's check-in is due — tap to fill it in ›
            </Text>
          </Pressable>
        ) : null}

        {/* Sticky date nav — pinned above the scroll content (not part of
            it) so it stays visible no matter how far down the form the
            member scrolls, per explicit ask to make it "always visible".
            Background matches the segmented tab bar right above it
            (stone-100, same as SegmentedControl.js) per direct ask, instead
            of sitting on plain white like a separate, unrelated element. */}
        <View className="mb-4 flex-row items-center justify-between rounded-xl border border-stone-200 bg-stone-100 px-2 py-2.5">
          <Pressable onPress={() => setDateOffset((o) => o + 1)} hitSlop={10} className="px-2">
            <Ionicons name="chevron-back" size={18} color="#57534e" />
          </Pressable>
          <View className="items-center">
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>{formatDateWeekday(selectedDate)}</Text>
            {dateOffset === 0 ? (
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                Today
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => setDateOffset((o) => Math.max(0, o - 1))} disabled={dateOffset === 0} hitSlop={10} className="px-2">
            <Ionicons name="chevron-forward" size={18} color={dateOffset === 0 ? "#d6d3d1" : "#57534e"} />
          </Pressable>
        </View>
      </View>

      {loadError ? (
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: CANVAS }}>
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your nutrition data: {loadError}
          </Text>
          <Pressable onPress={() => setRetryKey((k) => k + 1)} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      ) : !ready ? (
        <NutritionAccessMessage status="loading" />
      ) : (
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerClassName="px-6"
          contentContainerStyle={{ paddingBottom: 32 + keyboardPadding }}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <TodayCardSlider
            slides={[
              ...(focusItems.length > 0
                ? [
                    {
                      key: "focus",
                      content: (
                        <View className="rounded-lg border border-stone-200 bg-white p-4">
                          <Text className="mb-1.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
                            Focus
                          </Text>
                          {focusItems.map((item) => (
                            <FocusRow key={item.id} item={item} onChanged={loadFocus} />
                          ))}
                        </View>
                      ),
                    },
                  ]
                : []),
              ...(access.client?.game_plan
                ? [
                    {
                      key: "notes",
                      content: (
                        <View className="rounded-lg border border-stone-200 bg-white p-4">
                          <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
                            Notes
                          </Text>
                          <Text style={{ fontFamily: fonts.sans }}>{access.client.game_plan}</Text>
                        </View>
                      ),
                    },
                  ]
                : []),
              ...milestones.map((m) => {
                const palette = MILESTONE_COLORS[m.color_index % MILESTONE_COLORS.length];
                return {
                  key: `milestone-${m.id}`,
                  content: (
                    <View className="rounded-lg p-4" style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg }}>
                      <Text className="mb-1 text-xs uppercase" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5, color: palette.text }}>
                        Milestone
                      </Text>
                      <Text className="mb-1" style={{ fontFamily: fonts.sansBold, fontSize: 15, color: palette.text }}>
                        {m.title}
                      </Text>
                      {m.details ? <Text style={{ fontFamily: fonts.sans, color: "#57534e" }}>{m.details}</Text> : null}
                    </View>
                  ),
                };
              }),
              ...(completedMilestones.length > 0
                ? [
                    {
                      key: "completed-milestones",
                      content: (
                        <View className="rounded-lg border border-stone-200 bg-white p-4">
                          <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
                            Completed milestones
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {completedMilestones.map((m) => (
                              <Pressable
                                key={m.id}
                                onPress={() => setSelectedMilestone(m)}
                                className="items-center justify-center rounded-full"
                                style={{ width: 40, height: 40, backgroundColor: "#eef1e7" }}
                              >
                                {m.emoji ? (
                                  <Text style={{ fontSize: 18 }}>{m.emoji}</Text>
                                ) : (
                                  <Ionicons name="trophy" size={16} color="#4d6142" />
                                )}
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      ),
                    },
                  ]
                : []),
            ]}
          />

          <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold }}>
            Daily Log
          </Text>

          <DailyLogCard color="#eef1e7" title="Log these in the morning">
            <TargetField label="Weight (lb)" styleKey="weight" value={values.weight} onChangeText={(t) => update("weight", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
            <View className="flex-row gap-3">
              <TargetField liveCompare label="Sleep (hrs)" styleKey="sleep" current={target?.sleep_hours_goal} flex value={values.sleep_hours} onChangeText={(t) => update("sleep_hours", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
              <RatingSelect label="Sleep quality (1-5)" flex value={values.sleep_quality} onChangeText={(t) => update("sleep_quality", t)} />
            </View>
          </DailyLogCard>

          <DailyLogCard color="#fdf6f2" title="Log your macros">
            <View className="flex-row gap-3">
              <TargetField liveCompare label="Protein (g)" styleKey="protein" current={target?.protein_g} flex value={values.protein_g} onChangeText={(t) => update("protein_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
              <TargetField liveCompare label="Carb (g)" styleKey="carb" current={target?.carb_g} flex value={values.carb_g} onChangeText={(t) => update("carb_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
            </View>
            <View className="mb-3 flex-row gap-3">
              <TargetField liveCompare label="Fat (g)" styleKey="fat" current={target?.fat_g} flex value={values.fat_g} onChangeText={(t) => update("fat_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
              <TargetField liveCompare label="Fiber (g)" styleKey="fiber" current={target?.fiber_g} flex value={values.fiber_g} onChangeText={(t) => update("fiber_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
            </View>

            <View className="mb-1.5 flex-row items-center justify-between border-b border-stone-200 pb-2">
              <View className="flex-row items-center gap-1.5">
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                  {isCalorieOverridden ? "Cronometer Calories" : "Calculated Calories"}
                </Text>
                <Pressable onPress={() => setCalorieModalOpen(true)} hitSlop={8} accessibilityLabel="About calculated calories">
                  <Ionicons name="information-circle-outline" size={17} color={colors.primaryOnWhite} />
                </Pressable>
              </View>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>{displayedCalories}</Text>
            </View>
            <View className="flex-row items-center justify-between border-b border-stone-200 pb-2">
              <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                Target Calories
              </Text>
              <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                {calorieTarget ?? "—"}
              </Text>
            </View>
          </DailyLogCard>

          <DailyLogCard color="#f4ede3" title="Log these in the evening">
            <View className="flex-row gap-3">
              <TargetField liveCompare label="Steps" styleKey="steps" current={target?.step_goal} flex value={values.steps} onChangeText={(t) => update("steps", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
              <RatingSelect label="Hunger (1-5)" flex value={values.hunger} onChangeText={(t) => update("hunger", t)} />
              <RatingSelect label="Energy (1-5)" flex value={values.energy} onChangeText={(t) => update("energy", t)} />
            </View>
          </DailyLogCard>

          <Text className="mb-1 mt-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Notes
          </Text>
          <TextInput
            ref={notesRef}
            value={values.client_note}
            onChangeText={(t) => update("client_note", t)}
            onFocus={() => scrollFieldIntoView(notesRef.current)}
            multiline
            inputAccessoryViewID={NUMERIC_DONE_ID}
            className="mb-2 min-h-[80px] rounded-lg border border-stone-300 px-4 py-3 text-base"
            style={{ fontFamily: fonts.sans }}
          />

          <Text className="mb-6 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            {saveState === "pending" && "Unsaved changes…"}
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "All changes saved automatically."}
            {saveState === "error" && "Couldn't save — check your connection."}
          </Text>

          {finalizeError ? (
            <Text className="mb-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
              {finalizeError}
            </Text>
          ) : null}

          <Pressable
            onPress={handleFinalize}
            disabled={finalizing}
            className="mb-6 items-center rounded-lg py-3.5 disabled:opacity-50"
            // Olive once finalized — same completed-state language as the
            // fitness Finalize button, which used to stay terracotta here.
            style={({ pressed }) => ({ backgroundColor: finalizedAt ? "#4d6142" : colors.primary, opacity: pressed ? 0.75 : 1 })}
          >
            <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {finalizing ? "Saving…" : finalizedAt ? "✓ Day finalized" : "Finalize Day"}
            </Text>
          </Pressable>
        </ScrollView>
      )}
      <MilestoneCongratsModal milestone={congratsMilestone} onClose={handleCloseCongrats} />
      <MilestoneDetailModal milestone={selectedMilestone} onClose={() => setSelectedMilestone(null)} />
      <CalorieOverrideModal
        visible={calorieModalOpen}
        initialValue={values.calories_override}
        onClose={() => setCalorieModalOpen(false)}
        onOverride={(text) => {
          update("calories_override", text);
          setCalorieModalOpen(false);
        }}
      />
    </View>
  );
}
