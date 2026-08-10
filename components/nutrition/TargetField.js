import { useRef } from "react";
import { View, Text, TextInput } from "react-native";
import { MACRO_STYLES } from "./MacroPills";
import { colorForTarget } from "../../lib/nutrition/weekCycle";
import { fonts } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { useScrollToKeyboard } from "../../lib/scrollToKeyboard";
import { autofillSuppressedRef } from "../../lib/webAutofillSuppression";

// Every control that can sit in a shared flex-row with a TargetField has to
// render at exactly this height, or the input boxes don't line up across the
// row — a TextInput sized only by its own padding + font metrics and a web
// <select> sized by its own padding never land on the same number by
// coincidence. RatingSelect imports this for the same reason. minHeight, not
// height, so Dynamic Type can still grow the box rather than clip it.
// 50 is what a TargetField already measures at its default size (1px border +
// py-3 + a 24px line box, measured in the browser) — so this pins the other
// controls to the existing look instead of resizing everything.
export const FIELD_MIN_HEIGHT = 50;

// A labeled numeric input with the client's current target value shown as a
// small colored pill underneath the input box — shared by the coach's "set
// new target" form and the member's daily-log form, so both read the same
// target-vs-what-you're-entering context. `current` is the target value (a
// number) or null/undefined to hide the pill; `styleKey` picks the color
// from MacroPills' shared palette. `scrollViewRef`/`scrollOffsetRef` are
// optional — when the caller's screen relies on manual scroll-to-keyboard
// (lib/scrollToKeyboard.js) instead of automaticallyAdjustKeyboardInsets
// (which can't account for KeyboardDoneButton's floating bar — confirmed
// on a real device it was leaving fields half-hidden behind it), passing
// them wires this field into that same mechanism.
export function TargetField({ label, styleKey, current, pillLabel = "target", unit = "", value, onChangeText, flex, pct, liveCompare, scrollViewRef, scrollOffsetRef }) {
  const s = MACRO_STYLES[styleKey];
  const fieldRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  // Positive-only live feedback (opt-in via liveCompare, the member's daily
  // log): the typed value turns olive once it lands within the same ±10%
  // band Weekly's tables use. Deliberately never red — a daily log fills in
  // cumulatively through the day, so "under" at noon is normal, not wrong.
  const onTrack = liveCompare && value !== "" && colorForTarget(Number(value), current) === "green";
  return (
    <View ref={fieldRef} className={flex ? "mb-2 flex-1" : "mb-2"}>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <View className="flex-row items-center rounded-lg border border-stone-300 px-4" style={{ minHeight: FIELD_MIN_HEIGHT }}>
        <TextInput
          ref={autofillSuppressedRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => scrollFieldIntoView(fieldRef.current)}
          keyboardType="decimal-pad"
          // react-native-web defaults every TextInput to autocomplete="on"
          // when the prop is omitted (confirmed in its TextInput source) —
          // that's an explicit opt-IN to browser autofill, which is what made
          // iOS Safari offer "AutoFill Contact" and paint its blue
          // autofill-target boxes over these macro fields in the installed
          // PWA. Off here (and app-wide via babel/noAutofillPlugin.js) —
          // nobody's protein intake is in their contact card.
          autoComplete="off"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          className="flex-1 py-3 text-base"
          style={{ fontFamily: onTrack ? fonts.sansSemiBold : fonts.sans, color: onTrack ? "#4d6142" : "#44403c" }}
        />
        {onTrack ? (
          <Text maxFontSizeMultiplier={1} style={{ fontSize: 12, color: "#4d6142" }}>
            ✓
          </Text>
        ) : null}
        {pct !== undefined && pct !== null ? (
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {pct}
          </Text>
        ) : null}
      </View>
      {current !== null && current !== undefined ? (
        <View className="mt-1 self-start rounded-full px-1.5 py-0.5" style={{ backgroundColor: s.bg }}>
          <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: s.text }}>
            {pillLabel}: {current}
            {unit}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
