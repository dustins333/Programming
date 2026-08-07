import { View, Text, Pressable, Platform, InputAccessoryView, Keyboard } from "react-native";
import { fonts, colors } from "../lib/theme";

// iOS's numeric/number-pad/decimal-pad keyboards render with no Return/Done
// key at all — the only built-in way to dismiss them is tapping outside the
// input, which is easy to miss in a dense form (see SessionLogger's per-set
// reps/weight grid). Multiline text fields have the same problem for a
// different reason: their Return key inserts a newline instead of
// submitting/dismissing (RN's own default `blurOnSubmit=false` for
// multiline), so a coach note or a check-in answer has no built-in dismiss
// either — unlike a plain single-line text field, which already blurs on
// Return via RN's default `blurOnSubmit=true`. This mounts one shared
// "Done" bar above the keyboard for both cases; any numeric or multiline
// TextInput opts in via inputAccessoryViewID={NUMERIC_DONE_ID}. Android's
// IME already has its own dismiss affordance for both cases, so this is
// iOS-only — renders nothing elsewhere.
export const NUMERIC_DONE_ID = "numeric-done-accessory";

export function NumericInputAccessory() {
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={NUMERIC_DONE_ID}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          backgroundColor: "#f4ede3",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: "#e7dfd6",
        }}
      >
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: colors.primaryOnWhite }}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
