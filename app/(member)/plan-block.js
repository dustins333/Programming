import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import {
  listMyAssignments,
  getCurrentBlock,
  listPublishedWorkoutsForBlock,
  getLoggedSetsForDate,
} from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getGroupCompletion } from "../../lib/programming/sessionCompletions";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// Read-only full multi-week view of a member's group program block — one
// tap away from My Fitness's "View full block" link. My Fitness itself only
// shows today's specific session; this is for looking ahead/back at other
// weeks, not logging (no inputs here).
export default function PlanBlock() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { programId } = useLocalSearchParams();
  const [state, setState] = useState({ status: "loading" });
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [sessionDetails, setSessionDetails] = useState({});
  const [loadingSession, setLoadingSession] = useState(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const assignments = await listMyAssignments(profile.id);
      if (assignments.length === 0) {
        setState({ status: "unassigned" });
        return;
      }
      // Which membership's block to show — passed by whichever "View full
      // block" link sent the member here (a client can hold more than one
      // group program now), falling back to the first membership for
      // direct navigation with no param.
      const assignment = assignments.find((a) => a.group_program_id === programId) ?? assignments[0];
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
    const [warmups, exercises, completion] = await Promise.all([
      listWarmups(workout.id),
      listWorkoutExercises(workout.id),
      getGroupCompletion(profile.id, workout.id),
    ]);

    // Only a finalized session has a real "this actually happened on X"
    // date to key logged sets off of — an unfinalized one has nothing
    // reliable to show here yet.
    let loggedByExercise = {};
    if (completion) {
      const performedDate = dateInBoise(new Date(completion.completed_at));
      const results = await Promise.all(
        exercises.map((ex) => getLoggedSetsForDate(profile.id, ex.exercise_id, performedDate))
      );
      exercises.forEach((ex, i) => {
        loggedByExercise[ex.exercise_id] = results[i];
      });
    }

    setSessionDetails((prev) => ({ ...prev, [workout.id]: { warmups, exercises, completion, loggedByExercise } }));
    setLoadingSession(null);
  };

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      <Pressable onPress={() => router.back()} className="mb-4 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ My Fitness</Text>
      </Pressable>

      {state.status !== "ready" ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          {state.status === "unassigned"
            ? "You're not assigned to a program yet."
            : state.status === "error"
              ? `Something went wrong: ${state.message}`
              : "No active block right now."}
        </Text>
      ) : (
        <>
          <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {state.program.name} Plan
          </Text>
          <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {formatDateMDY(state.block.block_start_date)} → {formatDateMDY(state.block.block_end_date)}
          </Text>

          <View className="mb-6 flex-row flex-wrap gap-2">
            {weeksInBlock.map((week) => (
              <Pressable
                key={week}
                onPress={() => setSelectedWeek(week)}
                className={`rounded-full border px-3.5 py-2.5 ${selectedWeek === week ? "border-primary bg-primary" : "border-stone-300"}`}
              >
                <Text className={selectedWeek === week ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                  Week {week}
                </Text>
              </Pressable>
            ))}
          </View>

          {sessionsForSelectedWeek.length === 0 ? (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
              Not published yet — check back soon.
            </Text>
          ) : (
            sessionsForSelectedWeek.map((workout) => {
              const details = sessionDetails[workout.id];
              return (
                <View key={workout.id} className="mb-4 rounded-lg border border-stone-200 px-4 py-3">
                  <Pressable onPress={() => loadSessionDetails(workout)}>
                    <Text style={{ fontFamily: fonts.sansSemiBold }}>
                      Session {workout.session_number}
                      {workout.title ? ` — ${workout.title}` : ""}
                    </Text>
                    {!details ? (
                      <Text className="text-xs" style={{ fontFamily: fonts.sans, color: colors.primaryOnWhite }}>
                        {loadingSession === workout.id ? "Loading…" : "Tap to view"}
                      </Text>
                    ) : details.completion ? (
                      <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#4d6142" }}>
                        ✓ Completed {formatDateMDY(dateInBoise(new Date(details.completion.completed_at)))}
                      </Text>
                    ) : null}
                  </Pressable>
                  {details && (
                    <View className="mt-2">
                      {details.warmups.map((w, i) => (
                        <Text key={w.id} className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                          Warm-up {i + 1}: {w.exercises?.name ?? w.label}
                        </Text>
                      ))}
                      {details.exercises.map((ex) => {
                        const logged = details.loggedByExercise[ex.exercise_id];
                        return (
                          <View key={ex.id} className="mt-2">
                            <View className="flex-row items-center justify-between">
                              <Text style={{ fontFamily: fonts.sans }}>
                                {ex.exercises?.name} — {ex.sets}x{ex.reps}
                              </Text>
                              {ex.exercises?.video_url ? (
                                <Pressable
                                  onPress={() => Linking.openURL(ex.exercises.video_url)}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  accessibilityLabel={`Watch video for ${ex.exercises.name}`}
                                >
                                  <Text style={{ color: colors.primaryOnWhite }}>▶</Text>
                                </Pressable>
                              ) : null}
                            </View>
                            {logged && logged.length > 0 && (
                              <View className="mt-1 rounded-lg px-3 py-2" style={{ backgroundColor: "#faf7f4", borderWidth: 1, borderColor: "#f0ebe6" }}>
                                <Text className="text-xs text-stone-600" style={{ fontFamily: fonts.sans }}>
                                  {logged.map((s) => `Set ${s.set_number}: ${s.reps ?? "–"} reps${s.weight ? ` @ ${s.weight}` : ""}`).join(" · ")}
                                </Text>
                                {logged.find((s) => s.notes) ? (
                                  <Text className="mt-1 text-xs italic text-stone-500" style={{ fontFamily: fonts.sans }}>
                                    Note: {logged.find((s) => s.notes).notes}
                                  </Text>
                                ) : null}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}
