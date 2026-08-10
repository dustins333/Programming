import { View, Pressable, Text, Keyboard, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useKeyboardHeight } from "../lib/scrollToKeyboard";
import { useAccessoryAction } from "../lib/keyboardAccessory";
import { fonts, colors } from "../lib/theme";

// Floating replacement for the old InputAccessoryView-based "Done" bar
// (NumericInputAccessory.js — its NUMERIC_DONE_ID export and the
// inputAccessoryViewID props pointing at it are left in place across the
// app, harmless no-ops now, not worth a churny removal pass). Confirmed on
// a real device — both the dev client and a real TestFlight build — that
// InputAccessoryView never renders at all under this app's New Architecture
// setup (newArchEnabled: true, app.json). What looked like a working "Done"
// bar during earlier testing was actually Safari's own built-in input
// toolbar on the installed PWA — a browser feature that has nothing to do
// with any app code, and was never present in the native app.
//
// A plain floating overlay can't cross a native <Modal>'s own window
// boundary, so this needs its own mount point inside every Modal that has a
// numeric or multiline field — it is NOT enough to mount this once at the
// app root. app/_layout.js's mount covers every non-Modal screen; each
// Modal-rendering component with an affected field needs its own copy
// (SessionFocusModal, WeightCalculator, ExerciseFormModal,
// NewGroupProgramModal, MilestoneFormModal, PhotoSubmissionsEditor, the
// PopupModal in nutrition/checkin.js, as of this writing — grep this file's
// name for the current list).
export function KeyboardDoneButton() {
  const keyboardHeight = useKeyboardHeight();
  // Contributed by whichever field is focused (lib/keyboardAccessory.js) —
  // today that's the weight fields inside a live logging session offering
  // the plate calculator. Nothing else registers one, so every other
  // keyboard in the app still gets a plain Done bar.
  const action = useAccessoryAction();
  if (Platform.OS !== "ios" || keyboardHeight === 0) return null;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: keyboardHeight, zIndex: 1000 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#f4ede3",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: "#e7dfd6",
        }}
      >
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={action.label}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            <Ionicons name={action.icon ?? "calculator-outline"} size={17} color={colors.primaryOnWhite} />
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: colors.primaryOnWhite }}>{action.label}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: colors.primaryOnWhite }}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
