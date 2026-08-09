import { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { listSessionsSinceAllUsers } from "../lib/programming/coachLogs";
import { todayInBoise, dayOfWeekInBoise, addDays } from "../lib/boiseDate";
import { SessionRow } from "./RecentSessionsCard";
import { fonts, colors } from "../lib/theme";

// Monday-anchored, matching My Week's own week window — Sunday belongs to
// the week that started the previous Monday.
function mondayOfCurrentWeek() {
  const today = todayInBoise();
  const dow = dayOfWeekInBoise(today); // 0=Sun..6=Sat
  return addDays(today, -((dow + 6) % 7));
}

// "Sessions this week" — the count of finalized sessions across the whole
// roster since Monday, opening into per-client rows with the actual logged
// numbers (SessionRow's expansion). Terra's requested shape: a dashboard
// number you can open up for the details — deliberately NOT a push
// notification per workout. Self-contained (owns its own fetch, isolated
// from the dashboard stats load) so both dashboards mount it with one line.
export function ActivityFeed() {
  const router = useRouter();
  const [sessions, setSessions] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(null);
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          setLoadError(null);
          const rows = await listSessionsSinceAllUsers(mondayOfCurrentWeek());
          if (!cancelled) setSessions(rows);
        } catch (err) {
          if (!cancelled) setLoadError(err.message ?? String(err));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <View
      className="mb-4 rounded-2xl bg-white px-5 py-4"
      style={{ borderWidth: 1, borderColor: "#ece7e1", shadowColor: "#44403c", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10 }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center justify-between"
        accessibilityLabel={open ? "Hide this week's sessions" : "Show this week's sessions"}
      >
        <View>
          <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
            Sessions completed this week
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>
            {sessions === null ? "—" : sessions.length}
          </Text>
        </View>
        {sessions === null && !loadError ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#a8a29e" />
        )}
      </Pressable>

      {loadError ? (
        <Text className="mt-2 text-xs text-red-600" style={{ fontFamily: fonts.sans }}>
          Couldn't load recent sessions: {loadError}
        </Text>
      ) : null}

      {open && sessions ? (
        sessions.length === 0 ? (
          <Text className="mt-3 text-stone-400" style={{ fontFamily: fonts.sans }}>
            No sessions finalized yet this week.
          </Text>
        ) : (
          <View className="mt-2">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                userId={session.userId}
                session={session}
                title={session.userName}
                onOpenClient={() => router.push(`/(coach)/clients/${session.userId}`)}
              />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}
