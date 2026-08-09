import { Modal, Pressable } from "react-native";

// The house bottom sheet — canvas background, 22px top radius, warm scrim —
// extracted from the ~12 modals that already hand-rolled this exact
// container (SessionDetailModal, WeightCalculator, ExerciseHistoryModal,
// PayrollBottomSheet, …) so the remaining centered-card deviants can
// migrate to one shared primitive instead of a 6-line copy each.
// Member-facing content modals should use this; small option pickers
// (RatingSelect, NativePickerField) deliberately stay centered fades, and
// coach desktop-web dialogs stay centered cards — a bottom sheet is a
// mobile pattern.
export function BottomSheet({ visible, onClose, children, maxHeight = "85%", contentStyle }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[
            {
              maxHeight,
              width: "100%",
              backgroundColor: "#faf8f6",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingTop: 22,
              paddingHorizontal: 20,
              paddingBottom: 24,
            },
            contentStyle,
          ]}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
