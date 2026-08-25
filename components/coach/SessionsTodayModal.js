import { useCallback, useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { listSessionsSinceAllUsers } from "../../lib/programming/coachLogs";
import { todayInBoise } from "../../lib/boiseDate";
import { SessionRow } from "../RecentSessionsCard";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// Who's trained today — the popup behind "Sessions logged" on both coach
// dashboards.
//
// A "logged session" is one row in programming.session_completions, i.e. a
// member (or a coach on her behalf) tapped Finalize. It is NOT "typed some
// numbers in" — sets autosave as they're entered, so a session in progress
// contributes nothing here until it's finalized. That's the same rule the
// dashboard's own count uses (gymToday.js), so the number on the card and
// the length of this list can't disagree.
//
// Deliberately counts SESSIONS, not people: a client who finalizes two
// sessions in one evening is two rows. The subtitle says so, since 12
// sessions across 9 members is a different day from 12 across 12.

// Tiered off the count rather than picked at random, so the line is stable
// across re-renders and re-opens instead of reshuffling under the reader.
function funLine(sessions, members) {
  const n = sessions;
  if (n === 0) return "Nobody's finalized yet. First one in sets the tone.";
  if (n === 1) return "One on the board.";
  if (n < 5) return "A few in the books.";
  if (n < 10) return "Steady day on the floor.";
  if (n < 20) return "The floor's humming.";
  if (n < 35) return `Big day — ${members} members in.`;
  return `Packed house. ${members} members, ${n} sessions.`;
}

export function SessionsTodayModal({ visible, onClose }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setSessions(null);
      setSessions(await listSessionsSinceAllUsers(todayInBoise()));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  // Fetched on open rather than on mount — this modal is mounted by both
  // dashboards on every load, and nobody should pay for a query behind a
  // popup they haven't opened.
  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const memberCount = sessions ? new Set(sessions.map((s) => s.userId)).size : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 560, maxHeight: "86%", backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#ece7e1",
            }}
          >
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1, color: "#a8a29e" }}>SESSIONS LOGGED TODAY</Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primaryOnWhite, marginTop: 3 }}>
                {sessions === null ? "—" : sessions.length}
              </Text>
              {sessions ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#6f6862", marginTop: 2 }}>
                  {funLine(sessions.length, memberCount)}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#a8a29e" />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 18 }}>
            {loadError ? (
              <View style={{ paddingVertical: 18 }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>Couldn't load today's sessions: {loadError}</Text>
                <PressFade
                  onPress={load}
                  style={{ alignSelf: "flex-start", marginTop: 10, borderWidth: 1, borderColor: "#ece7e1", borderRadius: 99, paddingVertical: 7, paddingHorizontal: 16 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>Retry</Text>
                </PressFade>
              </View>
            ) : sessions === null ? (
              <View style={{ paddingVertical: 28, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : sessions.length === 0 ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: "#6f6862", paddingVertical: 22, textAlign: "center" }}>
                Nothing finalized yet today.
              </Text>
            ) : (
              sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  userId={session.userId}
                  session={session}
                  title={session.userName}
                  onOpenClient={() => {
                    onClose();
                    router.push(`/(coach)/clients/${session.userId}`);
                  }}
                />
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
