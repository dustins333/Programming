import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Modal } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { KeyboardDoneButton } from "../KeyboardDoneButton";

// A true centered popup (not a bottom sheet, per explicit ask — every other
// modal in this app slides up from the bottom) for entering a Cronometer
// calorie figure that should win over the macro-derived calculation for the
// day. Mirrors MilestoneCongratsModal.js/nutrition/checkin.js's
// SkipReasonModal for the centered-dialog shape (rgba scrim, rounded-2xl
// white card, fade animation) — those are the only two centered-dialog
// precedents in the app, everything else is a bottom sheet.
export function CalorieOverrideModal({ visible, initialValue, onClose, onOverride }) {
  const [text, setText] = useState(initialValue ?? "");

  useEffect(() => {
    if (visible) setText(initialValue ?? "");
  }, [visible, initialValue]);

  const hasExistingOverride = initialValue !== null && initialValue !== undefined && String(initialValue).trim() !== "";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <Pressable onPress={(e) => e.stopPropagation()} className="w-full rounded-2xl bg-white p-5" style={{ maxWidth: 420 }}>
          <Text className="mb-2 text-base" style={{ fontFamily: fonts.sansBold, color: "#292524" }}>
            Cronometer calories
          </Text>
          <Text className="mb-4 text-sm text-stone-600" style={{ fontFamily: fonts.sans, lineHeight: 20 }}>
            Sometimes the calories shown in Cronometer can differ from the calculated amount. If you would prefer, you can enter in the
            calories from Cronometer below.
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="numeric"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            placeholder="Calories"
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3 text-base"
            style={{ fontFamily: fonts.sans }}
          />
          <View className="flex-row items-center justify-between">
            {hasExistingOverride ? (
              <Pressable onPress={() => onOverride("")} hitSlop={8}>
                <Text className="text-sm" style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>
                  Use calculated instead
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View className="flex-row items-center gap-3">
              <Pressable onPress={onClose} hitSlop={8} className="px-2 py-2">
                <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => onOverride(text.trim())}
                disabled={!text.trim()}
                className="rounded-lg px-4 py-2.5 disabled:opacity-50"
                style={{ backgroundColor: colors.primary }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "white" }}>Override</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
      <KeyboardDoneButton />
    </Modal>
  );
}
