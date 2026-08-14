import { Modal, View, Text, Pressable, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GraphicImage } from "./GraphicImage";
import { fonts, colors } from "../lib/theme";

// Shown once per due-and-unseen announcement (see lib/programming/
// announcements.js's listDueUnseenAnnouncementsForUser/acknowledgeAnnouncement)
// — pops up the next time a member opens the app after a coach sends or
// schedules a gym-wide note. Same visual pattern as
// nutrition/MilestoneCongratsModal.js, just title/message instead of a
// fixed "Congrats!" copy — only the title shows anywhere else (push
// notification banners, if the device has one registered); the message body
// only ever shows here.
//
// requires_reload (set on the compose form for a functional/code-update
// announcement) swaps the single "Got it" button for a real "Refresh now" /
// "I'll do it later" pair — web only, since a native rebuild can't be
// pushed by a page reload the way a stale PWA tab can.
export function AnnouncementModal({ announcement, onClose, onRefresh, onViewEvent }) {
  const showRefresh = Boolean(announcement?.requires_reload) && Platform.OS === "web";
  // Set when this announcement was fired by publishing an event.
  const showViewEvent = Boolean(announcement?.event_id) && !showRefresh;
  return (
    <Modal visible={!!announcement} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View className="w-full max-w-sm rounded-2xl bg-white px-6 py-8" style={{ maxHeight: "85%" }}>
          {/* Scrolls, with the buttons pinned below it — a graphic plus a
              long message can now exceed a small phone's screen, and a
              popup whose only dismiss control is off-screen is a trap.
              flexGrow 0 / flexShrink 1 rather than the default: RNW's
              ScrollView carries its own flex:1, which would stretch even a
              two-line announcement's card to the full 85%. */}
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ alignItems: "center" }}
            showsVerticalScrollIndicator={false}
          >
            {announcement?.image_path ? (
              // The graphic is the visual anchor when there is one —
              // stacking the megaphone badge above it reads as two
              // competing headers.
              <View className="mb-4 w-full">
                {/* maxHeight is the real bound here, so minRatio is left
                    permissive — a 9:16 story export renders at its true
                    shape rather than being letterboxed into a squarer box. */}
                <GraphicImage path={announcement.image_path} minRatio={0.5} maxHeight={260} />
              </View>
            ) : (
              <View className="mb-4 items-center justify-center rounded-full" style={{ width: 56, height: 56, backgroundColor: "#fdf6f2" }}>
                <Ionicons name="megaphone" size={26} color={colors.primaryOnWhite} />
              </View>
            )}
            <Text className="mb-2 text-center text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              {announcement?.title}
            </Text>
            <Text className="text-center" style={{ fontFamily: fonts.sans, color: "#57534e" }}>
              {announcement?.message}
            </Text>
          </ScrollView>

          <View className="items-center pt-6">
            {showRefresh ? (
              <>
                <Pressable onPress={onRefresh} className="items-center rounded-lg px-6 py-3" style={{ backgroundColor: colors.primary }}>
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                    Refresh now
                  </Text>
                </Pressable>
                <Pressable onPress={onClose} className="mt-3 items-center">
                  <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c", fontSize: 13 }}>I'll do it later</Text>
                </Pressable>
              </>
            ) : showViewEvent ? (
              <>
                <Pressable onPress={onViewEvent} className="items-center rounded-lg px-6 py-3" style={{ backgroundColor: colors.primary }}>
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                    View details
                  </Text>
                </Pressable>
                <Pressable onPress={onClose} className="mt-3 items-center">
                  <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c", fontSize: 13 }}>Not now</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={onClose} className="items-center rounded-lg px-6 py-3" style={{ backgroundColor: colors.primary }}>
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  Got it
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
