import { useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { AddValueBadge } from "./AddValueBadge";
import { colorForTarget } from "../../lib/nutrition/weekCycle";
import { fonts } from "../../lib/theme";
import { useScrollToKeyboard } from "../../lib/scrollToKeyboard";
import { autofillSuppressedRef } from "../../lib/webAutofillSuppression";

// design_handoff_member_mobile_v5 (1g) — one macro as a dial instead of a
// labeled text box. House rule 1: dashed ring = not logged yet, solid =
// logged. The value itself is a real TextInput styled to look like the
// number, so tapping the dial opens the numeric keyboard directly on that
// macro (rather than a sheet or a separate edit mode).
//
// Ring color follows TargetField's existing `liveCompare` rule, not a
// per-macro palette: olive once the value lands inside the same ±10% band
// Weekly's tables use, clay while it's still short. Deliberately never red —
// a daily log fills in cumulatively through the day, so "under" at noon is
// normal, not wrong.
const SIZE = 62;
const STROKE = 5;
const INNER = 48;
const TRACK = "#f0ece6";
const CLAY = "#a46a57";
const OLIVE = "#4d6142";
const DASHED_EMPTY = "#ddd6cd";

// `readOnly` renders the same dial with plain text instead of an input —
// Weekly's expanded day row reuses it to mirror the entry screen exactly
// without making a past day editable in place.
export function MacroDial({ label, value, goal, unit = "g", onChangeText, readOnly, scrollViewRef, scrollOffsetRef }) {
  const fieldRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const empty = value === "" || value === null || value === undefined;
  const onTrack = !empty && colorForTarget(Number(value), goal) === "green";
  const color = onTrack ? OLIVE : CLAY;
  const progress = !empty && goal ? Math.max(0, Math.min(1, Number(value) / goal)) : 0;

  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = SIZE / 2;

  return (
    <View ref={fieldRef} style={{ flex: 1, alignItems: "center" }}>
      <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
        {empty ? (
          <View
            style={{
              position: "absolute",
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: DASHED_EMPTY,
            }}
          />
        ) : (
          <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
            <Circle cx={center} cy={center} r={radius} stroke={TRACK} strokeWidth={STROKE} fill="none" />
            {progress > 0 ? (
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={color}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${circumference * progress} ${circumference}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${center} ${center})`}
              />
            ) : null}
          </Svg>
        )}
        <View
          style={{
            width: INNER,
            height: INNER,
            borderRadius: INNER / 2,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {readOnly ? (
            <Text
              maxFontSizeMultiplier={1.1}
              numberOfLines={1}
              style={{ width: INNER - 4, textAlign: "center", fontFamily: fonts.display, fontSize: 16, color: empty ? "#c9c4bd" : color }}
            >
              {empty ? "–" : value}
            </Text>
          ) : (
            <>
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
                accessibilityLabel={`${label}${goal ? `, goal ${goal}${unit}` : ""}`}
                maxFontSizeMultiplier={1.1}
                style={{
                  width: INNER - 4,
                  textAlign: "center",
                  fontFamily: fonts.display,
                  fontSize: 16,
                  color: empty ? "#c9c4bd" : color,
                  paddingVertical: 4,
                }}
              />
              {empty && !focused ? (
                <AddValueBadge size={24} style={{ position: "absolute", pointerEvents: "none" }} />
              ) : null}
            </>
          )}
        </View>
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#44403c", marginTop: 8 }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e", marginTop: 1 }}
      >
        {goal ? `of ${goal} ${unit}` : "no goal"}
      </Text>
    </View>
  );
}
