// Shared bottom-sheet shell for every payroll tile popup — mirrors
// WeightCalculator.js's canonical Modal/backdrop/sheet shape exactly
// (slide-up, tap-outside-to-dismiss backdrop, canvas-tinted sheet,
// KeyboardAvoidingView + a locally-mounted KeyboardDoneButton since a
// floating "Done" bar can't cross a native Modal's own window boundary).
import { Modal, View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { KeyboardDoneButton } from "../KeyboardDoneButton";

export function PayrollBottomSheet({ visible, onClose, title, children, maxHeight = "85%" }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{ maxHeight, width: "100%", backgroundColor: colors.canvas, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 28 }}
          >
            <View className="mb-3 flex-row items-center justify-between">
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: "#44403c" }}>{title}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="items-center justify-center"
                style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e7e5e4" }}
              >
                <Text style={{ color: "#a8a29e", fontSize: 15 }}>×</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
      <KeyboardDoneButton />
    </Modal>
  );
}

export function SheetField({ label, children }) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function SheetSaveButton({ label = "Save", onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="mt-2 items-center rounded-xl px-5 py-3.5"
      style={{ backgroundColor: colors.primary, opacity: disabled ? 0.6 : 1 }}
    >
      <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Shown only when editing an existing repeatable entry (SPC session, Other
// line item) — a lighter-weight companion to SheetSaveButton, not styled as
// a primary action.
export function SheetDeleteButton({ label = "Delete", onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} className="mt-2 items-center rounded-xl px-5 py-3" style={{ opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>{label}</Text>
    </Pressable>
  );
}
