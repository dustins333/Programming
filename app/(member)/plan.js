import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate } from "../../lib/programming/schedule";
import { getMyAssignment, getCurrentBlock, getWorkout } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getSpcClient } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";
import {
  getGroupCompletion,
  getNextIncompleteSpcWorkout,
  finalizeGroupSession,
  finalizeSpcSession,
} from "../../lib/programming/sessionCompletions";
import { SessionLogger } from "../../components/SessionLogger";
import { fonts, colors } from "../../lib/theme";

export default function MyFitness() {
  const { profile } = useAuth();
  const router = useRouter();
  const [group, setGroup] = useState({ status: "loading" });
  const [hasSpc, setHasSpc] = useState(false);
  const [spc, setSpc] = useState(null);

  const load = useCallback(async () => {
    setGroup({ status: "loading" });
    const today = todayInBoise();

    // Group and SPC load independently — a member with only one of the two
    // (or neither) shouldn't have one section's failure hide the other.
    try {
      const assignment = await getMyAssignment(profile.id);
      if (!assignment?.group_program_id) {
        setGroup({ status: "unassigned" });
      } else {
        const program = assignment.group_programs;
        const block = await getCurrentBlock(program.id, today);
        if (!block) {
          setGroup({ status: "no_block", programName: program.name });
        } else {
          const sessionNumber = sessionNumberForDate(today);
          if (!sessionNumber) {
            setGroup({ status: "rest_day", programName: program.name });
          } else {
            const weekNumber = currentWeekNumber(block.block_start_date, program.block_length_weeks, today);
            const workout = await getWorkout(block.id, weekNumber, sessionNumber);
            if (!workout) {
              setGroup({ status: "not_published", programName: program.name, weekNumber, sessionNumber });
            } else {
              const [completion, warmups, exerciseRows] = await Promise.all([
                getGroupCompletion(profile.id, workout.id),
                listWarmups(workout.id),
                listWorkoutExercises(workout.id),
              ]);
              setGroup({
                status: "ready",
                programName: program.name,
                source: program.name === "Flagship" ? "flagship" : "bwa",
                weekNumber,
                sessionNumber,
                workout,
                warmups,
                completed: !!completion,
                exercises: exerciseRows.map((ex) => ({
                  id: ex.id,
                  exercise: ex.exercises,
                  targetSets: ex.sets,
                  targetReps: ex.reps,
                  notes: ex.tempo ? `tempo ${ex.tempo}` : null,
                })),
              });
            }
          }
        }
      }
    } catch (err) {
      setGroup({ status: "error", message: err.message ?? String(err) });
    }

    try {
      const spcClient = await getSpcClient(profile.id);
      setHasSpc(!!spcClient);
      if (!spcClient) {
        setSpc(null);
      } else {
        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) {
          setSpc({ status: "no_block" });
        } else {
          const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
          if (workouts.length === 0) {
            setSpc({ status: "not_published" });
          } else {
            const weekNumber = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
            const next = await getNextIncompleteSpcWorkout(profile.id, workouts, weekNumber, spcClient.sessions_per_week);
            if (!next) {
              setSpc({ status: "done" });
            } else {
              const exerciseRows = await listSpcWorkoutExercises(next.id);
              setSpc({
                status: "ready",
                sessionNumber: next.session_number,
                weekNumber,
                workout: next,
                completed: false,
                exercises: exerciseRows.map((ex) => {
                  const weekTarget = ex.spc_exercise_weeks.find((w) => w.week_number === weekNumber);
                  return {
                    id: ex.id,
                    exercise: ex.exercises,
                    targetSets: weekTarget?.sets,
                    targetReps: weekTarget?.reps,
                    notes: weekTarget?.rest ? `rest ${weekTarget.rest}` : ex.notes,
                  };
                }),
              });
            }
          }
        }
      }
    } catch {
      setHasSpc(false);
      setSpc(null);
    }
  }, [profile.id]);

  // Refetch on every focus, not just first mount — same reasoning as
  // Today: Tabs keep this screen mounted, so without this, coming back
  // here later wouldn't pick up state that changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleFinalizeGroup = async () => {
    await finalizeGroupSession(profile.id, group.workout.id);
    setGroup((g) => ({ ...g, completed: true }));
  };

  const handleFinalizeSpc = async () => {
    await finalizeSpcSession(profile.id, spc.workout.id, spc.weekNumber);
    setSpc((s) => ({ ...s, completed: true }));
  };

  if (group.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const noGroupProgram = group.status === "unassigned" || group.status === "no_block";
  const nothingForSpc = !hasSpc || !spc || spc.status === "no_block" || spc.status === "not_published";
  if (noGroupProgram && group.status !== "error" && nothingForSpc) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          {group.status === "unassigned"
            ? "You're not assigned to a program yet — check with your coach."
            : "No active block right now."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        My Fitness
      </Text>

      {group.status === "error" && (
        <Text className="mb-4 text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your plan: {group.message}
        </Text>
      )}
      {group.status === "unassigned" && hasSpc && (
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          No group program right now — check with your coach.
        </Text>
      )}
      {group.status === "no_block" && (
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          No active {group.programName} block right now.
        </Text>
      )}
      {group.status === "rest_day" && (
        <View className="mb-6 rounded-2xl border border-dashed border-stone-300 px-5 py-6 items-center">
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-600">
            Rest day
          </Text>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            No session scheduled today
          </Text>
        </View>
      )}
      {group.status === "not_published" && (
        <Text className="mb-6 text-stone-400" style={{ fontFamily: fonts.sans }}>
          Week {group.weekNumber}, Session {group.sessionNumber} isn't published yet — check back soon.
        </Text>
      )}

      {group.status === "ready" && (
        <View className="mb-8">
          <Text className="mb-1 text-lg" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
            {group.programName} — Week {group.weekNumber}, Session {group.sessionNumber}
          </Text>
          {group.warmups.length > 0 && (
            <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Warm-up: {group.warmups.map((w) => w.exercises?.name ?? w.label).join(", ")}
            </Text>
          )}
          <Pressable
            onPress={() => router.push("/(member)/plan-block")}
            className="mb-4 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
              View full block →
            </Text>
          </Pressable>

          <SessionLogger
            userId={profile.id}
            datePerformed={todayInBoise()}
            source={group.source}
            exercises={group.exercises}
            isCompleted={group.completed}
            onFinalize={handleFinalizeGroup}
          />
        </View>
      )}

      {spc?.status === "done" && (
        <View className="mb-6 rounded-2xl border border-stone-200 px-5 py-4">
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
            SPC
          </Text>
          <Text className="mb-2 mt-1 text-sm" style={{ fontFamily: fonts.sansMedium, color: "#4d6142" }}>
            ✓ No remaining sessions this week
          </Text>
          <Pressable
            onPress={() => router.push("/(member)/plan-spc-block")}
            className="self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
              View full SPC block →
            </Text>
          </Pressable>
        </View>
      )}

      {spc?.status === "not_published" && (
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Your SPC coach hasn't published this block yet — check back soon.
        </Text>
      )}

      {spc?.status === "ready" && (
        <View className="mb-8">
          <Text className="mb-1 text-lg" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
            SPC — Session {spc.sessionNumber}
          </Text>
          <Pressable
            onPress={() => router.push("/(member)/plan-spc-block")}
            className="mb-4 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
              View full SPC block →
            </Text>
          </Pressable>

          <SessionLogger
            userId={profile.id}
            datePerformed={todayInBoise()}
            source="spc"
            exercises={spc.exercises}
            isCompleted={spc.completed}
            onFinalize={handleFinalizeSpc}
          />
        </View>
      )}
    </ScrollView>
  );
}
