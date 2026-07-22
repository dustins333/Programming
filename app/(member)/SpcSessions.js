import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import { getSpcClient } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";
import { logResult } from "../../lib/programming/memberPlan";
import { LogResultRow } from "./LogResultRow";
import { fonts } from "../../lib/theme";

// SPC has no day-of-week routing like group programming does (no
// deterministic session-per-day mapping) — every published session in the
// current block is shown at once and the member picks the right one for
// that visit, same reasoning the kiosk phase (Phase 6) uses for per-visit
// client selection.
export function SpcSessions({ userId }) {
  const [state, setState] = useState({ status: "loading" });
  const [selectedWeek, setSelectedWeek] = useState(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const assignment = await getSpcClient(userId);
      if (!assignment) {
        setState({ status: "unassigned" });
        return;
      }

      const today = todayInBoise();
      const block = await getCurrentSpcBlock(userId, today);
      if (!block) {
        setState({ status: "no_block" });
        return;
      }

      const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
      if (workouts.length === 0) {
        setState({ status: "not_published" });
        return;
      }

      const sessions = await Promise.all(
        workouts.map(async (w) => {
          const [warmups, exercises] = await Promise.all([listSpcWarmups(w.id), listSpcWorkoutExercises(w.id)]);
          return { workout: w, warmups, exercises };
        })
      );

      setSelectedWeek(currentWeekNumber(block.block_start_date, block.block_length_weeks, today));
      setState({ status: "ready", block, sessions });
    } catch (err) {
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLog = async (exerciseId, values) => {
    await logResult({ userId, exerciseId, datePerformed: todayInBoise(), source: "spc", ...values });
  };

  if (state.status === "loading") {
    return <ActivityIndicator color="#a46a57" />;
  }
  // Not enrolled in SPC or no active block right now — nothing to show
  // here; the parent screen's own "unassigned" messaging covers the
  // fully-unassigned case.
  if (state.status === "unassigned" || state.status === "no_block") {
    return null;
  }
  if (state.status === "error") {
    return (
      <Text className="mt-4 text-red-600" style={{ fontFamily: fonts.sans }}>
        Something went wrong loading your SPC program: {state.message}
      </Text>
    );
  }
  if (state.status === "not_published") {
    return (
      <Text className="mt-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
        Your SPC coach hasn't published this block yet — check back soon.
      </Text>
    );
  }

  const weekNumbers = Array.from({ length: state.block.block_length_weeks }, (_, i) => i + 1);

  return (
    <View className="mt-6">
      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        SPC
      </Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {weekNumbers.map((n) => (
          <Pressable
            key={n}
            onPress={() => setSelectedWeek(n)}
            className={`rounded-full border px-3.5 py-2.5 ${selectedWeek === n ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={selectedWeek === n ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              Week {n}
            </Text>
          </Pressable>
        ))}
      </View>

      {state.sessions.map(({ workout, warmups, exercises }) => (
        <View key={workout.id} className="mb-6">
          <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
            Session {workout.session_number}
          </Text>
          {warmups.length > 0 && (
            <View className="mb-3">
              {warmups.map((w, i) => (
                <Text key={w.id} className="mb-1" style={{ fontFamily: fonts.sans }}>
                  {i + 1}. {w.exercises?.name ?? w.label} {w.sets ? `— ${w.sets}x${w.reps}` : ""}
                </Text>
              ))}
            </View>
          )}
          {exercises.map((ex) => {
            const week = ex.spc_exercise_weeks.find((w) => w.week_number === selectedWeek);
            const displayItem = {
              exercises: ex.exercises,
              sets: week?.sets ?? null,
              reps: week?.reps ?? null,
              tempo: null,
              notes: [week?.rest ? `rest ${week.rest}` : null, ex.notes].filter(Boolean).join(" · "),
            };
            return <LogResultRow key={ex.id} item={displayItem} onLog={(values) => handleLog(ex.exercise_id, values)} />;
          })}
        </View>
      ))}
    </View>
  );
}
