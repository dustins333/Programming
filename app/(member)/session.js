import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate } from "../../lib/programming/schedule";
import { getMyAssignment, getCurrentBlock, getWorkout, logResult } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { LogResultRow } from "./LogResultRow";
import { fonts, colors } from "../../lib/theme";

// The actual set-by-set logging screen — one tap away from Today (via
// "Start session"), per the design handoff's "Today never contains an
// input field" rule. This is today's index.js's old `ready`-state content,
// moved here almost verbatim.
export default function Session() {
  const { profile } = useAuth();
  const router = useRouter();
  const [state, setState] = useState({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const assignment = await getMyAssignment(profile.id);
      if (!assignment?.group_program_id) {
        setState({ status: "unassigned" });
        return;
      }

      const program = assignment.group_programs;
      const today = todayInBoise();
      const block = await getCurrentBlock(program.id, today);
      if (!block) {
        setState({ status: "no_block", programName: program.name });
        return;
      }

      const sessionNumber = sessionNumberForDate(today);
      if (!sessionNumber) {
        setState({ status: "rest_day", programName: program.name });
        return;
      }

      const weekNumber = currentWeekNumber(block.block_start_date, program.block_length_weeks, today);
      const workout = await getWorkout(block.id, weekNumber, sessionNumber);
      if (!workout) {
        setState({ status: "not_published", programName: program.name, weekNumber, sessionNumber });
        return;
      }

      const [warmups, exercises] = await Promise.all([listWarmups(workout.id), listWorkoutExercises(workout.id)]);
      setState({
        status: "ready",
        programName: program.name,
        source: program.name === "Flagship" ? "flagship" : "bwa",
        weekNumber,
        sessionNumber,
        workout,
        warmups,
        exercises,
      });
    } catch (err) {
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLog = async (exerciseId, values) => {
    await logResult({
      userId: profile.id,
      exerciseId,
      datePerformed: todayInBoise(),
      source: state.source,
      ...values,
    });
  };

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Pressable onPress={() => router.back()} className="mb-4 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>‹ Today</Text>
      </Pressable>

      {state.status === "error" && (
        <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your session: {state.message}
        </Text>
      )}
      {(state.status === "unassigned" || state.status === "no_block" || state.status === "rest_day" || state.status === "not_published") && (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          {state.status === "unassigned" && "You're not assigned to a program yet — check with your coach."}
          {state.status === "no_block" && `No active ${state.programName} block right now.`}
          {state.status === "rest_day" && "Rest day — no session scheduled today."}
          {state.status === "not_published" &&
            `Week ${state.weekNumber}, Session ${state.sessionNumber} isn't published yet — check back soon.`}
        </Text>
      )}

      {state.status === "ready" && (
        <>
          <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {state.programName}
          </Text>
          <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
            Week {state.weekNumber}, Session {state.sessionNumber}
          </Text>

          {state.warmups.length > 0 && (
            <View className="mb-6">
              <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                Warm-up
              </Text>
              {state.warmups.map((w, i) => (
                <Text key={w.id} className="mb-1 text-stone-600" style={{ fontFamily: fonts.sans }}>
                  {i + 1}. {w.exercises?.name ?? w.label} {w.sets ? `— ${w.sets}x${w.reps}` : ""}
                </Text>
              ))}
            </View>
          )}

          <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
            Main Session
          </Text>
          {state.exercises.map((item) => (
            <LogResultRow key={item.id} item={item} onLog={(values) => handleLog(item.exercise_id, values)} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
