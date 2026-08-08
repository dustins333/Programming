import { useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../lib/programming/clients";
import { listMessages, sendStaffMessage, markThreadReadByStaff } from "../lib/programming/messages";
import { sendPush } from "../lib/notifications/sendPush";
import { MessageThread } from "./MessageThread";
import { fonts, colors } from "../lib/theme";

// Floating quick-access to a specific client's message thread — drop this
// onto any "someone's screen" coach page (client profile, Nutrition client
// detail, SPC client detail) and it follows that page's client, so opening
// their program, nutrition, or SPC page always surfaces the same button to
// message them, without navigating to the Messages inbox or (on the group
// profile page, which already has an inline Messages card) scrolling down
// to find it. Fully self-contained (owns its own fetch/send state,
// lazy-loaded on open) so it drops into any client page with just a userId
// + clientName, no state lifted from the parent screen. Rendered as the
// last child alongside that page's ScrollView (inside <CoachShell>), so it
// paints on top and — on native, where (coach) has its own bottom tab bar —
// sits within the screen's own content area, naturally above the bar.
//
// IMPORTANT: the idle button must NOT be wrapped in a <Modal> — see
// FloatingMessageBubble.js's header comment for the real-device bug that
// caused (an always-visible transparent Modal swallows touches to
// everything underneath it, including the tab bar, even with
// pointerEvents="box-none"). Only the opened-thread Modal below is a real
// Modal, deliberately — blocking the screen while it's open is the point.
export function CoachMessageBubble({ userId, clientName }) {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [messages, setMessages] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    try {
      setLoadError(null);
      const [memberRow, coachRows, messageRows] = await Promise.all([getUser(userId), listCoaches(), listMessages(userId)]);
      setMember(memberRow);
      setCoaches(coachRows);
      setMessages(messageRows);
      markThreadReadByStaff(userId).catch((err) => console.error("Failed to mark thread read:", err));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setMessages(null);
    load();
  };

  const handleSend = async (body) => {
    await sendStaffMessage(userId, profile.id, body);
    await load();
    // Fire-and-report, not fire-and-forget — same pattern as
    // clients/[userId].js's own handleSendMessage: the message is already
    // posted either way, a failed push here shouldn't look like the send
    // itself failed.
    if (member?.notify_coach_messages !== false) {
      try {
        await sendPush({ userId, title: "Message from your coach", body });
      } catch (err) {
        console.error("Push send failed (message was still posted):", err);
      }
    }
  };

  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));
  const displayName = clientName ?? member?.name ?? "this client";

  if (!userId) return null;

  return (
    <>
      <Pressable
        onPress={handleOpen}
        accessibilityLabel={`Message ${displayName}`}
        style={{
          position: "absolute",
          bottom: insets.bottom + 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 6,
          zIndex: 20,
        }}
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="white" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(68,64,60,0.35)", padding: 20 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{ width: "100%", maxWidth: 480, maxHeight: "80%", backgroundColor: "white", borderRadius: 18, padding: 18 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c", flex: 1, marginRight: 8 }}>
                {displayName}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#78716c" />
              </Pressable>
            </View>
            <MessageThread
              messages={messages}
              loadError={loadError}
              onRetry={load}
              isOwnMessage={(m) => m.sender_role === "staff"}
              labelFor={(m) =>
                m.sender_role === "member" ? displayName : m.sender_id === profile.id ? "You" : coachNameById.get(m.sender_id) ?? "Coach"
              }
              placeholder={`Message ${displayName}…`}
              onSend={handleSend}
              maxHeight={420}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
