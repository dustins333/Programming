import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../../../lib/programming/clients";
import {
  listThreadSummaries,
  listMessages,
  sendStaffMessage,
  markThreadReadByStaff,
  markThreadUnreadByStaff,
} from "../../../lib/programming/messages";
import { sendPush } from "../../../lib/notifications/sendPush";
import { MessageThread } from "../../../components/MessageThread";
import { CoachShell } from "../../../components/CoachShell";
import { formatDateTimeInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";

const isWeb = Platform.OS === "web";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name }) {
  return (
    <View className="items-center justify-center rounded-full" style={{ width: 38, height: 38, backgroundColor: "#fdf6f2" }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: colors.primaryOnWhite }}>{initials(name)}</Text>
    </View>
  );
}

// One roster-style row per client thread — mirrors clients/index.web.js's
// row shape (avatar, name, a pill), plus a message preview/timestamp and an
// explicit mark read/unread control (Terra's ask: don't have to open a
// thread just to clear or restore its unread state).
function ThreadRow({ item, active, onSelect, onToggleRead }) {
  return (
    <Pressable
      onPress={() => onSelect(item.userId)}
      className="flex-row items-center gap-3.5 px-[18px] py-4"
      style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1", backgroundColor: active ? "#fdf6f2" : "white" }}
    >
      <Avatar name={item.clientName} />
      <View className="flex-1" style={{ minWidth: 0 }}>
        <View className="flex-row items-center gap-2">
          {item.unread ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#b23a22" }} /> : null}
          <Text style={{ fontFamily: item.unread ? fonts.sansBold : fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700" numberOfLines={1}>
            {item.clientName}
          </Text>
        </View>
        <Text className="mt-0.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }} numberOfLines={1}>
          {item.lastSenderRole === "staff" ? "You: " : ""}
          {item.lastMessage}
        </Text>
        <Text className="mt-0.5 text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 11 }}>
          {formatDateTimeInBoise(item.lastMessageAt)}
        </Text>
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onToggleRead(item);
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: colors.primaryOnWhite }}>
          {item.unread ? "Mark as read" : "Mark as unread"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

export default function CoachMessagesInbox() {
  const { profile } = useAuth();
  const router = useRouter();
  const [summaries, setSummaries] = useState(null);
  const [summariesError, setSummariesError] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [messages, setMessages] = useState(null);
  const [messagesError, setMessagesError] = useState(null);

  const loadSummaries = useCallback(async () => {
    try {
      setSummariesError(null);
      const [summaryRows, coachRows] = await Promise.all([listThreadSummaries(), listCoaches()]);
      setSummaries(summaryRows);
      setCoaches(coachRows);
    } catch (err) {
      setSummariesError(err.message ?? String(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSummaries();
    }, [loadSummaries])
  );

  const loadThread = useCallback(async (userId) => {
    try {
      setMessagesError(null);
      const [memberRow, messageRows] = await Promise.all([getUser(userId), listMessages(userId)]);
      setSelectedMember(memberRow);
      setMessages(messageRows);
      // Opening a thread marks it read, same as tapping the icon on the
      // member side — a coach reading the messages shouldn't also have to
      // remember to click "Mark as read".
      await markThreadReadByStaff(userId);
      await loadSummaries();
    } catch (err) {
      setMessagesError(err.message ?? String(err));
    }
  }, [loadSummaries]);

  const selectThread = (userId) => {
    setSelectedUserId(userId);
    setMessages(null);
    setSelectedMember(null);
    loadThread(userId);
  };

  const handleToggleRead = async (item) => {
    try {
      if (item.unread) {
        await markThreadReadByStaff(item.userId);
      } else {
        await markThreadUnreadByStaff(item.userId);
      }
      await loadSummaries();
    } catch (err) {
      toastError("Failed to update thread", err);
    }
  };

  const handleSend = async (body) => {
    await sendStaffMessage(selectedUserId, profile.id, body);
    await loadThread(selectedUserId);
    // Fire-and-report, not fire-and-forget — same pattern as
    // clients/[userId].js's own handleSendMessage: the message is already
    // posted either way, a failed push here shouldn't look like the send
    // itself failed.
    if (selectedMember?.notify_coach_messages !== false) {
      try {
        await sendPush({ userId: selectedUserId, title: "Message from your coach", body });
      } catch (err) {
        console.error("Push send failed (message was still posted):", err);
      }
    }
  };

  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));

  const listPane = (
    <View style={isWeb ? { width: 340, borderRightWidth: 1, borderRightColor: "#ece7e1" } : { flex: 1 }}>
      {summariesError ? (
        <View className="items-start p-6">
          <Text className="mb-2 text-red-600" style={{ fontFamily: fonts.sans }}>
            {summariesError}
          </Text>
          <Pressable onPress={loadSummaries}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      ) : !summaries ? (
        <View className="items-center justify-center p-10">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : summaries.length === 0 ? (
        <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          No client conversations yet.
        </Text>
      ) : (
        <ScrollView>
          {summaries.map((item) => (
            <ThreadRow
              key={item.userId}
              item={item}
              active={isWeb && item.userId === selectedUserId}
              onSelect={selectThread}
              onToggleRead={handleToggleRead}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  const threadPane = selectedUserId ? (
    <View style={{ flex: 1, padding: isWeb ? 24 : 0 }}>
      {!isWeb ? (
        <Pressable onPress={() => setSelectedUserId(null)} className="mb-3 flex-row items-center gap-1 px-5 pt-5" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ All conversations</Text>
        </Pressable>
      ) : null}
      <View className={isWeb ? undefined : "px-5"}>
        <Text className="mb-3" style={{ fontFamily: fonts.sansBold, fontSize: 16 }}>
          {selectedMember?.name ?? "…"}
        </Text>
        <MessageThread
          messages={messages}
          loadError={messagesError}
          onRetry={() => loadThread(selectedUserId)}
          isOwnMessage={(m) => m.sender_role === "staff"}
          labelFor={(m) =>
            m.sender_role === "member" ? selectedMember?.name ?? "Client" : m.sender_id === profile.id ? "You" : coachNameById.get(m.sender_id) ?? "Coach"
          }
          placeholder={selectedMember ? `Message ${selectedMember.name}…` : "Message…"}
          onSend={handleSend}
          maxHeight={isWeb ? 560 : 460}
        />
      </View>
    </View>
  ) : isWeb ? (
    <View className="flex-1 items-center justify-center">
      <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
        Select a conversation
      </Text>
    </View>
  ) : null;

  return (
    <CoachShell>
      <View style={{ flex: 1, backgroundColor: "#faf8f6" }}>
        <View className="px-6 pb-2 pt-6">
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26 }}>Messages</Text>
        </View>
        <View style={[{ flex: 1, flexDirection: "row", backgroundColor: "white", margin: isWeb ? 24 : 0, borderRadius: isWeb ? 16 : 0, overflow: "hidden" }, isWeb ? CARD_SHADOW : null, isWeb ? { borderWidth: 1, borderColor: "#ece7e1" } : null]}>
          {isWeb || !selectedUserId ? listPane : null}
          {threadPane}
        </View>
      </View>
    </CoachShell>
  );
}
