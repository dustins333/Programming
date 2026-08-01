import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLogsForExercise } from "../../../lib/programming/memberPlan";
import { formatDateMDY } from "../../../lib/formatDate";
import { fonts, colors } from "../../../lib/theme";

// Groups per-set rows under one date header instead of one flat row per
// set — a 3-set session would otherwise show as 3 near-identical rows.
function groupByDate(logs) {
  const groups = [];
  const byDate = new Map();
  for (const row of logs) {
    if (!byDate.has(row.date_performed)) {
      const group = { date: row.date_performed, sets: [] };
      byDate.set(row.date_performed, group);
      groups.push(group);
    }
    byDate.get(row.date_performed).sets.push(row);
  }
  return groups;
}

export default function ExerciseHistory() {
  const { exerciseId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState(null);

  const load = useCallback(async () => {
    const data = await listLogsForExercise(profile.id, exerciseId);
    setLogs(data);
  }, [profile.id, exerciseId]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => (logs ? groupByDate(logs) : []), [logs]);

  if (!logs) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-6 pb-8" style={{ paddingTop: insets.top + 6 }}>
      <Pressable onPress={() => router.back()} className="mb-4 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ My History</Text>
      </Pressable>
      <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        History
      </Text>
      <FlatList
        data={groups}
        keyExtractor={(group) => group.date}
        ListEmptyComponent={
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No logged results yet.
          </Text>
        }
        renderItem={({ item: group }) => (
          <View className="mb-3 rounded-lg border border-stone-200 px-4 py-3">
            <Text className="mb-1" style={{ fontFamily: fonts.sansMedium }}>
              {formatDateMDY(group.date)}
            </Text>
            {group.sets.map((s) => (
              <Text key={s.id} className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                Set {s.set_number}: {s.reps ?? "–"} reps{s.weight ? ` @ ${s.weight}` : ""}
              </Text>
            ))}
          </View>
        )}
      />
    </View>
  );
}
