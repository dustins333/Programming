import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import { getMyAssignment, getCurrentBlock, listPublishedWorkoutsForBlock } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";

export default function Plan() {
  const { profile } = useAuth();
  const [state, setState] = useState({ status: "loading" });
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [sessionDetails, setSessionDetails] = useState({}); // workoutId -> { warmups, exercises }
  const [loadingSession, setLoadingSession] = useState(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const assignment = await getMyAssignment(profile.id);
      if (!assignment?.group_program_id) {
        setState({ status: "unassigned" });
        return;
      }
      const program = assignment.group_programs;
      const block = await getCurrentBlock(program.id, todayInBoise());
      if (!block) {
        setState({ status: "no_block" });
        return;
      }
      const workouts = await listPublishedWorkoutsForBlock(block.id);
      const week = currentWeekNumber(block.block_start_date, program.block_length_weeks, todayInBoise());
      setSelectedWeek(week);
      setState({ status: "ready", program, block, workouts });
    } catch (err) {
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  const weeksInBlock = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.from({ length: state.program.block_length_weeks }, (_, i) => i + 1);
  }, [state]);

  const sessionsForSelectedWeek = useMemo(() => {
    if (state.status !== "ready" || !selectedWeek) return [];
    return state.workouts.filter((w) => w.week_number === selectedWeek).sort((a, b) => a.session_number - b.session_number);
  }, [state, selectedWeek]);

  const loadSessionDetails = async (workout) => {
    if (sessionDetails[workout.id]) return;
    setLoadingSession(workout.id);
    const [warmups, exercises] = await Promise.all([listWarmups(workout.id), listWorkoutExercises(workout.id)]);
    setSessionDetails((prev) => ({ ...prev, [workout.id]: { warmups, exercises } }));
    setLoadingSession(null);
  };

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#a46a57" />
      </View>
    );
  }

  if (state.status !== "ready") {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
          {state.status === "unassigned"
            ? "You're not assigned to a program yet."
            : state.status === "error"
              ? `Something went wrong: ${state.message}`
              : "No active block right now."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="mb-1 text-2xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        {state.program.name} Plan
      </Text>
      <Text className="mb-4 text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
        {state.block.block_start_date} → {state.block.block_end_date}
      </Text>

      <View className="mb-6 flex-row flex-wrap gap-2">
        {weeksInBlock.map((week) => (
          <Pressable
            key={week}
            onPress={() => setSelectedWeek(week)}
            className={`rounded-full border px-3 py-1.5 ${selectedWeek === week ? "border-primary bg-primary" : "border-neutral-300"}`}
          >
            <Text className={selectedWeek === week ? "text-white" : "text-neutral-700"} style={{ fontFamily: "Montserrat_400Regular" }}>
              Week {week}
            </Text>
          </Pressable>
        ))}
      </View>

      {sessionsForSelectedWeek.length === 0 ? (
        <Text className="text-neutral-400" style={{ fontFamily: "Montserrat_400Regular" }}>
          Not published yet — check back soon.
        </Text>
      ) : (
        sessionsForSelectedWeek.map((workout) => {
          const details = sessionDetails[workout.id];
          return (
            <View key={workout.id} className="mb-4 rounded-lg border border-neutral-200 px-4 py-3">
              <Pressable onPress={() => loadSessionDetails(workout)}>
                <Text style={{ fontFamily: "Montserrat_600SemiBold" }}>Session {workout.session_number}</Text>
                {!details && (
                  <Text className="text-xs text-accent" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {loadingSession === workout.id ? "Loading…" : "Tap to view"}
                  </Text>
                )}
              </Pressable>
              {details && (
                <View className="mt-2">
                  {details.warmups.map((w, i) => (
                    <Text key={w.id} className="text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                      Warm-up {i + 1}: {w.exercises?.name ?? w.label}
                    </Text>
                  ))}
                  {details.exercises.map((ex) => (
                    <View key={ex.id} className="mt-2 flex-row items-center justify-between">
                      <Text style={{ fontFamily: "Montserrat_400Regular" }}>
                        {ex.exercises?.name} — {ex.sets}x{ex.reps}
                      </Text>
                      {ex.exercises?.video_url ? (
                        <Pressable onPress={() => Linking.openURL(ex.exercises.video_url)}>
                          <Text className="text-accent">▶</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
