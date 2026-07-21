import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { listExercises } from "../../../lib/programming/exercises";
import {
  getWorkout,
  listWarmups,
  addWarmup,
  removeWarmup,
  listWorkoutExercises,
  addWorkoutExercise,
  updateWorkoutExercise,
  removeWorkoutExercise,
  reorderWorkoutExercises,
  getSiblingPatterns,
  setWorkoutStatus,
} from "../../../lib/programming/workouts";
import { ExercisePickerModal } from "./ExercisePickerModal";
import { PatternTally } from "./PatternTally";
import { CommentThread } from "./CommentThread";

// Native is a "view + quick adjust" surface, not the full builder — no
// drag-and-drop here (that's web-only, per the build plan). Inserting is a
// searchable picker, reordering is plain up/down buttons.
export default function WorkoutBuilderNative() {
  const { workoutId } = useLocalSearchParams();

  const [workout, setWorkout] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [siblingPatterns, setSiblingPatterns] = useState([]);
  const [pickerTarget, setPickerTarget] = useState(null); // "warmup" | "exercise" | null
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    const w = await getWorkout(workoutId);
    setWorkout(w);
    const [warmupRows, exerciseRows, libraryRows, siblings] = await Promise.all([
      listWarmups(workoutId),
      listWorkoutExercises(workoutId),
      listExercises(),
      getSiblingPatterns(w.group_blocks.id, w.week_number, workoutId),
    ]);
    setWarmups(warmupRows);
    setExercises(exerciseRows);
    setLibrary(libraryRows);
    setSiblingPatterns(siblings);
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePick = async (exercise) => {
    if (pickerTarget === "warmup") {
      const created = await addWarmup({ workoutId, exerciseId: exercise.id, position: warmups.length + 1 });
      setWarmups((prev) => [...prev, created]);
    } else if (pickerTarget === "exercise") {
      const created = await addWorkoutExercise({ workoutId, exerciseId: exercise.id, position: exercises.length + 1 });
      setExercises((prev) => [...prev, created]);
    }
    setPickerTarget(null);
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateWorkoutExercise(id, fields);
  };

  const handleRemoveExercise = async (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await removeWorkoutExercise(id);
  };

  const moveExercise = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= exercises.length) return;
    const reordered = [...exercises];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setExercises(reordered);
    reorderWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 })));
  };

  const adjustSets = (item, delta) => {
    const next = Math.max(0, (item.sets ?? 0) + delta);
    handleExerciseChange(item.id, { sets: next });
  };

  const handleRemoveWarmup = async (id) => {
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    await removeWarmup(id);
  };

  const handleTogglePublish = async () => {
    setPublishing(true);
    try {
      const next = workout.status === "published" ? "draft" : "published";
      await setWorkoutStatus(workoutId, next);
      setWorkout((w) => ({ ...w, status: next }));
    } finally {
      setPublishing(false);
    }
  };

  if (!workout) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#a46a57" />
      </View>
    );
  }

  const currentPatterns = exercises.map((e) => e.exercises?.movement_pattern).filter(Boolean);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-5 py-6">
      <Text className="text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        {workout.group_blocks.group_programs.name} — Wk {workout.week_number}, Session {workout.session_number}
      </Text>
      <Text className={workout.status === "published" ? "mb-4 text-accent" : "mb-4 text-neutral-400"} style={{ fontFamily: "Montserrat_400Regular" }}>
        {workout.status}
      </Text>
      <Pressable onPress={handleTogglePublish} disabled={publishing} className="mb-6 self-start rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
        <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
          {workout.status === "published" ? "Unpublish" : "Publish"}
        </Text>
      </Pressable>

      <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Warm-up
      </Text>
      {warmups.map((w, i) => (
        <View key={w.id} className="mb-2 flex-row items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
          <Text style={{ fontFamily: "Montserrat_400Regular" }}>
            {i + 1}. {w.exercises?.name ?? w.label}
          </Text>
          <Pressable onPress={() => handleRemoveWarmup(w.id)}>
            <Text className="text-neutral-400">✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => setPickerTarget("warmup")} className="mb-6 rounded-lg border border-primary px-3 py-2">
        <Text className="text-center text-accent" style={{ fontFamily: "Montserrat_500Medium" }}>
          + Insert warm-up exercise
        </Text>
      </Pressable>

      <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Main Session
      </Text>
      {exercises.map((item, i) => (
        <View key={item.id} className="mb-3 rounded-lg border border-neutral-200 px-3 py-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="flex-1" style={{ fontFamily: "Montserrat_500Medium" }}>
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
          <View className="flex-row items-center gap-4">
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => adjustSets(item, -1)} className="rounded border border-neutral-300 px-2 py-1">
                <Text>−</Text>
              </Pressable>
              <Text style={{ fontFamily: "Montserrat_400Regular" }}>{item.sets ?? 0} sets</Text>
              <Pressable onPress={() => adjustSets(item, 1)} className="rounded border border-neutral-300 px-2 py-1">
                <Text>+</Text>
              </Pressable>
            </View>
            <TextInput
              value={item.reps ?? ""}
              onChangeText={(v) => handleExerciseChange(item.id, { reps: v })}
              placeholder="reps"
              className="w-20 rounded border border-neutral-300 px-2 py-1.5"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
          </View>
        </View>
      ))}
      <Pressable onPress={() => setPickerTarget("exercise")} className="mb-6 rounded-lg border border-primary px-3 py-2">
        <Text className="text-center text-accent" style={{ fontFamily: "Montserrat_500Medium" }}>
          + Insert exercise
        </Text>
      </Pressable>

      <View className="mb-6">
        <PatternTally currentPatterns={currentPatterns} siblingPatterns={siblingPatterns} />
      </View>

      <CommentThread groupBlockId={workout.group_blocks.id} />

      <ExercisePickerModal
        visible={pickerTarget !== null}
        library={library}
        onClose={() => setPickerTarget(null)}
        onPick={handlePick}
      />
    </ScrollView>
  );
}
