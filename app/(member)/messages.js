import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { listMessages, sendMemberMessage, markThreadReadByMember } from "../../lib/programming/messages";
import { MessageThread } from "../../components/MessageThread";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";

// Reached via the chat-bubble icon on My Week's header (app/(member)/index.js),
// same not-its-own-tab pattern as settings.js. One flat thread with
// whichever coach replies — matches this app's "all coaches see all
// clients" design, so there's no per-coach selector here.
export default function Messages() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setMessages(await listMessages(profile.id));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [profile.id]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Opening this screen is what clears the unread flag — standard
      // chat-app behavior, no explicit "mark read" button needed here (that's
      // only asked for on the coach's inbox, where a thread can be marked
      // read without opening it). Fire-and-forget: a failure here shouldn't
      // block the thread itself from loading.
      markThreadReadByMember().catch((err) => console.error("Failed to mark thread read:", err));
    }, [load])
  );

  const handleSend = async (body) => {
    await sendMemberMessage(profile.id, body);
    await load();
  };

  return (
    <View className="flex-1 px-5 pb-8" style={{ backgroundColor: CANVAS, paddingTop: insets.top + 12 }}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.push("/(member)"))}
        className="mb-3 self-start"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>
      <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Messages
      </Text>
      <MessageThread
        messages={messages}
        loadError={loadError}
        onRetry={load}
        isOwnMessage={(m) => m.sender_role === "member"}
        labelFor={(m) => (m.sender_role === "member" ? "You" : "Coach")}
        placeholder="Message your coach…"
        onSend={handleSend}
        fill
      />
    </View>
  );
}
