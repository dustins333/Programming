import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Linking, ActivityIndicator } from "react-native";
import { getLastLoggedSession, getLoggedSetsForDate, logResult } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";

const AUTOSAVE_DELAY_MS = 900;

function ExerciseCard({ userId, datePerformed, source, item, expanded, onToggle }) {
  const targetSets = item.targetSets && item.targetSets > 0 ? item.targetSets : 3;
  const [rows, setRows] = useState(() => Array.from({ length: targetSets }, () => ({ reps: "", weight: "" })));
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState(undefined); // undefined = not loaded yet, null = no prior session
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
    const [last, todaysSets] = await Promise.all([
      getLastLoggedSession(userId, item.exercise.id, datePerformed),
      getLoggedSetsForDate(userId, item.exercise.id, datePerformed),
    ]);
    setHistory(last);
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

          <View className="mb-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: "#faf7f4", borderWidth: 1, borderColor: "#f0ebe6" }}>
            <Text className="mb-1 text-xs uppercase" style={{ fontFamily: fonts.sansSemiBold, color: "#8a5140", letterSpacing: 0.3 }}>
              Last time
            </Text>
            {history === undefined ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : history === null ? (
              <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                No previous history for this lift yet.
              </Text>
            ) : (
              <>
                <Text className="text-xs text-stone-600" style={{ fontFamily: fonts.sans }}>
                  {formatDateMDY(history.date)} —{" "}
                  {history.sets
                    .map((s) => `Set ${s.set_number}: ${s.reps ?? "–"} reps${s.weight ? ` @ ${s.weight}` : ""}`)
                    .join(" · ")}
                </Text>
                {history.sets.find((s) => s.notes) ? (
                  <Text className="mt-1 text-xs italic text-stone-500" style={{ fontFamily: fonts.sans }}>
                    Note: {history.sets.find((s) => s.notes).notes}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {rows.map((row, i) => (
            <View key={i} className="mb-2 flex-row items-center gap-2">
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
          ))}

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
export function SessionLogger({ userId, datePerformed, source, exercises, isCompleted, onFinalize }) {
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

      <Pressable
        onPress={handleFinalize}
        disabled={finalizing}
        className="mt-2 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
      >
        <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {finalizing ? "Saving…" : isCompleted ? "Session finalized ✓ (tap to re-finalize)" : "Finalize workout"}
        </Text>
      </Pressable>
    </View>
  );
}
