import { View, Text, TextInput } from "react-native";
import { MACRO_STYLES } from "./MacroPills";
import { fonts } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";

// A labeled numeric input with the client's current target value shown as a
// small colored pill next to the label — shared by the coach's "set new
// target" form and the member's daily-log form, so both read the same
// target-vs-what-you're-entering context. `current` is the target value (a
// number) or null/undefined to hide the pill; `styleKey` picks the color
// from MacroPills' shared palette.
export function TargetField({ label, styleKey, current, pillLabel = "target", unit = "", value, onChangeText, flex, pct }) {
  const s = MACRO_STYLES[styleKey];
  return (
    // justify-end: when a sibling field in the same flex-row wraps its label
    // to a second line (e.g. a long target pill at a larger Dynamic Type
    // size), the row's default cross-axis "stretch" makes every field the
    // same height — without this, a field with a short single-line label
    // just leaves blank space below its own input instead of matching the
    // taller field's input position. Pushing each field's content to the
    // bottom keeps every input in the row level regardless of label wrap.
    <View className={flex ? "mb-2 flex-1 justify-end" : "mb-2 justify-end"}>
      <View className="mb-1 flex-row flex-wrap items-center gap-1.5">
        <Text maxFontSizeMultiplier={1.3} className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          {label}
        </Text>
        {current !== null && current !== undefined ? (
          <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: s.bg }}>
            {/* A supplementary badge, not primary content — pinned to (near-)no
                scale rather than growing with the label and overlapping it. */}
            <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: s.text }}>
              {pillLabel}: {current}
              {unit}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center rounded-lg border border-stone-300 px-4">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          className="flex-1 py-3 text-base"
          style={{ fontFamily: fonts.sans }}
        />
        {pct !== undefined && pct !== null ? (
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {pct}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
