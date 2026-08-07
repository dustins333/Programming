import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { getLoggedSetsForDate } from "../lib/programming/memberPlan";
import { fonts, colors } from "../lib/theme";
import { ExerciseCard, targetLineFor } from "./ExerciseCard";
import { SessionFocusModal } from "./SessionFocusModal";

const CARD_BORDER = "#ece7e1";

// Turns a date's logged rows for one exercise into a short "what's already
// here" line for the focus-layout index row — e.g. "3×8 @ 135". Used so the
// index always shows real persisted values regardless of finalize state
// (finalize never touches this data), instead of a bare exercise name that
// looks the same whether something was logged or not.
function summarizeLoggedSets(sets) {
  const withData = sets.filter((s) => s.reps != null || s.weight != null);
  if (withData.length === 0) return { hasAny: false, summaryText: null };
  const reps = withData.map((s) => s.reps);
  const weights = withData.map((s) => s.weight);
  const uniform = new Set(reps).size <= 1 && new Set(weights).size <= 1;
  const summaryText = uniform
    ? `${withData.length}×${reps[0] ?? "–"}${weights[0] != null ? ` @ ${weights[0]}` : ""}`
    : withData.map((s) => `${s.reps ?? "–"}${s.weight != null ? `@${s.weight}` : ""}`).join(", ");
  return { hasAny: true, summaryText };
}

// One compact row per group in "focus" layout — replaces the old
// always-expanded flat stack. Shows a persistent "what's logged so far"
// summary (independent of finalize state, which never touches this data)
// instead of a bare name, so a glance at the collapsed list proves nothing
// was lost after finalizing. Tapping anywhere opens the focus modal there.
function GroupIndexRow({ group, summaries, onPress }) {
  const isSuperset = group.length > 1;
  return (
    <Pressable
      onPress={onPress}
      className="mb-2.5 rounded-2xl bg-white px-4 py-3"
      style={
        isSuperset
          ? { borderWidth: 1.5, borderColor: "#a46a57", borderStyle: "dashed" }
          : { borderWidth: 1, borderColor: CARD_BORDER, shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }
      }
    >
      {isSuperset ? (
        <Text className="mb-1.5 self-start rounded-full px-2.5 py-0.5" style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#b23a22", backgroundColor: "#fdece5" }}>
          ⚭ SUPERSET
        </Text>
      ) : null}
      {group.map((item, i) => {
        const summary = summaries[item.exercise.id];
        return (
          <View
            key={item.id}
            className="flex-row items-center justify-between"
            style={{ gap: 12, marginTop: isSuperset && i > 0 ? 8 : 0 }}
          >
            <View className="flex-1" style={{ minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
                {item.exercise.name}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: summary?.hasAny ? "#78716c" : "#a8a29e", marginTop: 1 }}>
                {summary?.summaryText ?? targetLineFor(item)}
              </Text>
            </View>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: summary?.hasAny ? "#4d6142" : "#e7e5e4", flexShrink: 0 }} />
          </View>
        );
      })}
    </Pressable>
  );
}

// Shared logging surface for both group and SPC sessions on My Fitness.
// Two layouts: "accordion" (default) is the original always-visible flat
// stack, single-open, each expanded card breaking its target sets into
// individual reps/weight rows plus a notes field (autosaved, debounced,
// same pattern as nutrition's daily log) and a "last time" history panel.
// "focus" replaces that with a compact index (GroupIndexRow above) plus a
// SessionFocusModal that takes over the screen one exercise/superset at a
// time with left/right navigation — see SessionFocusModal.js for why every
// group's ExerciseCard has to mount immediately either way, not lazily per
// navigation. One Finalize button for the whole session either way.
// hideFinalizeButton lets a caller take the Finalize button out of the
// scrolling content entirely (My Fitness docks it in a screen-bottom bar
// instead, when exactly one session is the page's clear focus) without
// this component losing its own standalone-usable default.
export function SessionLogger({
  userId,
  datePerformed,
  source,
  exercises,
  isCompleted,
  onFinalize,
  hideFinalizeButton,
  hideVideo,
  onExpandExercise,
  layout = "accordion",
  timer,
  onToggleTimer,
  onResetTimer,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [focusIndex, setFocusIndex] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [summaries, setSummaries] = useState({});

  const isFocus = layout === "focus";

  const handleToggle = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
    onExpandExercise?.();
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await onFinalize();
    } finally {
      setFinalizing(false);
    }
  };

  // Superset pairs render adjacently regardless of stored position — group
  // by supersetGroupId (falling back to the item's own id so an unlinked
  // exercise is its own group of one), preserving first-occurrence order.
  const groups = [];
  const groupIndexByKey = new Map();
  exercises.forEach((item) => {
    const key = item.supersetGroupId ?? item.id;
    if (!groupIndexByKey.has(key)) {
      groupIndexByKey.set(key, groups.length);
      groups.push([]);
    }
    groups[groupIndexByKey.get(key)].push(item);
  });

  const exerciseIdsKey = exercises.map((item) => item.exercise.id).join(",");

  const fetchSummaryFor = useCallback(
    async (exerciseId) => {
      const sets = await getLoggedSetsForDate(userId, exerciseId, datePerformed);
      setSummaries((prev) => ({ ...prev, [exerciseId]: summarizeLoggedSets(sets) }));
    },
    [userId, datePerformed]
  );

  // Index-row summaries are fetched independently of ExerciseCard's own
  // lazy load (slightly redundant, but decoupled and low-risk) so they're
  // available before any card is ever opened.
  useEffect(() => {
    if (!isFocus) return;
    exercises.forEach((item) => fetchSummaryFor(item.exercise.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocus, exerciseIdsKey]);

  const handleCloseFocus = () => {
    const closedGroup = focusIndex !== null ? groups[focusIndex] : null;
    setFocusIndex(null);
    closedGroup?.forEach((item) => fetchSummaryFor(item.exercise.id));
  };

  if (isFocus) {
    return (
      <View>
        {groups.map((group, i) => (
          <GroupIndexRow key={group[0].id} group={group} summaries={summaries} onPress={() => setFocusIndex(i)} />
        ))}

        <SessionFocusModal
          visible={focusIndex !== null}
          groups={groups}
          focusIndex={focusIndex ?? 0}
          onNavigate={setFocusIndex}
          onClose={handleCloseFocus}
          userId={userId}
          datePerformed={datePerformed}
          source={source}
          hideVideo={hideVideo}
          timer={timer}
          onToggleTimer={onToggleTimer}
          onResetTimer={onResetTimer}
          onFinalize={onFinalize}
          isCompleted={isCompleted}
        />

        {!hideFinalizeButton && (
          <Pressable
            onPress={handleFinalize}
            disabled={finalizing}
            className="mt-2 items-center justify-center disabled:opacity-50"
            style={{
              height: 52,
              borderRadius: 12,
              backgroundColor: isCompleted ? "#4d6142" : colors.primary,
              shadowColor: isCompleted ? "#4d6142" : colors.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
            }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 14 }}>
              {finalizing ? "Saving…" : isCompleted ? "✓ Finalized — tap to update" : "Finalize workout"}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View>
      {groups.map((group) =>
        group.length > 1 ? (
          <View
            key={group[0].id}
            className="mb-2.5 rounded-2xl px-2 pt-2"
            style={{ borderWidth: 1.5, borderColor: "#a46a57", borderStyle: "dashed" }}
          >
            <Text className="mb-1 self-start rounded-full px-2.5 py-0.5" style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#b23a22", backgroundColor: "#fdece5" }}>
              ⚭ SUPERSET
            </Text>
            {group.map((item) => (
              <ExerciseCard
                key={item.id}
                userId={userId}
                datePerformed={datePerformed}
                source={source}
                item={item}
                expanded={expandedId === item.id}
                onToggle={handleToggle}
                hideVideo={hideVideo}
              />
            ))}
          </View>
        ) : (
          <ExerciseCard
            key={group[0].id}
            userId={userId}
            datePerformed={datePerformed}
            source={source}
            item={group[0]}
            expanded={expandedId === group[0].id}
            onToggle={handleToggle}
            hideVideo={hideVideo}
          />
        )
      )}

      {!hideFinalizeButton && (
        <Pressable
          onPress={handleFinalize}
          disabled={finalizing}
          className="mt-2 items-center justify-center disabled:opacity-50"
          style={{
            height: 52,
            borderRadius: 12,
            backgroundColor: isCompleted ? "#4d6142" : colors.primary,
            shadowColor: isCompleted ? "#4d6142" : colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
          }}
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 14 }}>
            {finalizing ? "Saving…" : isCompleted ? "✓ Finalized — tap to update" : "Finalize workout"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
