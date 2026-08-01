import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getLastLoggedSession, getLoggedSetsForDate, logResult } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";

const AUTOSAVE_DELAY_MS = 900;

// Design tokens from design_handoff_visual_pass_v4/README.md.
const CARD_BORDER = "#ece7e1";
const INPUT_BORDER = "#d9d4cd";
const PILL_BG = "#fdece5";
const PILL_TEXT = "#b23a22";

function ExerciseCard({ userId, datePerformed, source, item, expanded, onToggle, hideVideo }) {
  const targetSets = item.targetSets && item.targetSets > 0 ? item.targetSets : 3;
  const [rows, setRows] = useState(() => Array.from({ length: targetSets }, () => ({ reps: "", weight: "" })));
  const [notes, setNotes] = useState("");
  // History is fetched lazily off the clock-icon toggle, not on every
  // expand — most sessions never get looked at, and it used to be an
  // always-visible flat "Set 1 / Set 2 / Set 3" block that just ate space.
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null); // null until loaded — see historyLoaded for "loaded but genuinely empty"
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const loaded = useRef(false);
  const debounceRef = useRef(null);
  // The load-on-expand effect below sets rows/notes from whatever's already
  // saved today, which would otherwise immediately re-trigger the autosave
  // effect — this skips exactly that one load-triggered run, not any real edit.
  const skipAutosaveRef = useRef(true);

  const loadOnFirstExpand = async () => {
    if (loaded.current) return;
    loaded.current = true;
    const todaysSets = await getLoggedSetsForDate(userId, item.exercise.id, datePerformed);
    if (todaysSets.length > 0) {
      skipAutosaveRef.current = true;
      setRows((prev) =>
        prev.map((row, i) => {
          const existing = todaysSets.find((s) => s.set_number === i + 1);
          return existing ? { reps: existing.reps === null ? "" : String(existing.reps), weight: existing.weight === null ? "" : String(existing.weight) } : row;
        })
      );
      const notedRow = todaysSets.find((s) => s.notes);
      if (notedRow) setNotes(notedRow.notes);
    }
  };

  const handleToggle = () => {
    if (!expanded) loadOnFirstExpand();
    onToggle(item.id);
  };

  // Fetched once, on first tap of the clock icon — not on every expand,
  // since most sessions never get looked at and this used to fire
  // unconditionally. Toggling back off just hides it, doesn't reset it.
  const handleToggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && !historyLoaded) {
      setHistoryLoading(true);
      const last = await getLastLoggedSession(userId, item.exercise.id, datePerformed);
      setHistory(last);
      setHistoryLoaded(true);
      setHistoryLoading(false);
    }
  };

  const updateRow = (index, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("pending");
    debounceRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await Promise.all(
          rows.map((row, i) =>
            logResult({
              userId,
              exerciseId: item.exercise.id,
              datePerformed,
              setNumber: i + 1,
              reps: row.reps === "" ? null : Number(row.reps) || null,
              weight: row.weight === "" ? null : Number(row.weight),
              notes: notes === "" ? null : notes,
              source,
            })
          )
        );
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, notes]);

  return (
    <View
      className="mb-2.5 rounded-2xl bg-white px-4"
      style={
        expanded
          ? {
              borderWidth: 1.5,
              borderColor: colors.primary,
              paddingVertical: 18,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.08,
              shadowRadius: 22,
            }
          : { borderWidth: 1, borderColor: CARD_BORDER, paddingVertical: 15, shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }
      }
    >
      <Pressable onPress={handleToggle} className="flex-row items-center justify-between" style={{ gap: 12 }}>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: expanded ? 15 : 14, color: "#44403c" }}>
            {item.exercise.name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 1 }}>
            Target: {targetSets} sets × {item.targetReps ?? "–"}
            {item.notes ? ` · ${item.notes}` : ""}
          </Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={expanded ? "#a8a29e" : "#d6d3d1"} />
      </Pressable>

      {expanded && (
        <View className="mt-3">
          {!hideVideo && item.exercise.video_url ? (
            <Pressable
              onPress={() => Linking.openURL(item.exercise.video_url)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={`Watch video for ${item.exercise.name}`}
              className="mb-3 flex-row items-center gap-1.5 self-start"
            >
              <Ionicons name="play" size={11} color={colors.primaryOnWhite} />
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>Watch video</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleToggleHistory}
            className="mb-3 flex-row items-center gap-1.5 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={showHistory ? "Hide last time" : "Show last time"}
          >
            <Ionicons name={showHistory ? "time" : "time-outline"} size={14} color={colors.primary} />
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>
              {historyLoading
                ? "Loading last time…"
                : showHistory && history
                  ? `Last time: ${formatDateMDY(history.date)}`
                  : showHistory
                    ? "Last time"
                    : "Show last time"}
            </Text>
          </Pressable>
          {showHistory && historyLoaded && history === null ? (
            <Text className="mb-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              No previous history for this lift yet.
            </Text>
          ) : null}

          {rows.map((row, i) => {
            // Matched by set_number, not position — if last time had more
            // or fewer sets than today's target, only the sets that line
            // up by number get an annotation; anything else is silently
            // dropped rather than showing a mismatched row.
            const histSet = showHistory && history ? history.sets.find((s) => s.set_number === i + 1) : null;
            return (
              <View key={i} className="mb-2.5">
                <View className="flex-row items-center gap-2.5">
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c", width: 46 }}>Set {i + 1}</Text>
                  <TextInput
                    value={row.reps}
                    onChangeText={(v) => updateRow(i, "reps", v)}
                    placeholder={item.targetReps ?? "reps"}
                    keyboardType="numeric"
                    placeholderTextColor="#a8a29e"
                    className="flex-1 text-center"
                    style={{ fontFamily: fonts.sans, fontSize: 14, color: "#44403c", height: 44, borderWidth: 1, borderColor: INPUT_BORDER, borderRadius: 10 }}
                  />
                  <TextInput
                    value={row.weight}
                    onChangeText={(v) => updateRow(i, "weight", v)}
                    placeholder="weight"
                    keyboardType="numeric"
                    placeholderTextColor="#a8a29e"
                    className="flex-1 text-center"
                    style={{ fontFamily: fonts.sans, fontSize: 14, color: "#44403c", height: 44, borderWidth: 1, borderColor: INPUT_BORDER, borderRadius: 10 }}
                  />
                </View>
                {histSet ? (
                  <View className="mt-1.5 items-center">
                    <View className="rounded-full" style={{ backgroundColor: PILL_BG, paddingVertical: 3, paddingHorizontal: 10 }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: PILL_TEXT }}>
                        Last: {histSet.reps ?? "–"} reps{histSet.weight ? ` @ ${histSet.weight}` : ""}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
          {showHistory && history?.sets.find((s) => s.notes) ? (
            <Text className="mb-2" style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
              Last time's note: {history.sets.find((s) => s.notes).notes}
            </Text>
          ) : null}

          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c", marginBottom: 6 }}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="How did it feel? Anything to remember for next time?"
            placeholderTextColor="#a8a29e"
            className="mb-2.5"
            style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c", minHeight: 52, borderWidth: 1, borderColor: INPUT_BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
          />

          {saveState === "saved" ? (
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#4d6142" }} />
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>Saved automatically</Text>
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
              {saveState === "pending" && "Unsaved changes…"}
              {saveState === "saving" && "Saving…"}
              {saveState === "error" && "Couldn't save — check your connection."}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// Shared logging surface for both group and SPC sessions on My Fitness —
// one collapsed card per exercise, single-open accordion (expanding one
// collapses whichever other was open), each expanded card breaking its
// target sets into individual reps/weight rows plus a notes field
// (autosaved, debounced, same pattern as nutrition's daily log) and a "last
// time" history panel, with one Finalize button for the whole session.
// hideFinalizeButton lets a caller take the Finalize button out of the
// scrolling content entirely (My Fitness docks it in a screen-bottom bar
// instead, when exactly one session is the page's clear focus) without
// this component losing its own standalone-usable default.
export function SessionLogger({
  userId,
  datePerformed,
  source,
  exercises,
  onFinalize,
  hideFinalizeButton,
  hideVideo,
  onExpandExercise,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);

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

  return (
    <View>
      {exercises.map((item) => (
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

      {!hideFinalizeButton && (
        <Pressable
          onPress={handleFinalize}
          disabled={finalizing}
          className="mt-2 items-center justify-center disabled:opacity-50"
          style={{
            height: 52,
            borderRadius: 12,
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
          }}
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 14 }}>
            {finalizing ? "Saving…" : "Finalize workout"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
