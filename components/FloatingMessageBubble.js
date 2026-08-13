import { useCallback, useEffect, useState } from "react";
import { AppState, Modal, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/AuthProvider";
import { listMessages, sendMemberMessage, markThreadReadByMember, hasUnreadMessages } from "../lib/programming/messages";
import { isMessagingEnabledForUser } from "../lib/programming/messagingSettings";
import { useShowMessageBubble } from "../lib/messageBubblePref";
import { MessageThread } from "./MessageThread";
import { fonts, colors } from "../lib/theme";

// Always-available quick access to the member's coach thread — a small
// floating circle pinned above the tab bar on every (member) screen.
// Tapping it opens the same thread the header chat icon/`/messages` route
// reach, as a bottom-sheet overlay instead of a navigation — closing it
// returns to whatever was on screen, no route change involved. Mounted once
// in app/(member)/_layout.js as a sibling of <Tabs>, same scoping as
// AnnouncementChecker (both member screens and a staff account's
// "My Training" view land there) — but rendered AFTER <Tabs> specifically
// so it paints above the tab bar (later JSX = later paint = on top for
// overlapping siblings).
//
// IMPORTANT: the idle button must NOT be wrapped in a <Modal>, even a
// transparent one with pointerEvents="box-none" on its container — that was
// the first version, and it broke real-device interaction: a Modal
// presents as its own native overlay window, and the tab bar underneath it
// stopped responding to taps at all (reported directly: "covering the
// taskbar, and it makes the screen freeze"). A plain position:"absolute"
// element has no such layer — only its own small footprint intercepts
// touches, nothing else on screen is affected. The Modal below, for the
// opened thread sheet, is fine and deliberate — blocking the screen while
// it's open is the whole point of a bottom-sheet overlay, and it's only
// ever open for as long as the user keeps it open.
//
// Can be turned off via Settings (lib/messageBubblePref.js, device-local
// only, confirmed with Terra) — the header chat icon and `/messages` route
// are left completely alone as a fallback either way, so turning the bubble
// off never removes messaging access outright.
//
// Also gated on the admin-configured messaging kill switch/audience
// (lib/programming/messagingSettings.js) — added after Terra flagged the
// feature isn't necessarily ready to ship yet (still deciding where
// messages get watched: in-app vs GHL). Defaults to hidden (`enabled` starts
// null) until the check resolves, so there's no flash-then-hide.
export function FloatingMessageBubble() {
  const { profile } = useAuth();
  const showBubble = useShowMessageBubble();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [enabled, setEnabled] = useState(null);

  useEffect(() => {
    if (!profile?.id) return;
    isMessagingEnabledForUser(profile.id)
      .then(setEnabled)
      .catch((err) => {
        console.error("Failed to check messaging settings:", err);
        setEnabled(false);
      });
  }, [profile?.id]);

  // Re-checked on every foreground transition, not just on mount. This
  // component is mounted once at the layout level, so expo-router's
  // useFocusEffect doesn't apply the way it does for a per-tab screen —
  // without this the unread dot never appeared for a message that arrived
  // after launch, and never cleared if the member read the thread through
  // the header icon route instead of the bubble. Same shape as
  // AnnouncementChecker's own AppState fix.
  const checkUnread = useCallback(() => {
    if (!profile?.id) return;
    hasUnreadMessages(profile.id)
      .then(setHasUnread)
      .catch((err) => console.error("Failed to check unread messages:", err));
  }, [profile?.id]);

  useEffect(() => {
    checkUnread();
  }, [checkUnread]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") checkUnread();
    });
    return () => subscription.remove();
  }, [checkUnread]);

  const load = async () => {
    try {
      setLoadError(null);
      setMessages(await listMessages(profile.id));
      setHasUnread(false);
      markThreadReadByMember().catch((err) => console.error("Failed to mark thread read:", err));
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
    await sendMemberMessage(profile.id, body);
    await load();
  };

  if (!profile?.id || !showBubble || !enabled) return null;

  return (
    <>
      <Pressable
        onPress={handleOpen}
        accessibilityLabel="Message your coach"
        style={{
          position: "absolute",
          bottom: insets.bottom + 74,
          right: 16,
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
        {hasUnread ? (
          <View
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 11,
              height: 11,
              borderRadius: 6,
              backgroundColor: "#b23a22",
              borderWidth: 2,
              borderColor: colors.primary,
            }}
          />
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", justifyContent: "flex-end" }}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              backgroundColor: "#faf8f6",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              maxHeight: "80%",
              paddingTop: 16,
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 20 }}>Messages</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#78716c" />
              </Pressable>
            </View>
            <MessageThread
              messages={messages}
              loadError={loadError}
              onRetry={load}
              isOwnMessage={(m) => m.sender_role === "member"}
              labelFor={(m) => (m.sender_role === "member" ? "You" : "Coach")}
              placeholder="Message your coach…"
              onSend={handleSend}
              maxHeight={420}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
