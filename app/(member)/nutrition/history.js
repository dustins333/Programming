import { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLogs } from "../../../lib/nutrition/dailyLog";
import { fonts, colors } from "../../../lib/theme";

export default function NutritionHistory() {
  const { profile } = useAuth();
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
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="mb-6 text-2xl text-primary" style={{ fontFamily: fonts.display }}>
        Log History
      </Text>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text className="text-neutral-500" style={{ fontFamily: fonts.sans }}>
            No logs yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View className="mb-2 rounded-lg border border-neutral-200 px-4 py-3">
            <View className="mb-1 flex-row items-center justify-between">
              <Text style={{ fontFamily: fonts.sansSemiBold }}>{item.log_date}</Text>
              <Text className="text-xs text-neutral-500" style={{ fontFamily: fonts.sans }}>
                {item.finalized_at ? "Finalized" : "Draft"}
              </Text>
            </View>
            <Text className="text-sm text-neutral-700" style={{ fontFamily: fonts.sans }}>
              {item.weight ? `${item.weight} lb — ` : ""}
              {item.protein_g ?? "–"}P / {item.carb_g ?? "–"}C / {item.fat_g ?? "–"}F / {item.fiber_g ?? "–"} fiber
            </Text>
          </View>
        )}
      />
    </View>
  );
}
