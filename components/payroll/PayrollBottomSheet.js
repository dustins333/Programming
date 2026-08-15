// One shell for every sheet in the Log flow — hours, names, SPC, Other.
// Grabber, title, optional subtitle naming the day being edited, one job,
// one full-width primary at the bottom. Before this each sheet drew its own
// header and its own save button, so no two of them agreed on where the
// title sat or how the primary was sized.
//
// It's an inset card rather than the edge-to-edge sheet used in the member
// app: these are short, single-purpose sheets, and floating the card keeps
// the day underneath visible at the top of the screen. Still a real bottom
// sheet — anchored to the bottom, slides up over a scrim — so the gesture
// and the dismissal are unchanged.
//
// KeyboardAvoidingView plus a locally-mounted KeyboardDoneButton, since a
// floating "Done" bar can't cross a native Modal's own window boundary.
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, colors } from "../../lib/theme";
import { KeyboardDoneButton } from "../KeyboardDoneButton";

export function PayrollBottomSheet({ visible, onClose, title, subtitle, children, maxHeight = "88%" }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(42,33,28,0.35)" }}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              marginHorizontal: 16,
              marginBottom: Math.max(insets.bottom, 16),
              maxHeight,
              backgroundColor: "white",
              borderWidth: 1,
              borderColor: "#ece7e1",
              borderRadius: 22,
              paddingTop: 14,
              paddingHorizontal: 18,
              paddingBottom: 18,
              shadowColor: "#2a211c",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.05,
              shadowRadius: 18,
            }}
          >
            {/* Purely a grab affordance — dismissal is the scrim or the
                primary action, so it isn't a button and doesn't need to be. */}
            <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: "#e2dbd4", alignSelf: "center", marginBottom: 14 }} />
            {title ? <Text style={{ fontSize: 15, fontFamily: fonts.sansBold, color: "#2a211c" }}>{title}</Text> : null}
            {subtitle ? (
              <Text style={{ fontSize: 11.5, fontFamily: fonts.sans, color: "#a8a29e", marginTop: 2 }}>{subtitle}</Text>
            ) : null}
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 14 }}>
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
      <KeyboardDoneButton />
    </Modal>
  );
}

// The small uppercase group label ("HOURS", "ATTENDEES", "WHO CAME").
// `trailing` carries the quiet right-hand note some groups need, e.g.
// "Optional" or a running "2 of 2" count.
export function SheetLabel({ children, trailing }) {
  return (
    <View className="mb-1.5 flex-row items-baseline justify-between">
      <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 9.5, fontFamily: fonts.sansBold, letterSpacing: 0.95, color: "#a8a29e" }}>
        {children}
      </Text>
      {trailing ? (
        <Text style={{ fontSize: 10.5, fontFamily: fonts.sansMedium, color: "#b5aea7" }}>{trailing}</Text>
      ) : null}
    </View>
  );
}

export function SheetField({ label, children }) {
  return (
    <View className="mb-3.5">
      <SheetLabel>{label}</SheetLabel>
      {children}
    </View>
  );
}

// One full-width primary per sheet. The label says what it will do
// ("Save 1h 30m", "Log session") rather than a bare "Save", so the sheet can
// be confirmed without re-reading the fields above it.
export function SheetSaveButton({ label = "Save", onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="mt-1 items-center"
      style={{ backgroundColor: colors.primary, borderRadius: 13, paddingVertical: 13, opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Only when editing an existing repeatable entry (an SPC session, an Other
// line item) — deliberately quiet, not a second primary.
export function SheetDeleteButton({ label = "Delete", onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} className="mt-2 items-center py-2.5" style={{ opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#b23a22" }}>{label}</Text>
    </Pressable>
  );
}

// A numbered name row, shared by the names sheet and the SPC sheet so the
// two can't drift. `onRemove` renders the × and `onAdd` renders the +; a row
// gets one or the other, never both.
export function SheetNameRow({ index, value, onChangeText, placeholder, onRemove, onAdd, editable = true }) {
  const isAddRow = Boolean(onAdd);
  return (
    <View className="mb-2 flex-row items-center" style={{ gap: 9 }}>
      <View
        className="items-center justify-center"
        style={{
          width: 20,
          height: 20,
          borderRadius: 99,
          backgroundColor: isAddRow ? "transparent" : "#f4ede3",
          borderWidth: isAddRow ? 1 : 0,
          borderColor: "#ddd6cf",
          borderStyle: isAddRow ? "dashed" : "solid",
        }}
      >
        <Text maxFontSizeMultiplier={1} style={{ fontSize: 10, fontFamily: fonts.sansBold, color: isAddRow ? "#c8c2bb" : "#8a5a2e" }}>
          {index}
        </Text>
      </View>
      {/* The add row is a target, not a field — tapping anywhere along it
          appends a row, so the + isn't the only 30px place that works. */}
      {isAddRow ? (
        <Pressable
          onPress={onAdd}
          style={{
            flex: 1,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: "#e2dbd4",
            borderStyle: "dashed",
            backgroundColor: "white",
            paddingVertical: 10,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b5aea7" }}>{placeholder}</Text>
        </Pressable>
      ) : (
        <View style={{ flex: 1, borderRadius: 11, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "#faf8f6" }}>
          <SheetTextInput value={value} onChangeText={onChangeText} placeholder={placeholder} editable={editable} />
        </View>
      )}
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={6}
          accessibilityLabel={`Remove row ${index}`}
          className="items-center justify-center"
          style={{ width: 30, height: 30, borderRadius: 99, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}
        >
          <Text style={{ fontSize: 13, color: "#b23a22", fontFamily: fonts.sansMedium }}>×</Text>
        </Pressable>
      ) : null}
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          hitSlop={6}
          accessibilityLabel="Add another row"
          className="items-center justify-center"
          style={{ width: 30, height: 30, borderRadius: 99, borderWidth: 1, borderColor: "#ead9cd", backgroundColor: "#fdf6f2" }}
        >
          <Text style={{ fontSize: 14, color: "#8a5140", fontFamily: fonts.sansSemiBold }}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Kept out of SheetNameRow's own JSX so the plain text fields elsewhere in
// these sheets (the SPC note, an Other item's note) look identical to the
// name rows without duplicating the styling.
export function SheetTextInput({ value, onChangeText, placeholder, multiline, editable = true, style }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#b5aea7"
      multiline={multiline}
      editable={editable}
      style={[
        {
          fontFamily: fonts.sans,
          fontSize: 13,
          color: "#44403c",
          paddingVertical: 10,
          paddingHorizontal: 12,
          ...(multiline ? { minHeight: 62, textAlignVertical: "top" } : null),
        },
        style,
      ]}
    />
  );
}
