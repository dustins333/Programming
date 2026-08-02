import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { listExercises } from "../../../../lib/programming/exercises";
import { getUser } from "../../../../lib/programming/clients";
import {
  getSpcWorkout,
  listSpcWarmups,
  addSpcWarmup,
  removeSpcWarmup,
  listSpcWorkoutExercises,
  addSpcWorkoutExercise,
  updateSpcWorkoutExercise,
  removeSpcWorkoutExercise,
  reorderSpcWorkoutExercises,
  getSpcSiblingPatterns,
  setSpcWorkoutStatus,
  setSpcWorkoutTitle,
} from "../../../../lib/programming/spcWorkouts";
import { ExercisePickerModal } from "../../../../components/ExercisePickerModal";
import { CommentThread } from "../../../../components/CommentThread";
import { PatternTally } from "../../../../components/PatternTally";
import { fonts, colors } from "../../../../lib/theme";

// Native is a "view + quick adjust" surface, same philosophy as the group
// builder's native screen — no drag-and-drop, no week columns anymore
// either now that SPC has one independently-editable row per (week,
// session), same as group.
export default function SpcWorkoutBuilderNative() {
  const { workoutId } = useLocalSearchParams();
  const router = useRouter();

  const [workout, setWorkout] = useState(null);
  const [member, setMember] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [siblingPatterns, setSiblingPatterns] = useState([]);
  const [pickerTarget, setPickerTarget] = useState(null); // "warmup" | "exercise" | null
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    const w = await getSpcWorkout(workoutId);
    setWorkout(w);
    const [memberRow, warmupRows, exerciseRows, libraryRows, siblings] = await Promise.all([
      getUser(w.spc_blocks.spc_client_id),
      listSpcWarmups(workoutId),
      listSpcWorkoutExercises(workoutId),
      listExercises(),
      getSpcSiblingPatterns(w.spc_blocks.id, w.week_number, workoutId),
    ]);
    setMember(memberRow);
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
      const created = await addSpcWarmup({
        workoutId,
        exerciseId: exercise.id,
        position: warmups.length + 1,
        sets: exercise.default_sets != null ? String(exercise.default_sets) : undefined,
        reps: exercise.default_reps || undefined,
      });
      setWarmups((prev) => [...prev, created]);
    } else if (pickerTarget === "exercise") {
      const created = await addSpcWorkoutExercise({
        workoutId,
        exerciseId: exercise.id,
        position: exercises.length + 1,
        userId: workout.spc_blocks.spc_client_id,
      });
      setExercises((prev) => [...prev, created]);
    }
    setPickerTarget(null);
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateSpcWorkoutExercise(id, fields);
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

  const adjustSets = (item, delta) => {
    const next = Math.max(0, (item.sets ?? 0) + delta);
    handleExerciseChange(item.id, { sets: next });
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

  const handleTitleChange = (title) => {
    setWorkout((w) => ({ ...w, title }));
    setSpcWorkoutTitle(workoutId, title);
  };

  if (!workout || !member) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const currentPatterns = exercises.map((e) => e.exercises?.movement_pattern).filter(Boolean);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-5 py-6">
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.push(`/(coach)/spc/blocks/${workout.spc_blocks.id}`)
        }
        className="mb-3 self-start"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>‹ Back</Text>
      </Pressable>
      <Text className="text-xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
        {member.name} — Wk {workout.week_number}, Session {workout.session_number}
      </Text>
      <Text
        className="mb-4 text-xs"
        style={{ fontFamily: fonts.sansMedium, color: workout.status === "published" ? "#8a5140" : "#a8a29e" }}
      >
        {workout.status}
      </Text>
      <Pressable onPress={handleTogglePublish} disabled={publishing} className="mb-4 self-start rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {workout.status === "published" ? "Unpublish" : "Publish"}
        </Text>
      </Pressable>

      <TextInput
        value={workout.title ?? ""}
        onChangeText={handleTitleChange}
        placeholder="Session title (e.g. Back & Bis) — shown to the member"
        className="mb-6 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />

      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
        Warm-up
      </Text>
      {warmups.length > 0 && (
        <View className="mb-2 rounded-xl px-3.5" style={{ backgroundColor: "#faf7f4", borderWidth: 1, borderColor: "#f0ebe6" }}>
          {warmups.map((w, i) => (
            <View
              key={w.id}
              className="flex-row items-center justify-between py-2.5"
              style={i < warmups.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f0ebe6" } : undefined}
            >
              <Text className="text-stone-700" style={{ fontFamily: fonts.sans, fontSize: 14 }}>
                {i + 1}. {w.exercises?.name ?? w.label}
              </Text>
              <Pressable
                onPress={() => handleRemoveWarmup(w.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={`Remove warm-up exercise ${w.exercises?.name ?? w.label ?? i + 1}`}
              >
                <Text className="text-stone-400">✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <Pressable onPress={() => setPickerTarget("warmup")} className="mb-6 rounded-lg border border-primary px-3 py-2.5">
        <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
          + Insert warm-up exercise
        </Text>
      </Pressable>

      <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
        Main Session
      </Text>

      {exercises.map((item, i) => (
        <View key={item.id} className="mb-3 rounded-lg border border-stone-200 px-3 py-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="flex-1" style={{ fontFamily: fonts.sansMedium }}>
              {item.exercises?.name}
            </Text>
            {item.exercises?.video_url ? (
              <Pressable
                onPress={() => Linking.openURL(item.exercises.video_url)}
                className="mr-2"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={`Watch video for ${item.exercises.name}`}
              >
                <Text style={{ color: "#8a5140" }}>▶</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => moveExercise(i, -1)}
              disabled={i === 0}
              className="mr-1 px-1"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Move exercise up"
            >
              <Text className={i === 0 ? "text-stone-200" : "text-stone-500"}>▲</Text>
            </Pressable>
            <Pressable
              onPress={() => moveExercise(i, 1)}
              disabled={i === exercises.length - 1}
              className="mr-1 px-1"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Move exercise down"
            >
              <Text className={i === exercises.length - 1 ? "text-stone-200" : "text-stone-500"}>▼</Text>
            </Pressable>
            <Pressable
              onPress={() => handleRemoveExercise(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={`Remove ${item.exercises?.name ?? "exercise"}`}
            >
              <Text className="text-stone-400">✕</Text>
            </Pressable>
          </View>
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => adjustSets(item, -1)} className="rounded border border-stone-300 px-2 py-1">
                <Text>−</Text>
              </Pressable>
              <Text style={{ fontFamily: fonts.sans }}>{item.sets ?? 0} sets</Text>
              <Pressable onPress={() => adjustSets(item, 1)} className="rounded border border-stone-300 px-2 py-1">
                <Text>+</Text>
              </Pressable>
            </View>
            <TextInput
              value={item.reps ?? ""}
              onChangeText={(v) => handleExerciseChange(item.id, { reps: v })}
              placeholder="reps"
              className="w-20 rounded-lg border border-stone-300 px-2 py-3"
              style={{ fontFamily: fonts.sans }}
            />
            <TextInput
              value={item.rest ?? ""}
              onChangeText={(v) => handleExerciseChange(item.id, { rest: v })}
              placeholder="rest"
              className="w-20 rounded-lg border border-stone-300 px-2 py-3"
              style={{ fontFamily: fonts.sans }}
            />
          </View>
        </View>
      ))}
      <Pressable onPress={() => setPickerTarget("exercise")} className="mb-6 rounded-lg border border-primary px-3 py-2.5">
        <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
          + Insert exercise
        </Text>
      </Pressable>

      <View className="mb-6">
        <PatternTally currentPatterns={currentPatterns} siblingPatterns={siblingPatterns} />
      </View>

      <CommentThread spcBlockId={workout.spc_blocks.id} />

      <ExercisePickerModal
        visible={pickerTarget !== null}
        library={library.filter((e) => (pickerTarget === "warmup" ? e.type === "warmup" : (e.type ?? "lift") !== "warmup"))}
        onClose={() => setPickerTarget(null)}
        onPick={handlePick}
      />
    </ScrollView>
  );
}
