import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import { getSpcClient } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises, listSpcWorkoutWeekTitlesForWorkouts } from "../../lib/programming/spcWorkouts";
import { getLoggedSetsForDate } from "../../lib/programming/memberPlan";
import { getSpcCompletion } from "../../lib/programming/sessionCompletions";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// Read-only full multi-week view of a member's SPC block — one tap away
// from My Fitness's "View full SPC block" link. My Fitness itself only
// shows the next incomplete session; this is for looking ahead/back at
// other weeks, not logging (no inputs here).
export default function PlanSpcBlock() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ status: "loading" });
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [sessionDetails, setSessionDetails] = useState({});
  const [loadingSession, setLoadingSession] = useState(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const spcClient = await getSpcClient(profile.id);
      if (!spcClient) {
        setState({ status: "unassigned" });
        return;
      }
      const today = todayInBoise();
      const block = await getCurrentSpcBlock(profile.id, today);
      if (!block) {
        setState({ status: "no_block" });
        return;
      }
      const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
      if (workouts.length === 0) {
        setState({ status: "not_published" });
        return;
      }
      const week = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
      const weekTitles = await listSpcWorkoutWeekTitlesForWorkouts(workouts.map((w) => w.id));
      setSelectedWeek(week);
      setState({ status: "ready", block, workouts, weekTitles });
    } catch (err) {
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  const weeksInBlock = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.from({ length: state.block.block_length_weeks }, (_, i) => i + 1);
  }, [state]);

  // Keyed by workout+week (not just workout) since SPC completion is
  // week-specific — one spc_workout row recurs across every week of the
  // block, so "was this finalized" depends on which week is selected.
  const loadSessionDetails = async (workout) => {
    const key = `${workout.id}:${selectedWeek}`;
    if (sessionDetails[key]) return;
    setLoadingSession(key);
    const [warmups, exercises, completion] = await Promise.all([
      listSpcWarmups(workout.id),
      listSpcWorkoutExercises(workout.id),
      getSpcCompletion(profile.id, workout.id, selectedWeek),
    ]);

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

    setSessionDetails((prev) => ({ ...prev, [key]: { warmups, exercises, completion, loggedByExercise } }));
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
            ? "You're not enrolled in SPC."
            : state.status === "error"
              ? `Something went wrong: ${state.message}`
              : state.status === "not_published"
                ? "Your SPC coach hasn't published this block yet — check back soon."
                : "No active SPC block right now."}
        </Text>
      ) : (
        <>
          <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            SPC Plan
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

          {state.workouts.map((workout) => {
            const key = `${workout.id}:${selectedWeek}`;
            const details = sessionDetails[key];
            const title = state.weekTitles[workout.id]?.[selectedWeek] || workout.title || null;
            return (
              <View key={workout.id} className="mb-4 rounded-lg border border-stone-200 px-4 py-3">
                <Pressable onPress={() => loadSessionDetails(workout)}>
                  <Text style={{ fontFamily: fonts.sansSemiBold }}>
                    Session {workout.session_number}
                    {title ? ` — ${title}` : ""}
                  </Text>
                  {!details ? (
                    <Text className="text-xs" style={{ fontFamily: fonts.sans, color: colors.primaryOnWhite }}>
                      {loadingSession === key ? "Loading…" : "Tap to view"}
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
                      const weekTarget = ex.spc_exercise_weeks.find((w) => w.week_number === selectedWeek);
                      const logged = details.loggedByExercise[ex.exercise_id];
                      return (
                        <View key={ex.id} className="mt-2">
                          <View className="flex-row items-center justify-between">
                            <Text style={{ fontFamily: fonts.sans }}>
                              {ex.exercises?.name} — {weekTarget?.sets ?? "–"}x{weekTarget?.reps ?? "–"}
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
          })}
        </>
      )}
    </ScrollView>
  );
}
