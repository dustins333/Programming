import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
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
import { getLogForDate, saveDraftLog, finalizeLog, listLogsForDateRange } from "../../../lib/nutrition/dailyLog";
import { listFocusItems, toggleFocusItem } from "../../../lib/nutrition/coachClient";
import { listActiveMilestones, listCompletedMilestones, getUnseenCompletedMilestone, acknowledgeMilestone, MILESTONE_COLORS } from "../../../lib/nutrition/milestones";
import { listPhases } from "../../../lib/nutrition/planPhases";
import { TodayCardSlider } from "../../../components/nutrition/TodayCardSlider";
import { MilestoneCongratsModal } from "../../../components/nutrition/MilestoneCongratsModal";
import { MilestoneDetailModal } from "../../../components/nutrition/MilestoneDetailModal";
import { CalorieOverrideModal } from "../../../components/nutrition/CalorieOverrideModal";
import { MacroDial } from "../../../components/nutrition/MacroDial";
import { RatingSquares } from "../../../components/nutrition/RatingSquares";
import { StatTile } from "../../../components/nutrition/StatTile";
import { AddValueBadge } from "../../../components/nutrition/AddValueBadge";
import { NutritionTabHeader } from "../../../components/nutrition/NutritionTabHeader";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";
import { toastError, toastSuccess } from "../../../lib/toast";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { useScrollToKeyboard, useKeyboardHeight, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";
import { autofillSuppressedRef } from "../../../lib/webAutofillSuppression";
import { useRefreshOnFocus } from "../../../lib/useRefreshOnFocus";

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

const CARD_BORDER = "#ece7e1";
const DIVIDER = "#f4efe9";
const OLIVE = "#4d6142";
const DASHED_EMPTY = "#ddd6cd";
const INPUT_BORDER = "#d9d4cd";
const CARD_SHADOW = {
  shadowColor: "#44403c",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.045,
  shadowRadius: 14,
  elevation: 2,
};

function Eyebrow({ children, color = "#a8a29e", style }) {
  return (
    <Text
      maxFontSizeMultiplier={1.1}
      style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color, ...style }}
    >
      {children}
    </Text>
  );
}

// design_handoff_member_mobile_v5 (1g) — the three tinted "Log these in the
// morning / macros / evening" cards are replaced by plain white cards with
// an eyebrow. The tint was doing the separating work before; hierarchy now
// comes from the dials and tiles themselves, so the containers get out of
// the way.
function LogCard({ eyebrow, aside, children, radius = 18, style }) {
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: radius,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
        ...CARD_SHADOW,
        ...style,
      }}
    >
      {eyebrow ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          {aside}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// The coach's own cards in the slider above the log — focus list, game plan,
// plan phases, milestones. The v5 mock doesn't draw these at all (they were
// deliberately kept, since nothing else surfaces what the coach wrote), so
// they'd been left on the old rounded-lg/stone-200 chrome and read as a
// different app sitting on top of the one below them. Same shell as LogCard,
// with the palette passed in for the tinted ones.
function SliderCard({ eyebrow, eyebrowColor, bg = "#fff", border = CARD_BORDER, children }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: border,
        paddingHorizontal: 16,
        paddingVertical: 14,
        ...CARD_SHADOW,
      }}
    >
      <Eyebrow color={eyebrowColor} style={{ marginBottom: 8 }}>
        {eyebrow}
      </Eyebrow>
      {children}
    </View>
  );
}

// Steps sits in the same card as hunger/energy but reads as a value, not a
// scale — a bordered box that goes dashed while it's empty, same rule as
// every other unlogged control on this screen.
function StepsRow({ value, onChangeText, goal, scrollViewRef, scrollOffsetRef }) {
  const fieldRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const empty = value === "" || value === null || value === undefined;
  return (
    <View ref={fieldRef} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <View style={{ flexShrink: 1 }}>
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansMedium, fontSize: 13.5, color: "#44403c" }}>
          Steps
        </Text>
        {goal ? (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e", marginTop: 1 }}>
            goal {goal}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          minWidth: 96,
          borderRadius: 12,
          borderWidth: empty ? 1.5 : 1,
          borderStyle: empty ? "dashed" : "solid",
          borderColor: empty ? DASHED_EMPTY : "#d9d4cd",
          paddingHorizontal: 12,
        }}
      >
        <TextInput
          ref={autofillSuppressedRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            scrollFieldIntoView(fieldRef.current);
          }}
          onBlur={() => setFocused(false)}
          keyboardType="decimal-pad"
          placeholderTextColor="#c9c4bd"
          autoComplete="off"
          accessibilityLabel="Steps"
          maxFontSizeMultiplier={1.15}
          style={{ fontFamily: fonts.display, fontSize: 17, color: "#44403c", paddingVertical: 8, textAlign: "right" }}
        />
        {empty && !focused ? (
          <AddValueBadge size={24} style={{ position: "absolute", right: 10, top: 6, pointerEvents: "none" }} />
        ) : null}
      </View>
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
  // Tabs keep this screen mounted, so a mount-only load never re-runs
  // on a return visit — see lib/useRefreshOnFocus.js.
  const focusKey = useRefreshOnFocus();

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
  // scroll. Same full occludedHeight pattern as the member logging page /
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
  // Average weight over the 7 days before the selected date, for the weight
  // tile's "▼ 1.2 vs last week" line. Its own isolated fetch — a failure
  // just drops that one line rather than blocking the log itself.
  const [lastWeekWeight, setLastWeekWeight] = useState(null);
  const [focusItems, setFocusItems] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [phases, setPhases] = useState([]);
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
    // Own try/catch, same reasoning as the two above — migration 0050 may
    // not be run yet in a given environment.
    try {
      setPhases(await listPhases(profile.id));
    } catch (err) {
      console.error("Failed to load plan phases:", err);
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
    (async () => {
      try {
        const priorLogs = await listLogsForDateRange(profile.id, addDays(selectedDate, -7), addDays(selectedDate, -1));
        const weights = priorLogs.map((l) => l.weight).filter((w) => w !== null && w !== undefined);
        setLastWeekWeight(weights.length > 0 ? weights.reduce((a, b) => a + Number(b), 0) / weights.length : null);
      } catch (err) {
        console.error("Failed to load last week's weight:", err);
        setLastWeekWeight(null);
      }
    })();
  }, [access.status, profile.id, selectedDate, retryKey, focusKey]);

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
  // The macro card's eyebrow swaps from "tap to enter" to "{n} cal derived"
  // only once all four macros are in — a partial set would derive a
  // misleadingly low calorie number.
  const allMacrosEntered = ["protein_g", "carb_g", "fat_g", "fiber_g"].every((k) => values[k] !== "" && values[k] !== null && values[k] !== undefined);
  const weightDelta =
    lastWeekWeight !== null && values.weight !== "" && !Number.isNaN(Number(values.weight))
      ? Number(values.weight) - lastWeekWeight
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24, backgroundColor: CANVAS }}>
        <NutritionTabHeader activeKey="today" badges={checkinDue ? ["checkin"] : null}>
        {/* Date + logged-state badge, per the mock. The ‹ › arrows are
            folded into this row rather than kept as the separate sticky
            date card they used to live in — two date displays on one screen
            read as a duplicate, and the badge needs the space. Back-dating
            still works exactly as before (and My Week's day circles still
            deep-link straight to a specific date). */}
        <View className="mb-3 mt-0.5 flex-row items-center justify-between gap-2">
          <View className="flex-row items-center" style={{ marginLeft: -6 }}>
            <Pressable onPress={() => setDateOffset((o) => o + 1)} hitSlop={10} className="px-1.5" accessibilityLabel="Previous day">
              <Ionicons name="chevron-back" size={16} color="#78716c" />
            </Pressable>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
              {formatDateWeekday(selectedDate)}
              {dateOffset === 0 ? " | Today" : ""}
            </Text>
            <Pressable
              onPress={() => setDateOffset((o) => Math.max(0, o - 1))}
              disabled={dateOffset === 0}
              hitSlop={10}
              className="px-1.5"
              accessibilityLabel="Next day"
            >
              <Ionicons name="chevron-forward" size={16} color={dateOffset === 0 ? "#d6d3d1" : "#78716c"} />
            </Pressable>
          </View>
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: finalizedAt ? "#e9f0e1" : "#fdece5" }}>
            <Text
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.7, color: finalizedAt ? "#3f5136" : "#b23a22" }}
            >
              {finalizedAt ? "LOGGED" : "NOT LOGGED YET"}
            </Text>
          </View>
        </View>
        </NutritionTabHeader>
        {checkinDue ? (
          <Pressable onPress={() => router.push("/(member)/nutrition/checkin")} className="mb-3 -mt-4 self-start" hitSlop={8}>
            <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: "#b23a22" }}>
              This week's check-in is due — tap to fill it in ›
            </Text>
          </Pressable>
        ) : null}

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
                        <SliderCard eyebrow="Focus">
                          {focusItems.map((item) => (
                            <FocusRow key={item.id} item={item} onChanged={loadFocus} />
                          ))}
                        </SliderCard>
                      ),
                    },
                  ]
                : []),
              ...(access.client?.game_plan
                ? [
                    {
                      key: "notes",
                      content: (
                        <SliderCard eyebrow="From your coach">
                          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>
                            {access.client.game_plan}
                          </Text>
                        </SliderCard>
                      ),
                    },
                  ]
                : []),
              // One slide per phase, same as the milestone slides below —
              // stacking several into a single card didn't read at this
              // width. Top three only: the coach's list is the full plan,
              // this is just what's near-term, and the slider is already
              // sharing space with focus, notes and milestones.
              ...phases.slice(0, 3).map((phase) => ({
                key: `phase-${phase.id}`,
                content: (
                  <SliderCard eyebrow="What we're working on" eyebrowColor={colors.primaryOnWhite} bg="#fdf6f2" border="#f0ddd2">
                    <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: colors.primaryOnWhite }}>
                      {phase.title}
                    </Text>
                    {phase.details ? (
                      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e", marginTop: 3 }}>
                        {phase.details}
                      </Text>
                    ) : null}
                    {phase.items.map((item) => (
                      <Text key={item.id} maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#57534e", marginTop: 4 }}>
                        – {item.text}
                      </Text>
                    ))}
                  </SliderCard>
                ),
              })),
              ...milestones.map((m) => {
                const palette = MILESTONE_COLORS[m.color_index % MILESTONE_COLORS.length];
                return {
                  key: `milestone-${m.id}`,
                  content: (
                    <SliderCard eyebrow="Milestone" eyebrowColor={palette.text} bg={palette.bg} border={palette.border}>
                      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: palette.text }}>
                        {m.title}
                      </Text>
                      {m.details ? (
                        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e", marginTop: 3 }}>
                          {m.details}
                        </Text>
                      ) : null}
                    </SliderCard>
                  ),
                };
              }),
              ...(completedMilestones.length > 0
                ? [
                    {
                      key: "completed-milestones",
                      content: (
                        <SliderCard eyebrow="Completed milestones">
                          <View className="flex-row flex-wrap gap-2">
                            {completedMilestones.map((m) => (
                              <PressFade
                                key={m.id}
                                onPress={() => setSelectedMilestone(m)}
                                className="items-center justify-center rounded-full"
                                style={{ width: 40, height: 40, backgroundColor: "#eef1e7" }}
                              >
                                {m.emoji ? (
                                  <Text style={{ fontSize: 18 }}>{m.emoji}</Text>
                                ) : (
                                  <Ionicons name="trophy" size={16} color={OLIVE} />
                                )}
                              </PressFade>
                            ))}
                          </View>
                        </SliderCard>
                      ),
                    },
                  ]
                : []),
            ]}
          />

          <LogCard
            radius={22}
            eyebrow="Today's macros"
            aside={
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>
                {allMacrosEntered ? `${displayedCalories} cal derived` : "tap to enter"}
              </Text>
            }
          >
            <View className="flex-row" style={{ gap: 6 }}>
              <MacroDial label="Protein" value={values.protein_g} goal={target?.protein_g} onChangeText={(t) => update("protein_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
              <MacroDial label="Carb" value={values.carb_g} goal={target?.carb_g} onChangeText={(t) => update("carb_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
              <MacroDial label="Fat" value={values.fat_g} goal={target?.fat_g} onChangeText={(t) => update("fat_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
              <MacroDial label="Fiber" value={values.fiber_g} goal={target?.fiber_g} onChangeText={(t) => update("fiber_g", t)} scrollViewRef={scrollViewRef} scrollOffsetRef={scrollOffsetRef} />
            </View>
            {/* The mock folds calories entirely into the eyebrow's "{n} cal
                derived". Kept as one quiet line so the target stays visible
                and the Cronometer override (CalorieOverrideModal) is still
                reachable — it has no other entry point. */}
            <View
              className="mt-3.5 flex-row items-center justify-between pt-3"
              style={{ borderTopWidth: 1, borderTopColor: DIVIDER }}
            >
              <Pressable onPress={() => setCalorieModalOpen(true)} hitSlop={8} className="flex-row items-center gap-1.5" accessibilityLabel="About calculated calories">
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c" }}>
                  {isCalorieOverridden ? "Cronometer calories" : "Calculated"} {displayedCalories}
                  {calorieTarget ? ` | target ${calorieTarget}` : ""}
                </Text>
                <Ionicons name="information-circle-outline" size={15} color={colors.primaryOnWhite} />
              </Pressable>
            </View>
          </LogCard>

          <View className="mb-3 flex-row" style={{ gap: 10 }}>
            <StatTile
              eyebrow="Weight"
              value={values.weight}
              unit="lb"
              onChangeText={(t) => update("weight", t)}
              scrollViewRef={scrollViewRef}
              scrollOffsetRef={scrollOffsetRef}
              footer={
                weightDelta !== null ? (
                  <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: weightDelta <= 0 ? OLIVE : "#78716c" }}>
                    {weightDelta <= 0 ? "▼" : "▲"} {Math.abs(weightDelta).toFixed(1)} vs last week
                  </Text>
                ) : null
              }
            />
            <StatTile
              eyebrow="Sleep"
              value={values.sleep_hours}
              unit="hrs"
              onChangeText={(t) => update("sleep_hours", t)}
              scrollViewRef={scrollViewRef}
              scrollOffsetRef={scrollOffsetRef}
              footer={<RatingSquares compact label="quality" size={20} value={values.sleep_quality} onChangeText={(t) => update("sleep_quality", t)} />}
            />
          </View>

          <LogCard>
            <StepsRow
              value={values.steps}
              goal={target?.step_goal}
              onChangeText={(t) => update("steps", t)}
              scrollViewRef={scrollViewRef}
              scrollOffsetRef={scrollOffsetRef}
            />
            <View className="my-3" style={{ borderTopWidth: 1, borderTopColor: DIVIDER }} />
            <RatingSquares label="Hunger" value={values.hunger} onChangeText={(t) => update("hunger", t)} />
            <View className="my-3" style={{ borderTopWidth: 1, borderTopColor: DIVIDER }} />
            <RatingSquares label="Energy" value={values.energy} onChangeText={(t) => update("energy", t)} />
          </LogCard>

          <Eyebrow style={{ marginTop: 4, marginBottom: 8 }}>Notes for your coach</Eyebrow>
          <TextInput
            ref={notesRef}
            value={values.client_note}
            onChangeText={(t) => update("client_note", t)}
            onFocus={() => scrollFieldIntoView(notesRef.current)}
            multiline
            inputAccessoryViewID={NUMERIC_DONE_ID}
            className="mb-3 min-h-[80px] px-4 py-3"
            style={{ fontFamily: fonts.sans, fontSize: 14, borderRadius: 14, borderWidth: 1, borderColor: INPUT_BORDER, backgroundColor: "#fff" }}
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
        </ScrollView>
      )}
      {/* Pinned Finalize (1g) — outside the ScrollView so it stays reachable
          without scrolling to the bottom of the form. Hidden while the
          keyboard is up: it would otherwise sit under the keyboard (and
          under KeyboardDoneButton's floating bar), and there's nothing to
          finalize mid-keystroke anyway. */}
      {ready && !loadError && keyboardHeight === 0 ? (
        <View style={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 10, backgroundColor: CANVAS, borderTopWidth: 1, borderTopColor: "#f1ece6" }}>
          <PressFade
            onPress={handleFinalize}
            disabled={finalizing}
            className="items-center rounded-[15px] py-3.5"
            // Olive once finalized — same completed-state language as the
            // fitness Finalize button, which used to stay terracotta here.
            pressedOpacity={0.75}
            style={{ opacity: finalizing ? 0.5 : 1, backgroundColor: finalizedAt ? "#4d6142" : colors.primary,}}
          >
            <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {finalizing ? "Saving…" : finalizedAt ? "Day finalized" : "Finalize day"}
            </Text>
          </PressFade>
        </View>
      ) : null}
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
