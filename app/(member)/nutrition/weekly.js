import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { listLogs } from "../../../lib/nutrition/dailyLog";
import { getCurrentTarget } from "../../../lib/nutrition/targets";
import { computeWeekWindows, summarizeWeek } from "../../../lib/nutrition/weekCycle";
import { WeekList, enumerateRecentWeeks } from "../../../components/nutrition/WeekList";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { fonts, colors } from "../../../lib/theme";

const WEEKS_SHOWN = 8;

export default function NutritionWeekly() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayInBoise();
  const access = useNutritionAccess(profile.id);

  const [logs, setLogs] = useState(null);
  const [targetsByWeekEnd, setTargetsByWeekEnd] = useState({});
  const [loadError, setLoadError] = useState(null);

  const weeks = useMemo(() => {
    const { currentWeek } = computeWeekWindows(today);
    return enumerateRecentWeeks(currentWeek, addDays, WEEKS_SHOWN);
  }, [today]);

  useEffect(() => {
    if (access.status !== "active") return;
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
  }, [access.status, profile.id]);

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} />;
  }

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your weekly averages: {loadError}
        </Text>
      </View>
    );
  }

  if (!logs) {
    return <NutritionAccessMessage status="loading" />;
  }

  const weekSummaries = weeks.map((w) => ({ ...w, summary: summarizeWeek(logs, w.start, w.end), target: targetsByWeekEnd[w.end] }));

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
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

      <WeekList weeks={weekSummaries} />
    </ScrollView>
  );
}
