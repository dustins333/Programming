import { Modal, Text, Pressable } from "react-native";
import { fonts } from "../lib/theme";

const CARD_BORDER = "#ece7e1";

// Shown on My Fitness only when it's opened with no specific session
// context (the bottom tab bar, not a My Week bubble) and more than one
// thing is still due this week — e.g. a Flagship session and an SPC
// session both outstanding. Picking one shows it directly, same as an
// explicit deep link would have. Never shown when only one thing (or
// nothing) is outstanding, and never offers one-off workouts — those are
// reached from My Week only.
export function ProgramPickerModal({ visible, options, onSelect, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/40">
        <Pressable onPress={(e) => e.stopPropagation?.()} className="rounded-t-[22px] bg-[#faf8f6] px-5 pb-8 pt-5">
          <Text className="mb-4 text-center" style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>
            What are you logging?
          </Text>
          {options.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => onSelect(opt.focus)}
              className="mb-2.5 rounded-2xl bg-white px-4 py-4"
              style={{ borderWidth: 1, borderColor: CARD_BORDER }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>{opt.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
