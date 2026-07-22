import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listExercises } from "../../../../lib/programming/exercises";
import { getUser } from "../../../../lib/programming/clients";
import {
  getSpcWorkout,
  listSpcWarmups,
  addSpcWarmup,
  removeSpcWarmup,
  listSpcWorkoutExercises,
  addSpcWorkoutExercise,
  removeSpcWorkoutExercise,
  reorderSpcWorkoutExercises,
  updateSpcExerciseWeek,
  setSpcWorkoutStatus,
} from "../../../../lib/programming/spcWorkouts";
import { ExercisePickerModal } from "../../builder/ExercisePickerModal";
import { CommentThread } from "../../builder/CommentThread";
import { fonts, colors } from "../../../../lib/theme";

// Native is a "view + quick adjust" surface, same philosophy as the group
// builder's native screen — no drag-and-drop, no wide week-by-week table.
// Instead of showing every week column at once (unusable on a phone), a
// week selector picks which week's numbers are being edited.
export default function SpcWorkoutBuilderNative() {
  const { workoutId } = useLocalSearchParams();
  const { profile } = useAuth();

  const [workout, setWorkout] = useState(null);
  const [member, setMember] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [pickerTarget, setPickerTarget] = useState(null); // "warmup" | "exercise" | null
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    const w = await getSpcWorkout(workoutId);
    setWorkout(w);
    const [memberRow, warmupRows, exerciseRows, libraryRows] = await Promise.all([
      getUser(w.spc_blocks.spc_client_id),
      listSpcWarmups(workoutId),
      listSpcWorkoutExercises(workoutId),
      listExercises(),
    ]);
    setMember(memberRow);
    setWarmups(warmupRows);
    setExercises(exerciseRows);
    setLibrary(libraryRows);
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePick = async (exercise) => {
    if (pickerTarget === "warmup") {
      const created = await addSpcWarmup({ workoutId, exerciseId: exercise.id, position: warmups.length + 1 });
      setWarmups((prev) => [...prev, created]);
    } else if (pickerTarget === "exercise") {
      const created = await addSpcWorkoutExercise({
        workoutId,
        exerciseId: exercise.id,
        position: exercises.length + 1,
        blockLengthWeeks: workout.spc_blocks.block_length_weeks,
        userId: workout.spc_blocks.spc_client_id,
      });
      setExercises((prev) => [...prev, created]);
    }
    setPickerTarget(null);
  };

  const handleWeekFieldChange = (exerciseId, weekId, fields) => {
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== exerciseId
          ? e
          : { ...e, spc_exercise_weeks: e.spc_exercise_weeks.map((w) => (w.id !== weekId ? w : { ...w, ...fields })) }
      )
    );
    updateSpcExerciseWeek(weekId, fields, profile.name);
  };

  const handleRemoveExercise = async (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await removeSpcWorkoutExercise(id);
  };

  const moveExercise = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= exercises.length) return;
    const reordered = [...exercises];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setExercises(reordered);
    reorderSpcWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 })));
  };

  const handleRemoveWarmup = async (id) => {
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    await removeSpcWarmup(id);
  };

  const handleTogglePublish = async () => {
    setPublishing(true);
    try {
      const next = workout.status === "published" ? "draft" : "published";
      await setSpcWorkoutStatus(workoutId, next);
      setWorkout((w) => ({ ...w, status: next }));
    } finally {
      setPublishing(false);
    }
  };

  if (!workout || !member) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const blockLengthWeeks = workout.spc_blocks.block_length_weeks;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-5 py-6">
      <Text className="text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
        {member.name} — Session {workout.session_number}
      </Text>
      <Text className={workout.status === "published" ? "mb-4 text-accent" : "mb-4 text-neutral-400"} style={{ fontFamily: fonts.sans }}>
        {workout.status}
      </Text>
      <Pressable onPress={handleTogglePublish} disabled={publishing} className="mb-6 self-start rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {workout.status === "published" ? "Unpublish" : "Publish"}
        </Text>
      </Pressable>

      <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Warm-up
      </Text>
      {warmups.map((w, i) => (
        <View key={w.id} className="mb-2 flex-row items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
          <Text style={{ fontFamily: fonts.sans }}>
            {i + 1}. {w.exercises?.name ?? w.label}
          </Text>
          <Pressable onPress={() => handleRemoveWarmup(w.id)}>
            <Text className="text-neutral-400">✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => setPickerTarget("warmup")} className="mb-6 rounded-lg border border-primary px-3 py-2">
        <Text className="text-center text-accent" style={{ fontFamily: fonts.sansMedium }}>
          + Insert warm-up exercise
        </Text>
      </Pressable>

      <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Main Session
      </Text>

      <Text className="mb-2 text-xs text-neutral-500" style={{ fontFamily: fonts.sans }}>
        Editing week:
      </Text>
      <View className="mb-4 flex-row gap-2">
        {Array.from({ length: blockLengthWeeks }, (_, i) => i + 1).map((weekNumber) => (
          <Pressable
            key={weekNumber}
            onPress={() => setSelectedWeek(weekNumber)}
            className={`rounded-full border px-3 py-1.5 ${selectedWeek === weekNumber ? "border-primary bg-primary" : "border-neutral-300"}`}
          >
            <Text className={selectedWeek === weekNumber ? "text-white" : "text-neutral-700"} style={{ fontFamily: fonts.sans }}>
              Wk {weekNumber}
            </Text>
          </Pressable>
        ))}
      </View>

      {exercises.map((item, i) => {
        const week = item.spc_exercise_weeks.find((w) => w.week_number === selectedWeek);
        return (
          <View key={item.id} className="mb-3 rounded-lg border border-neutral-200 px-3 py-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="flex-1" style={{ fontFamily: fonts.sansMedium }}>
                {item.exercises?.name}
              </Text>
              {item.exercises?.video_url ? (
                <Pressable onPress={() => Linking.openURL(item.exercises.video_url)} className="mr-2">
                  <Text className="text-accent">▶</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => moveExercise(i, -1)} disabled={i === 0} className="mr-1 px-1">
                <Text className={i === 0 ? "text-neutral-200" : "text-neutral-500"}>▲</Text>
              </Pressable>
              <Pressable onPress={() => moveExercise(i, 1)} disabled={i === exercises.length - 1} className="mr-1 px-1">
                <Text className={i === exercises.length - 1 ? "text-neutral-200" : "text-neutral-500"}>▼</Text>
              </Pressable>
              <Pressable onPress={() => handleRemoveExercise(item.id)}>
                <Text className="text-neutral-400">✕</Text>
              </Pressable>
            </View>
            {week ? (
              <>
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => handleWeekFieldChange(item.id, week.id, { sets: Math.max(0, (week.sets ?? 0) - 1) })}
                      className="rounded border border-neutral-300 px-2 py-1"
                    >
                      <Text>−</Text>
                    </Pressable>
                    <Text style={{ fontFamily: fonts.sans }}>{week.sets ?? 0} sets</Text>
                    <Pressable
                      onPress={() => handleWeekFieldChange(item.id, week.id, { sets: (week.sets ?? 0) + 1 })}
                      className="rounded border border-neutral-300 px-2 py-1"
                    >
                      <Text>+</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    value={week.reps ?? ""}
                    onChangeText={(v) => handleWeekFieldChange(item.id, week.id, { reps: v })}
                    placeholder="reps"
                    className="w-20 rounded border border-neutral-300 px-2 py-1.5"
                    style={{ fontFamily: fonts.sans }}
                  />
                  <TextInput
                    value={week.rest ?? ""}
                    onChangeText={(v) => handleWeekFieldChange(item.id, week.id, { rest: v })}
                    placeholder="rest"
                    className="w-20 rounded border border-neutral-300 px-2 py-1.5"
                    style={{ fontFamily: fonts.sans }}
                  />
                </View>
                <Text className="mt-1 text-xs text-neutral-400" style={{ fontFamily: fonts.sans }}>
                  {week.coach_initials ? `Last touched ${week.coach_initials} ${week.touched_date}` : "Not touched yet"}
                </Text>
              </>
            ) : null}
          </View>
        );
      })}
      <Pressable onPress={() => setPickerTarget("exercise")} className="mb-6 rounded-lg border border-primary px-3 py-2">
        <Text className="text-center text-accent" style={{ fontFamily: fonts.sansMedium }}>
          + Insert exercise
        </Text>
      </Pressable>

      <CommentThread spcBlockId={workout.spc_blocks.id} />

      <ExercisePickerModal
        visible={pickerTarget !== null}
        library={library}
        onClose={() => setPickerTarget(null)}
        onPick={handlePick}
      />
    </ScrollView>
  );
}
