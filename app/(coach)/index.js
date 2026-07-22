import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { getCoachDashboardStats } from "../../lib/programming/coachDashboard";
import { fonts, colors } from "../../lib/theme";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatToday() {
  const today = todayInBoise();
  const [year, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

function AttentionCard({ title, subtitle, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2.5 flex-row items-center justify-between rounded-2xl px-4 py-3.5"
      style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#e9d3c6" }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.accent, opacity: 0.5, marginRight: 14 }} />
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
    <View className="flex-1 items-center rounded-2xl border border-stone-200 py-4">
      <Text className="text-2xl text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        {value}
      </Text>
      <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
        {label}
      </Text>
    </View>
  );
}

export default function CoachHome() {
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
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your dashboard: {loadError}
        </Text>
      </View>
    );
  }

  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const hasAttentionItems = stats.spcDueSoon > 0 || stats.checkinsToReview > 0;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Welcome, {profile?.name}
      </Text>
      <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
        {profile?.role === "admin" ? "Admin" : "Coach"} · {formatToday()}
      </Text>

      {hasAttentionItems && (
        <View className="mb-6">
          <Text
            className="mb-2 text-xs uppercase text-stone-400"
            style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}
          >
            Needs your attention
          </Text>
          {stats.spcDueSoon > 0 && (
            <AttentionCard
              title={`${stats.spcDueSoon} SPC client${stats.spcDueSoon === 1 ? "" : "s"} due soon`}
              subtitle="Blank drafts auto-created — ready to fill in"
              onPress={() => router.push("/(coach)/spc")}
            />
          )}
          {stats.checkinsToReview > 0 && (
            <AttentionCard
              title={`${stats.checkinsToReview} check-in${stats.checkinsToReview === 1 ? "" : "s"} to review`}
              subtitle="Submitted this week, awaiting your notes"
              onPress={() => router.push("/(coach)/nutrition")}
            />
          )}
        </View>
      )}

      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
        This week
      </Text>
      <View className="mb-6 flex-row gap-3">
        <StatTile value={stats.flagshipCount} label="Flagship" />
        <StatTile value={stats.spcCount} label="SPC" />
        <StatTile value={stats.nutritionCount} label="Nutrition" />
      </View>
    </ScrollView>
  );
}
