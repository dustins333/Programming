import { Modal, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDateTimeInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

// Generic "view a completed milestone's details" popup — tapped from its
// emoji, whether that's on the Nutrition Today tab's slider card or a My
// History row. Distinct from MilestoneCongratsModal, which is a one-time
// "you just completed this" notification, not a reusable detail view.
export function MilestoneDetailModal({ milestone, onClose }) {
  return (
    <Modal visible={!!milestone} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm items-center rounded-2xl bg-white px-6 py-8">
          <View className="mb-4 items-center justify-center rounded-full" style={{ width: 56, height: 56, backgroundColor: "#eef1e7" }}>
            {milestone?.emoji ? (
              <Text style={{ fontSize: 28 }}>{milestone.emoji}</Text>
            ) : (
              <Ionicons name="trophy" size={28} color="#4d6142" />
            )}
          </View>
          <Text className="mb-2 text-center text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
            {milestone?.title}
          </Text>
          {milestone?.details ? (
            <Text className="mb-3 text-center" style={{ fontFamily: fonts.sans, color: "#57534e" }}>
              {milestone.details}
            </Text>
          ) : null}
          {milestone?.completed_at ? (
            <Text className="mb-6 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              Completed {formatDateTimeInBoise(milestone.completed_at)}
            </Text>
          ) : null}
          <Pressable onPress={onClose} className="items-center rounded-lg px-6 py-3" style={{ backgroundColor: colors.primary }}>
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              Close
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
