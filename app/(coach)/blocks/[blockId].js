import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { listWorkoutsForBlock } from "../../../lib/programming/blocks";

export default function BlockDetail() {
  const { blockId } = useLocalSearchParams();
  const [workouts, setWorkouts] = useState(null);

  const load = useCallback(async () => {
    const rows = await listWorkoutsForBlock(blockId);
    setWorkouts(rows);
  }, [blockId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!workouts) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#a46a57" />
      </View>
    );
  }

  const weeks = [...new Set(workouts.map((w) => w.week_number))].sort((a, b) => a - b);
  const sessions = [...new Set(workouts.map((w) => w.session_number))].sort((a, b) => a - b);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="mb-6 text-2xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Block sessions
      </Text>
      {weeks.map((week) => (
        <View key={week} className="mb-6">
          <Text className="mb-2 text-sm text-neutral-500" style={{ fontFamily: "Montserrat_500Medium" }}>
            Week {week}
          </Text>
          <View className="flex-row gap-3">
            {sessions.map((session) => {
              const workout = workouts.find((w) => w.week_number === week && w.session_number === session);
              return (
                <Link key={session} href={`/(coach)/builder/${workout.id}`} asChild>
                  <Pressable className="flex-1 rounded-lg border border-neutral-200 px-4 py-3">
                    <Text style={{ fontFamily: "Montserrat_500Medium" }}>Session {session}</Text>
                    <Text
                      className={workout.status === "published" ? "text-accent" : "text-neutral-400"}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {workout.status}
                    </Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
