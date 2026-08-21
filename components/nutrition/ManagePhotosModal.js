import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { PhotoUpload } from "./PhotoUpload";
import { PhotoSubmissionsEditor } from "./PhotoSubmissionsEditor";
import { fonts, colors } from "../../lib/theme";

// Backfilling an old set and fixing a mistagged angle are both occasional
// housekeeping, and as cards under the comparison they cost the one thing
// this tab actually needs: vertical space for the two photos. Behind a
// button, the compare area gets the whole window.
export function ManagePhotosModal({ visible, userId, photosByDate, onClose, onChanged }) {
  const dateCount = Object.keys(photosByDate ?? {}).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <View className="w-full rounded-2xl bg-white" style={{ maxWidth: 520, maxHeight: "85%" }}>
          <View className="flex-row items-center justify-between px-5 pb-3 pt-5">
            <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.primary }}>Manage photos</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 18, color: "#a8a29e" }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 20 }}>
            <Text
              className="mb-2"
              style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Add an old set
            </Text>
            <Text className="mb-3" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
              Backfill photos taken before this client was on the app. Pick the date they were actually taken, not today.
            </Text>
            <PhotoUpload userId={userId} onUploaded={onChanged} allowDatePick />

            {dateCount > 0 ? (
              <>
                <View className="my-5 h-px" style={{ backgroundColor: "#f0ece6" }} />
                <Text
                  className="mb-2"
                  style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  Fix a day&apos;s photos
                </Text>
                <Text className="mb-3" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                  {dateCount} set{dateCount === 1 ? "" : "s"} on file. Use this if an angle or a weight came in wrong.
                </Text>
                <PhotoSubmissionsEditor photosByDate={photosByDate} onSaved={onChanged} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
