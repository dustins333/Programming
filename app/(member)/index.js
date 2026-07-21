import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate } from "../../lib/programming/schedule";
import { getMyAssignment, getCurrentBlock, getWorkout, logResult } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { LogResultRow } from "./LogResultRow";

export default function MemberHome() {
  const { profile, signOut } = useAuth();
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
        blockId: block.id,
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
        <ActivityIndicator color="#a46a57" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
        Hi, {profile?.name}
      </Text>

      {state.status === "error" && (
        <Text className="mt-4 text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
          Something went wrong loading your plan: {state.message}
        </Text>
      )}
      {state.status === "unassigned" && (
        <Text className="mt-4 text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
          You're not assigned to a program yet — check with your coach.
        </Text>
      )}
      {state.status === "no_block" && (
        <Text className="mt-4 text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
          No active {state.programName} block right now.
        </Text>
      )}
      {state.status === "rest_day" && (
        <Text className="mt-4 text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
          Rest day — no session scheduled today.
        </Text>
      )}
      {state.status === "not_published" && (
        <Text className="mt-4 text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
          Week {state.weekNumber}, Session {state.sessionNumber} isn't published yet — check back soon.
        </Text>
      )}

      {state.status === "ready" && (
        <>
          <Text className="mb-6 text-base text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
            {state.programName} — Week {state.weekNumber}, Session {state.sessionNumber}
          </Text>

          {state.warmups.length > 0 && (
            <View className="mb-6">
              <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                Warm-up
              </Text>
              {state.warmups.map((w, i) => (
                <Text key={w.id} className="mb-1" style={{ fontFamily: "Montserrat_400Regular" }}>
                  {i + 1}. {w.exercises?.name ?? w.label} {w.sets ? `— ${w.sets}x${w.reps}` : ""}
                </Text>
              ))}
            </View>
          )}

          <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Main Session
          </Text>
          {state.exercises.map((item) => (
            <LogResultRow key={item.id} item={item} onLog={(values) => handleLog(item.exercise_id, values)} />
          ))}
        </>
      )}

      <View className="mt-6 flex-row gap-4">
        <Link href="/(member)/plan" style={{ fontFamily: "Montserrat_500Medium" }} className="text-accent">
          Look ahead
        </Link>
        <Link href="/(member)/history" style={{ fontFamily: "Montserrat_500Medium" }} className="text-accent">
          History
        </Link>
      </View>
      <Pressable onPress={signOut} className="mt-6 self-start rounded-lg border border-neutral-300 px-5 py-3">
        <Text style={{ fontFamily: "Montserrat_500Medium" }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
