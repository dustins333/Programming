import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLogsForExercise } from "../../../lib/programming/memberPlan";

export default function ExerciseHistory() {
  const { exerciseId } = useLocalSearchParams();
  const { profile } = useAuth();
  const [logs, setLogs] = useState(null);

  const load = useCallback(async () => {
    const data = await listLogsForExercise(profile.id, exerciseId);
    setLogs(data);
  }, [profile.id, exerciseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!logs) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#a46a57" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="mb-4 text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
        History
      </Text>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3">
            <Text style={{ fontFamily: "Montserrat_400Regular" }}>{item.date_performed}</Text>
            <Text style={{ fontFamily: "Montserrat_500Medium" }}>
              {item.sets ?? "–"} × {item.reps ?? "–"} {item.weight ? `@ ${item.weight}` : ""}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
