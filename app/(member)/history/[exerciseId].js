import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLogsForExercise } from "../../../lib/programming/memberPlan";
import { formatDateMDY } from "../../../lib/formatDate";
import { fonts, colors } from "../../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 px-6 pb-8" style={{ backgroundColor: CANVAS, paddingTop: insets.top + 6 }}>
      <Pressable onPress={() => router.push("/(member)/history")} className="mb-3 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ My History</Text>
      </Pressable>
      <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        {logs[0]?.exercises?.name ?? "History"}
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
          <View className="mb-2.5 rounded-2xl bg-white px-4 py-3.5" style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}>
            <Text className="mb-1.5" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
              {formatDateMDY(group.date)}
            </Text>
            {group.sets.map((s) => (
              <Text key={s.id} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 2 }}>
                Set {s.set_number}: {s.reps ?? "–"} reps{s.weight ? ` @ ${s.weight}` : ""}
              </Text>
            ))}
          </View>
        )}
      />
    </View>
  );
}
