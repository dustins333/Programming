import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getLastLoggedSession, getLoggedSetsForDate, logResult } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";

const AUTOSAVE_DELAY_MS = 900;

function ExerciseCard({ userId, datePerformed, source, item, expanded, onToggle }) {
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
    <View className="mb-3 rounded-lg border border-stone-200 px-4 py-3">
      <Pressable onPress={handleToggle} className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
            {item.exercise.name}
          </Text>
          <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Target: {targetSets} sets × {item.targetReps ?? "–"}
            {item.notes ? ` · ${item.notes}` : ""}
          </Text>
        </View>
        <Text className="text-stone-400">{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded && (
        <View className="mt-3">
          {item.exercise.video_url ? (
            <Pressable
              onPress={() => Linking.openURL(item.exercise.video_url)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={`Watch video for ${item.exercise.name}`}
              className="mb-2 self-start"
            >
              <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                ▶ Watch video
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleToggleHistory}
            className="mb-2 flex-row items-center gap-1.5 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={showHistory ? "Hide last time" : "Show last time"}
          >
            <Ionicons name={showHistory ? "time" : "time-outline"} size={16} color={colors.primaryOnWhite} />
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primaryOnWhite }}>
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
              <View key={i} className="mb-2">
                <View className="flex-row items-center gap-2">
                  <Text className="w-14 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                    Set {i + 1}
                  </Text>
                  <TextInput
                    value={row.reps}
                    onChangeText={(v) => updateRow(i, "reps", v)}
                    placeholder={item.targetReps ?? "reps"}
                    keyboardType="numeric"
                    className="w-20 rounded-lg border border-stone-300 px-2 py-3 text-center"
                    style={{ fontFamily: fonts.sans }}
                  />
                  <TextInput
                    value={row.weight}
                    onChangeText={(v) => updateRow(i, "weight", v)}
                    placeholder="weight"
                    keyboardType="numeric"
                    className="w-20 rounded-lg border border-stone-300 px-2 py-3 text-center"
                    style={{ fontFamily: fonts.sans }}
                  />
                </View>
                {histSet ? (
                  <View className="ml-16 mt-1 self-start rounded-md px-2 py-1" style={{ backgroundColor: "#fdf6f2" }}>
                    <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#8a5140" }}>
                      Last: {histSet.reps ?? "–"} reps{histSet.weight ? ` @ ${histSet.weight}` : ""}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          {showHistory && history?.sets.find((s) => s.notes) ? (
            <Text className="mb-1 text-xs italic text-stone-500" style={{ fontFamily: fonts.sans }}>
              Last time's note: {history.sets.find((s) => s.notes).notes}
            </Text>
          ) : null}

          <Text className="mb-1 mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
            Notes
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="How did it feel? Anything to remember for next time?"
            className="mb-2 min-h-[60px] rounded-lg border border-stone-300 px-3 py-2 text-sm"
            style={{ fontFamily: fonts.sans }}
          />

          <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {saveState === "pending" && "Unsaved changes…"}
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved automatically ✓"}
            {saveState === "error" && "Couldn't save — check your connection."}
          </Text>
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
export function SessionLogger({ userId, datePerformed, source, exercises, isCompleted, onFinalize, hideFinalizeButton }) {
  const [expandedId, setExpandedId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);

  const handleToggle = (id) => setExpandedId((prev) => (prev === id ? null : id));

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
        />
      ))}

      {!hideFinalizeButton && (
        <Pressable
          onPress={handleFinalize}
          disabled={finalizing}
          className="mt-2 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
        >
          <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {finalizing ? "Saving…" : isCompleted ? "Session finalized ✓ (tap to re-finalize)" : "Finalize workout"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
