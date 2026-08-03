import { View, Text, TextInput } from "react-native";
import { MACRO_STYLES } from "./MacroPills";
import { fonts } from "../../lib/theme";

// A labeled numeric input with the client's current target value shown as a
// small colored pill next to the label — shared by the coach's "set new
// target" form and the member's daily-log form, so both read the same
// target-vs-what-you're-entering context. `current` is the target value (a
// number) or null/undefined to hide the pill; `styleKey` picks the color
// from MacroPills' shared palette.
export function TargetField({ label, styleKey, current, pillLabel = "target", unit = "", value, onChangeText, flex }) {
  const s = MACRO_STYLES[styleKey];
  return (
    <View className={flex ? "mb-2 flex-1" : "mb-2"}>
      <View className="mb-1 flex-row items-center gap-1.5">
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          {label}
        </Text>
        {current !== null && current !== undefined ? (
          <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: s.bg }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: s.text }}>
              {pillLabel}: {current}
              {unit}
            </Text>
          </View>
        ) : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        className="rounded-lg border border-stone-300 px-4 py-3 text-base"
        style={{ fontFamily: fonts.sans }}
      />
    </View>
  );
}
