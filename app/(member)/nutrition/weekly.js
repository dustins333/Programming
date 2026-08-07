import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { listLogs } from "../../../lib/nutrition/dailyLog";
import { getCurrentTarget } from "../../../lib/nutrition/targets";
import { currentCalendarWeek, summarizeWeek } from "../../../lib/nutrition/weekCycle";
import { WeekList, WeekDayTable, enumerateRecentWeeks } from "../../../components/nutrition/WeekList";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { fonts, colors } from "../../../lib/theme";

const CANVAS = "#faf8f6";
const WEEKS_SHOWN = 8;

export default function NutritionWeekly() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayInBoise();
  const access = useNutritionAccess(profile.id);
  useFocusEffect(useCallback(() => access.refetch(), [access.refetch]));

  const [logs, setLogs] = useState(null);
  const [targetsByWeekEnd, setTargetsByWeekEnd] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  const weeks = useMemo(() => {
    return enumerateRecentWeeks(currentCalendarWeek(today), addDays, WEEKS_SHOWN);
  }, [today]);

  useEffect(() => {
    if (access.status !== "active") return;
    setLoadError(null);
    (async () => {
      try {
        const [logRows, targets] = await Promise.all([
          listLogs(profile.id, { limit: 200 }),
          Promise.all(weeks.map((w) => getCurrentTarget(profile.id, w.end))),
        ]);
        setLogs(logRows);
        const byEnd = {};
        weeks.forEach((w, i) => {
          byEnd[w.end] = targets[i];
        });
        setTargetsByWeekEnd(byEnd);
      } catch (err) {
        setLoadError(err.message ?? String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.status, profile.id, retryKey]);

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} onRetry={access.refetch} />;
  }

  if (loadError) {
    return (
      <View className="flex-1" style={{ backgroundColor: CANVAS }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24 }}>
          <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            Nutrition
          </Text>
          <SegmentedControl
            segments={NUTRITION_TABS}
            activeKey="weekly"
            onSelect={(key) => {
              const seg = NUTRITION_TABS.find((s) => s.key === key);
              if (seg && seg.key !== "weekly") router.push(seg.href);
            }}
          />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your weekly averages: {loadError}
          </Text>
          <Pressable onPress={() => setRetryKey((k) => k + 1)} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!logs) {
    return <NutritionAccessMessage status="loading" />;
  }

  // weekSummaries[0] is always the current (possibly partial) week —
  // enumerateRecentWeeks is most-recent-first.
  const weekSummaries = weeks.map((w) => ({ ...w, summary: summarizeWeek(logs, w.start, w.end), target: targetsByWeekEnd[w.end] }));
  const currentWeekSummary = weekSummaries[0];
  const priorWeeks = weekSummaries.slice(1);

  // 8-week weight trend: newest logged weekly average minus the oldest —
  // skips any week with no logged weight rather than assuming index 0/last
  // both have data (a brand-new client's earliest "weeks" may be empty).
  const weightWeeks = weekSummaries.filter((w) => w.summary.averages.weight != null);
  const weightTrend =
    weightWeeks.length >= 2 ? Math.round((weightWeeks[0].summary.averages.weight - weightWeeks[weightWeeks.length - 1].summary.averages.weight) * 10) / 10 : null;

  const loggedWeeks = weekSummaries.filter((w) => w.summary.days.length > 0);
  const avgAdherence = loggedWeeks.length > 0 ? Math.round((loggedWeeks.reduce((sum, w) => sum + w.summary.adherence, 0) / loggedWeeks.length) * 100) : null;

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Nutrition
      </Text>
      <Text className="mb-4 text-base text-stone-500" style={{ fontFamily: fonts.sans }}>
        Weekly averages
      </Text>

      <SegmentedControl
        segments={NUTRITION_TABS}
        activeKey="weekly"
        onSelect={(key) => {
          const seg = NUTRITION_TABS.find((s) => s.key === key);
          if (seg && seg.key !== "weekly") router.push(seg.href);
        }}
      />

      <View className="mb-6 flex-row gap-3">
        <View className="flex-1 rounded-xl border border-stone-200 bg-white p-4">
          <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
            {WEEKS_SHOWN}-week weight trend
          </Text>
          <Text className="mt-1 text-xl" style={{ fontFamily: fonts.display, color: weightTrend !== null && weightTrend < 0 ? "#4d6142" : colors.primary }}>
            {weightTrend !== null ? `${weightTrend > 0 ? "+" : ""}${weightTrend} lb` : "—"}
          </Text>
        </View>
        <View className="flex-1 rounded-xl border border-stone-200 bg-white p-4">
          <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
            Avg adherence
          </Text>
          <Text className="mt-1 text-xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {avgAdherence !== null ? `${avgAdherence}%` : "—"}
          </Text>
        </View>
      </View>

      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
        This week — day by day
      </Text>
      <View className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
        <WeekDayTable week={currentWeekSummary} />
      </View>

      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
        Prior weeks
      </Text>
      <View className="rounded-xl border border-stone-200 bg-white p-4">
        <WeekList weeks={priorWeeks} />
      </View>
    </ScrollView>
  );
}
