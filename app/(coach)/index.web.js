import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { getCoachDashboardStats } from "../../lib/programming/coachDashboard";
import { CoachShell } from "../../components/CoachShell";
import { fonts, colors } from "../../lib/theme";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

function Panel({ title, children }) {
  return (
    <View className="flex-1 rounded-2xl border border-stone-200 p-5">
      <Text
        className="mb-4 text-xs uppercase text-stone-400"
        style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function AttentionRow({ title, subtitle, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2.5 flex-row items-center justify-between rounded-xl px-4 py-3.5"
      style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#e9d3c6" }}
    >
      <View className="flex-1">
        <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
          {title}
        </Text>
        <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          {subtitle}
        </Text>
      </View>
      <Text className="text-stone-400">›</Text>
    </Pressable>
  );
}

function StatTile({ value, label }) {
  return (
    <View className="items-start rounded-xl bg-stone-50 px-4 py-3.5" style={{ width: 140 }}>
      <Text className="text-2xl text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        {value}
      </Text>
      <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
        {label}
      </Text>
    </View>
  );
}

export default function CoachHomeWeb() {
  const { profile } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setStats(await getCoachDashboardStats());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your dashboard: {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!stats) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  const attentionItems = [
    stats.spcOverdue > 0 && {
      key: "spc-overdue",
      title: `${stats.spcOverdue} SPC block${stats.spcOverdue === 1 ? "" : "s"} overdue`,
      subtitle: "Already past the block end date",
      onPress: () => router.push("/(coach)/spc"),
    },
    stats.spcDueSoon > 0 && {
      key: "spc-due-soon",
      title: `${stats.spcDueSoon} SPC client${stats.spcDueSoon === 1 ? "" : "s"} due soon`,
      subtitle: "Blank drafts auto-created — ready to fill in",
      onPress: () => router.push("/(coach)/spc"),
    },
    stats.checkinsToReview > 0 && {
      key: "checkins",
      title: `${stats.checkinsToReview} check-in${stats.checkinsToReview === 1 ? "" : "s"} to review`,
      subtitle: "Submitted this week, awaiting your notes",
      onPress: () => router.push("/(coach)/nutrition"),
    },
    stats.nutritionAtRisk > 0 && {
      key: "nutrition-risk",
      title: `${stats.nutritionAtRisk} nutrition client${stats.nutritionAtRisk === 1 ? "" : "s"} at risk`,
      subtitle: "Missed logging days this week",
      onPress: () => router.push("/(coach)/nutrition"),
    },
    stats.unassignedCount > 0 && {
      key: "unassigned",
      title: `${stats.unassignedCount} client${stats.unassignedCount === 1 ? "" : "s"} not enrolled in anything`,
      subtitle: "Linked but not assigned to a program or nutrition",
      onPress: () => router.push("/(coach)/clients"),
    },
  ].filter(Boolean);

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-10 py-10">
        <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Welcome, {profile?.name}
        </Text>
        <Text className="mb-8 text-stone-500" style={{ fontFamily: fonts.sans }}>
          {profile?.role === "admin" ? "Admin" : "Coach"} · {formatToday()}
        </Text>

        <View className="flex-row gap-6" style={{ maxWidth: 1000 }}>
          <Panel title="Needs your attention">
            {attentionItems.length === 0 ? (
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                Nothing needs attention right now — you're all caught up.
              </Text>
            ) : (
              attentionItems.map((item) => (
                <AttentionRow key={item.key} title={item.title} subtitle={item.subtitle} onPress={item.onPress} />
              ))
            )}
          </Panel>

          <Panel title="Roster">
            <View className="flex-row flex-wrap gap-3">
              <StatTile value={stats.totalMembers} label="Total clients" />
              <StatTile value={stats.flagshipCount} label="Flagship" />
              <StatTile value={stats.bwaCount} label="Better With Age" />
              <StatTile value={stats.spcCount} label="SPC" />
              <StatTile value={stats.nutritionCount} label="Nutrition" />
              <StatTile value={stats.unassignedCount} label="Unassigned" />
            </View>
          </Panel>
        </View>
      </ScrollView>
    </CoachShell>
  );
}
