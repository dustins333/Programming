import { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLogs } from "../../../lib/nutrition/dailyLog";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { formatDateMDY } from "../../../lib/formatDate";
import { fonts, colors } from "../../../lib/theme";

const NUTRITION_SEGMENTS = [
  { key: "today", label: "Today", href: "/(member)/nutrition" },
  { key: "checkin", label: "Check-in", href: "/(member)/nutrition/checkin" },
  { key: "history", label: "History", href: "/(member)/nutrition/history" },
];

export default function NutritionHistory() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    listLogs(profile.id)
      .then(setLogs)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [profile.id]);

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your history: {loadError}
        </Text>
      </View>
    );
  }

  if (!logs) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-6 pb-8" style={{ paddingTop: insets.top + 6 }}>
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Nutrition
      </Text>
      <Text className="mb-4 text-base text-stone-500" style={{ fontFamily: fonts.sans }}>
        Log history
      </Text>
      <SegmentedControl
        segments={NUTRITION_SEGMENTS}
        activeKey="history"
        onSelect={(key) => {
          const seg = NUTRITION_SEGMENTS.find((s) => s.key === key);
          if (seg && seg.key !== "history") router.push(seg.href);
        }}
      />
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No logs yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View className="mb-2 rounded-lg border border-stone-200 px-4 py-3">
            <View className="mb-1 flex-row items-center justify-between">
              <Text style={{ fontFamily: fonts.sansSemiBold }}>{formatDateMDY(item.log_date)}</Text>
              <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                {item.finalized_at ? "Finalized" : "Draft"}
              </Text>
            </View>
            <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sans }}>
              {item.weight ? `${item.weight} lb — ` : ""}
              {item.protein_g ?? "–"}P / {item.carb_g ?? "–"}C / {item.fat_g ?? "–"}F / {item.fiber_g ?? "–"} fiber
            </Text>
          </View>
        )}
      />
    </View>
  );
}
