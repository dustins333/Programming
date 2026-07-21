import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, Pressable } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLoggedExercises } from "../../../lib/programming/memberPlan";

export default function HistoryIndex() {
  const { profile } = useAuth();
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    const data = await listLoggedExercises(profile.id);
    setRows(data);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="mb-4 text-2xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        History
      </Text>
      {!rows ? (
        <ActivityIndicator color="#a46a57" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.exercise.id}
          ListEmptyComponent={
            <Text className="text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
              No logged results yet — once you log a set, it'll show up here.
            </Text>
          }
          renderItem={({ item }) => (
            <Link href={`/(member)/history/${item.exercise.id}`} asChild>
              <Pressable className="mb-2 rounded-lg border border-neutral-200 px-4 py-3">
                <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.exercise.name}</Text>
                <Text className="text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                  Last logged {item.lastDate}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}
