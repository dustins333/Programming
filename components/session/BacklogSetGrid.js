import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { logResult } from "../../lib/programming/memberPlan";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { fonts, colors, type } from "../../lib/theme";
import { CARD_BORDER, CARD_SHADOW, CLAY, DASHED_EMPTY, INK_DEEP, MUTED } from "./SessionSheetParts";

const AUTOSAVE_DELAY_MS = 700;

// design_handoff_member_block_v1 (14b) — set entry for a session that already
// happened and was never logged.
//
// A set is a *column*: reps on top, weight beneath, with the units labelled
// once down the left edge rather than repeated in twelve boxes. Tapping a box
// opens the number pad and moves down the column, so a set is two taps. Empty
// boxes stay dashed — an unfinished set is visible without needing an error
// state.
//
// This is deliberately a thinner surface than the live logger: no rest timer,
// no last-time history, no per-exercise completion. She's catching up on
// something already done, not working through it at a rack.
//
// Persistence is the same per-set upsert the live logger uses (logResult), so
// a back-logged set is indistinguishable from one logged on the day — it just
// carries the date she picked rather than today's.

function SetBox({ value, onChangeText, onSaveNow, accessibilityLabel }) {
  const [focused, setFocused] = useState(false);
  const empty = value === "" || value == null;
  return (
    <View
      style={{
        height: 32,
        borderRadius: 11,
        borderWidth: 1.5,
        borderStyle: empty && !focused ? "dashed" : "solid",
        borderColor: focused || !empty ? CLAY : DASHED_EMPTY,
        backgroundColor: focused || !empty ? "#fffdfb" : "transparent",
        justifyContent: "center",
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onSaveNow();
        }}
        // Coming back to a box that already has a number: the value is
        // selected on focus, so the first keystroke replaces it outright
        // instead of appending to what she typed the first time.
        selectTextOnFocus
        keyboardType="decimal-pad"
        inputAccessoryViewID={NUMERIC_DONE_ID}
        accessibilityLabel={accessibilityLabel}
        placeholder="–"
        placeholderTextColor={colors.hint}
        maxFontSizeMultiplier={1.1}
        style={{
          fontFamily: empty ? fonts.sans : fonts.sansBold,
          fontSize: empty ? 13 : 13.5,
          color: INK_DEEP,
          textAlign: "center",
          paddingVertical: 0,
          height: 30,
        }}
      />
    </View>
  );
}

export function BacklogSetGrid({ userId, exercise, datePerformed, source, session, setCount }) {
  const sets = Math.max(1, setCount ?? 3);
  const [values, setValues] = useState(() => Array.from({ length: sets }, () => ({ reps: "", weight: "" })));
  const timersRef = useRef({});
  // The date can change right up until she starts typing (the sheet locks it
  // on first edit), so the write reads the latest one rather than whatever it
  // closed over.
  const dateRef = useRef(datePerformed);
  useEffect(() => {
    dateRef.current = datePerformed;
  }, [datePerformed]);

  const save = async (setIndex, next) => {
    const row = next[setIndex];
    if (row.reps === "" && row.weight === "") return;
    try {
      await logResult({
        userId,
        exerciseId: exercise.exerciseId,
        datePerformed: dateRef.current,
        setNumber: setIndex + 1,
        reps: row.reps === "" ? null : Number(row.reps),
        weight: row.weight === "" ? null : Number(row.weight),
        source,
        session,
      });
    } catch (err) {
      console.error("Back-log set save failed:", err);
    }
  };

  const update = (setIndex, field, text) => {
    setValues((prev) => {
      const next = prev.map((row, i) => (i === setIndex ? { ...row, [field]: text } : row));
      clearTimeout(timersRef.current[setIndex]);
      timersRef.current[setIndex] = setTimeout(() => save(setIndex, next), AUTOSAVE_DELAY_MS);
      return next;
    });
  };

  const flush = (setIndex) => {
    clearTimeout(timersRef.current[setIndex]);
    setValues((prev) => {
      save(setIndex, prev);
      return prev;
    });
  };

  // Flush anything still pending when this unmounts (sheet closed, date
  // changed) rather than dropping the last keystrokes.
  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 18,
        paddingHorizontal: 15,
        paddingVertical: 13,
        marginBottom: 9,
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
        <Text maxFontSizeMultiplier={1.15} style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 13.5, color: INK_DEEP }}>
          {exercise.name}
        </Text>
        {exercise.detail ? (
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: MUTED, flexShrink: 0 }}>
            {exercise.detail}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 7, alignItems: "flex-end" }}>
        {/* Units labelled once, down the left edge. */}
        <View style={{ width: 28, flexShrink: 0 }}>
          {/* Matches the SET label's height + marginBottom below. */}
          <View style={{ height: 18 }} />
          <View style={{ height: 32, justifyContent: "center" }}>
            <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: type.caption, color: colors.muted }}>
              REP
            </Text>
          </View>
          <View style={{ height: 32, justifyContent: "center", marginTop: 5 }}>
            <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: type.caption, color: colors.muted }}>
              LB
            </Text>
          </View>
        </View>

        {values.map((row, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Text
              maxFontSizeMultiplier={1}
              style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, lineHeight: 14, letterSpacing: 0.8, color: MUTED, textAlign: "center", height: 14, marginBottom: 4 }}
            >
              SET {i + 1}
            </Text>
            <SetBox
              value={row.reps}
              onChangeText={(t) => update(i, "reps", t)}
              onSaveNow={() => flush(i)}
              accessibilityLabel={`${exercise.name} set ${i + 1} reps`}
            />
            <View style={{ marginTop: 5 }}>
              <SetBox
                value={row.weight}
                onChangeText={(t) => update(i, "weight", t)}
                onSaveNow={() => flush(i)}
                accessibilityLabel={`${exercise.name} set ${i + 1} weight`}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
