import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches, listMembers } from "../../../lib/programming/clients";
import {
  listThreadSummaries,
  listMessages,
  sendStaffMessage,
  markThreadReadByStaff,
  markThreadUnreadByStaff,
} from "../../../lib/programming/messages";
import { getMessagingSettings } from "../../../lib/programming/messagingSettings";
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

// Picks any client to start a new thread with — the main inbox list only
// ever shows clients who already have message history (listThreadSummaries
// groups existing rows), so this is the only way to message someone for the
// first time. Own search box, separate from the inbox's own search bar,
// since this one searches every client, not just ones already in the list.
function NewMessageModal({ visible, members, onClose, onPick }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q));
  }, [members, search]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full rounded-2xl bg-white"
          style={{ maxWidth: 420, maxHeight: "75%" }}
        >
          <View className="px-5 pb-3 pt-5">
            <Text className="mb-3" style={{ fontFamily: fonts.sansBold, fontSize: 16 }}>
              New message
            </Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search clients by name or email…"
              autoFocus={isWeb}
              className="rounded-lg border border-stone-300 px-3.5 py-2.5"
              style={{ fontFamily: fonts.sans, fontSize: 13.5 }}
            />
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {filtered.length === 0 ? (
              <Text className="px-5 pb-5 text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                No clients match.
              </Text>
            ) : (
              filtered.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => onPick(m.id)}
                  className="flex-row items-center gap-3 px-5 py-3"
                  style={{ borderTopWidth: 1, borderTopColor: "#f1efed" }}
                >
                  <Avatar name={m.name} />
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700" numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12 }} numberOfLines={1}>
                      {m.email}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable onPress={onClose} className="items-center border-t border-stone-100 py-3.5">
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13.5, color: "#78716c" }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CoachMessagesInbox() {
  const { profile } = useAuth();
  const router = useRouter();
  const [summaries, setSummaries] = useState(null);
  const [summariesError, setSummariesError] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [composerVisible, setComposerVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [messages, setMessages] = useState(null);
  const [messagesError, setMessagesError] = useState(null);
  // Fallback safety net, same as app/(member)/messages.js — the nav items
  // that link here (CoachShell's sidebar, more.js) already hide themselves
  // when messaging's off, but this route is still directly reachable.
  // Starts true so there's no flash before the real check resolves.
  const [messagingEnabled, setMessagingEnabled] = useState(true);

  const loadSummaries = useCallback(async () => {
    try {
      setSummariesError(null);
      const [summaryRows, coachRows, memberRows] = await Promise.all([listThreadSummaries(), listCoaches(), listMembers()]);
      setSummaries(summaryRows);
      setCoaches(coachRows);
      setMembers(memberRows);
    } catch (err) {
      setSummariesError(err.message ?? String(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSummaries();
      getMessagingSettings()
        .then((s) => setMessagingEnabled(s.enabled))
        .catch((err) => console.error("Failed to load messaging settings:", err));
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

  const handlePickNewMessage = (userId) => {
    setComposerVisible(false);
    selectThread(userId);
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

  if (!messagingEnabled) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="mb-1 text-center" style={{ fontFamily: fonts.sansSemiBold, fontSize: 16 }}>
            Messaging is currently turned off
          </Text>
          <Text className="text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
            Turn it back on from Settings → Messaging.
          </Text>
        </View>
      </CoachShell>
    );
  }

  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));

  // Search filters the already-sorted (newest-activity-first) summaries
  // client-side — a plain .filter() preserves listThreadSummaries' own
  // ordering rather than re-sorting, so search never reshuffles the list.
  const q = search.trim().toLowerCase();
  const visibleSummaries = !summaries ? summaries : q ? summaries.filter((s) => s.clientName?.toLowerCase().includes(q)) : summaries;

  const listPane = (
    <View style={isWeb ? { width: 340, borderRightWidth: 1, borderRightColor: "#ece7e1" } : { flex: 1 }}>
      <View className="px-[14px] pb-3 pt-3" style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search conversations…"
          className="rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans, fontSize: 13 }}
        />
      </View>
      {summariesError ? (
        <View className="items-start p-6">
          <Text className="mb-2 text-red-600" style={{ fontFamily: fonts.sans }}>
            {summariesError}
          </Text>
          <Pressable onPress={loadSummaries}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      ) : !visibleSummaries ? (
        <View className="items-center justify-center p-10">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : visibleSummaries.length === 0 ? (
        <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          {summaries.length === 0 ? "No client conversations yet." : "No conversations match your search."}
        </Text>
      ) : (
        <ScrollView>
          {visibleSummaries.map((item) => (
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
      <View style={{ flex: 1, paddingHorizontal: isWeb ? 0 : 20 }}>
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
          fill
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
        {!isWeb && !selectedUserId ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))}
            className="px-6 pt-6"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <View className="flex-row items-center justify-between px-6 pb-2 pt-6">
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26 }}>Messages</Text>
          <Pressable
            onPress={() => setComposerVisible(true)}
            className="flex-row items-center gap-1.5 rounded-lg px-3.5 py-2"
            style={{ backgroundColor: colors.primary }}
          >
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              New message
            </Text>
          </Pressable>
        </View>
        <View style={[{ flex: 1, flexDirection: "row", backgroundColor: "white", margin: isWeb ? 24 : 0, borderRadius: isWeb ? 16 : 0, overflow: "hidden" }, isWeb ? CARD_SHADOW : null, isWeb ? { borderWidth: 1, borderColor: "#ece7e1" } : null]}>
          {isWeb || !selectedUserId ? listPane : null}
          {threadPane}
        </View>
      </View>

      <NewMessageModal
        visible={composerVisible}
        members={members}
        onClose={() => setComposerVisible(false)}
        onPick={handlePickNewMessage}
      />
    </CoachShell>
  );
}
