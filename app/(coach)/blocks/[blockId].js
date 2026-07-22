import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { listWorkoutsForBlock } from "../../../lib/programming/blocks";
import { CoachShell } from "../../../components/CoachShell";

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
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color="#a46a57" />
        </View>
      </CoachShell>
    );
  }

  const weeks = [...new Set(workouts.map((w) => w.week_number))].sort((a, b) => a - b);
  const sessions = [...new Set(workouts.map((w) => w.session_number))].sort((a, b) => a - b);

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 760 }}>
        <Text className="mb-6 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
          Block sessions
        </Text>
        {weeks.map((week) => (
          <View key={week} className="mb-6">
            <Text
              className="mb-2 text-xs uppercase text-stone-400"
              style={{ fontFamily: "Montserrat_600SemiBold", letterSpacing: 0.4 }}
            >
              Week {week}
            </Text>
            <View className="flex-row gap-3">
              {sessions.map((session) => {
                const workout = workouts.find((w) => w.week_number === week && w.session_number === session);
                return (
                  <Link key={session} href={`/(coach)/builder/${workout.id}`} asChild>
                    <Pressable className="flex-1 rounded-lg border border-stone-200 px-4 py-3">
                      <Text style={{ fontFamily: "Montserrat_500Medium" }}>Session {session}</Text>
                      <Text
                        className="text-xs"
                        style={{ fontFamily: "Montserrat_500Medium", color: workout.status === "published" ? "#8a5140" : "#a8a29e" }}
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
    </CoachShell>
  );
}
