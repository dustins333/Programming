import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Linking, Keyboard, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getLastLoggedSession, getLoggedSetsForDate, logResult } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";
import { ExerciseHistoryModal } from "./ExerciseHistoryModal";
import { WeightCalculator } from "./WeightCalculator";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";

const AUTOSAVE_DELAY_MS = 900;

// Design tokens from design_handoff_visual_pass_v4/README.md.
const CARD_BORDER = "#ece7e1";
const INPUT_BORDER = "#d9d4cd";
const PILL_BG = "#fdece5";
const PILL_TEXT = "#b23a22";

// Only worth showing as a per-set breakdown when the sets actually differ —
// a uniform scheme reads better as the existing flat "X sets × Y reps".
export function repSchemeSummary(repScheme) {
  if (!repScheme?.length) return null;
  const unique = [...new Set(repScheme)];
  return unique.length > 1 ? repScheme.join(", ") : null;
}

export function getTargetSets(item) {
  return item.targetSets && item.targetSets > 0 ? item.targetSets : 3;
}

export function targetLineFor(item) {
  return `Target: ${getTargetSets(item)} sets × ${repSchemeSummary(item.repScheme) ?? item.targetReps ?? "–"}${item.notes ? ` · ${item.notes}` : ""}`;
}

// One exercise's logging card — used both by SessionLogger's accordion
// layout (expanded/onToggle drive an inline expand/collapse) and by
// SessionFocusModal's focus layout (forceExpanded keeps it permanently
// populated, no header tap needed — see SessionFocusModal.js for why every
// group's card has to mount immediately either way, not lazily).
export function ExerciseCard({ userId, datePerformed, source, item, expanded, onToggle, hideVideo, forceExpanded, scrollViewRef }) {
  const targetSets = getTargetSets(item);
  const [rows, setRows] = useState(() => Array.from({ length: targetSets }, () => ({ reps: "", weight: "" })));
  const [notes, setNotes] = useState("");
  // History is fetched lazily off the clock-icon toggle, not on every
  // expand — most sessions never get looked at, and it used to be an
  // always-visible flat "Set 1 / Set 2 / Set 3" block that just ate space.
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null); // null until loaded — see historyLoaded for "loaded but genuinely empty"
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  // Which row's calculator modal is open, if any. The icon itself is always
  // visible next to a weight box (not gated on TextInput focus) — an
  // opacity/pointerEvents toggle keyed off focus turned out to race with
  // the tap itself: tapping the icon blurs the TextInput, and on both web
  // and native that blur can land before the press finishes, hiding the
  // icon out from under the tap. Not worth chasing further; always-visible
  // has no such race.
  const [calcRowIndex, setCalcRowIndex] = useState(null);
  const loaded = useRef(false);
  const debounceRef = useRef(null);
  // The load-on-expand effect below sets rows/notes from whatever's already
  // saved today, which would otherwise immediately re-trigger the autosave
  // effect — this skips exactly that one load-triggered run, not any real edit.
  const skipAutosaveRef = useRef(true);
  // Per-row reps/weight refs (keyed by index via callback refs, since rows
  // is a dynamic-length array — hooks can't be created in a loop) plus one
  // for notes, so a focused field can scroll itself above the keyboard. A
  // single exercise's content is usually short enough to already be visible
  // once the keyboard opens, but a superset's two stacked full cards often
  // aren't — the second (bottom) exercise's fields can end up hidden behind
  // the keyboard with nothing to bring them into view automatically. Native
  // only: ScrollView.scrollResponderScrollNativeHandleToKeyboard relies on
  // Keyboard's real keyboardWillShow event to know the keyboard's on-screen
  // position, which the browser never fires — on web this would either no-op
  // or scroll based on a wrong/stale position, so it's deliberately skipped
  // there rather than risk introducing a bad jump on the PWA.
  const repsRefs = useRef([]);
  const weightRefs = useRef([]);
  const notesRef = useRef(null);

  const scrollFieldIntoView = (ref) => {
    if (Platform.OS === "web" || !scrollViewRef?.current || !ref) return;
    scrollViewRef.current.scrollResponderScrollNativeHandleToKeyboard(ref, 24, true);
  };

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

  const isExpanded = forceExpanded || expanded;

  const handleToggle = () => {
    if (!expanded) loadOnFirstExpand();
    onToggle(item.id);
  };

  // In focus layout there's no header tap to expand from — this card is
  // mounted permanently inside SessionFocusModal and just stays populated
  // from here on.
  useEffect(() => {
    if (forceExpanded) loadOnFirstExpand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpanded]);

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
        isExpanded
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
      {forceExpanded ? (
        <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>
              {item.exercise.name}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 1 }}>{targetLineFor(item)}</Text>
          </View>
        </View>
      ) : (
        <Pressable onPress={handleToggle} className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: expanded ? 15 : 14, color: "#44403c" }}>
              {item.exercise.name}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 1 }}>{targetLineFor(item)}</Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={expanded ? "#a8a29e" : "#d6d3d1"} />
        </Pressable>
      )}

      {isExpanded && (
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

          <View className="mb-3 flex-row flex-wrap items-center" style={{ gap: 16 }}>
            <Pressable
              onPress={handleToggleHistory}
              className="flex-row items-center gap-1.5"
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
            <Pressable
              onPress={() => setShowAllHistory(true)}
              className="flex-row items-center gap-1.5"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Show all history"
            >
              <Ionicons name="list-outline" size={14} color={colors.primary} />
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>Show all history</Text>
            </Pressable>
          </View>
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
                    ref={(el) => {
                      repsRefs.current[i] = el;
                    }}
                    value={row.reps}
                    onChangeText={(v) => updateRow(i, "reps", v)}
                    onFocus={() => scrollFieldIntoView(repsRefs.current[i])}
                    placeholder={item.repScheme?.[i] ?? item.targetReps ?? "reps"}
                    keyboardType="numeric"
                    inputAccessoryViewID={NUMERIC_DONE_ID}
                    placeholderTextColor="#a8a29e"
                    className="flex-1 text-center"
                    style={{ fontFamily: fonts.sans, fontSize: 14, color: "#44403c", height: 44, borderWidth: 1, borderColor: INPUT_BORDER, borderRadius: 10 }}
                  />
                  <View className="flex-1" style={{ position: "relative" }}>
                    <TextInput
                      ref={(el) => {
                        weightRefs.current[i] = el;
                      }}
                      value={row.weight}
                      onChangeText={(v) => updateRow(i, "weight", v)}
                      onFocus={() => scrollFieldIntoView(weightRefs.current[i])}
                      placeholder="weight"
                      keyboardType="decimal-pad"
                      inputAccessoryViewID={NUMERIC_DONE_ID}
                      placeholderTextColor="#a8a29e"
                      className="text-center"
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 14,
                        color: "#44403c",
                        height: 44,
                        borderWidth: 1,
                        borderColor: INPUT_BORDER,
                        borderRadius: 10,
                        paddingRight: 30,
                      }}
                    />
                    <Pressable
                      onPress={() => {
                        Keyboard.dismiss();
                        setCalcRowIndex(i);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
                      accessibilityLabel="Open weight calculator"
                      style={{ position: "absolute", right: 6, top: 0, bottom: 0, justifyContent: "center" }}
                    >
                      <Ionicons name="calculator-outline" size={17} color={colors.primaryOnWhite} />
                    </Pressable>
                  </View>
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
            ref={notesRef}
            value={notes}
            onChangeText={setNotes}
            onFocus={() => scrollFieldIntoView(notesRef.current)}
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

          <ExerciseHistoryModal
            visible={showAllHistory}
            onClose={() => setShowAllHistory(false)}
            userId={userId}
            exerciseId={item.exercise.id}
            exerciseName={item.exercise.name}
          />

          <WeightCalculator
            visible={calcRowIndex !== null}
            onClose={() => setCalcRowIndex(null)}
            onInsert={(value) => updateRow(calcRowIndex, "weight", String(value))}
          />
        </View>
      )}
    </View>
  );
}
