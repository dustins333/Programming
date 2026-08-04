import { Modal, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";

// Shown once per completed-and-unseen milestone (see lib/nutrition/
// milestones.js's getUnseenCompletedMilestone/acknowledgeMilestone) — pops
// up the next time the client opens the nutrition Today tab after their
// coach closes one out.
export function MilestoneCongratsModal({ milestone, onClose }) {
  return (
    <Modal visible={!!milestone} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View className="w-full max-w-sm items-center rounded-2xl bg-white px-6 py-8">
          <View className="mb-4 items-center justify-center rounded-full" style={{ width: 56, height: 56, backgroundColor: "#eef1e7" }}>
            <Ionicons name="trophy" size={28} color="#4d6142" />
          </View>
          <Text className="mb-2 text-center text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
            Congrats!
          </Text>
          <Text className="mb-6 text-center" style={{ fontFamily: fonts.sans, color: "#57534e" }}>
            You completed the "{milestone?.title}" milestone!
          </Text>
          <Pressable onPress={onClose} className="items-center rounded-lg px-6 py-3" style={{ backgroundColor: colors.primary }}>
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              Nice!
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
