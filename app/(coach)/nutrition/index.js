import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { getNutritionRoster } from "../../../lib/nutrition/dashboard";
import { fonts, colors } from "../../../lib/theme";

const STATUS_LABELS = {
  pending: "Pending check-in",
  ready: "Ready for check-in",
  completed: "Check-in completed",
};
const STATUS_ORDER = ["pending", "ready", "completed"];

export default function NutritionDashboard() {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setRoster(await getNutritionRoster());
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
          Something went wrong loading the nutrition roster: {loadError}
        </Text>
      </View>
    );
  }

  if (!roster) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-2xl text-primary" style={{ fontFamily: fonts.display }}>
          Nutrition
        </Text>
        <Link href="/(coach)/nutrition/questions" style={{ fontFamily: fonts.sansMedium }} className="text-accent">
          Check-in questions
        </Link>
      </View>

      {roster.length === 0 && (
        <Text className="text-neutral-500" style={{ fontFamily: fonts.sans }}>
          No active nutrition clients yet — assign one from the Clients page.
        </Text>
      )}

      {STATUS_ORDER.map((status) => {
        const clients = roster.filter((c) => c.checkinStatus === status);
        if (clients.length === 0) return null;
        return (
          <View key={status} className="mb-6">
            <Text className="mb-2 text-sm text-neutral-500" style={{ fontFamily: fonts.sansSemiBold }}>
              {STATUS_LABELS[status]} ({clients.length})
            </Text>
            {clients.map((c) => (
              <Link key={c.userId} href={`/(coach)/nutrition/clients/${c.userId}`} asChild>
                <Pressable className="mb-2 rounded-lg border border-neutral-200 px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text style={{ fontFamily: fonts.sansMedium }}>{c.name}</Text>
                    <Text
                      style={{ fontFamily: fonts.sans }}
                      className={
                        c.weightDelta > 0
                          ? "text-red-600"
                          : c.weightDelta < 0
                            ? "text-green-600"
                            : "text-neutral-500"
                      }
                    >
                      {c.weightDelta === null
                        ? "— lb"
                        : `${c.weightDelta > 0 ? "↑" : c.weightDelta < 0 ? "↓" : "±"} ${Math.abs(c.weightDelta).toFixed(1)} lb`}
                    </Text>
                  </View>
                  <Text className="text-xs text-neutral-500" style={{ fontFamily: fonts.sans }}>
                    {c.daysLogged}/7 days logged this week
                    {c.needsAttention ? ` · missed ${c.missedDays} day${c.missedDays === 1 ? "" : "s"}` : ""}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
