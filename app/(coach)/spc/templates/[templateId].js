import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import { listExercises } from "../../../../lib/programming/exercises";
import {
  getTemplate,
  listTemplateWarmups,
  addTemplateWarmup,
  removeTemplateWarmup,
  listTemplateExercises,
  addTemplateExercise,
  updateTemplateExercise,
  removeTemplateExercise,
  reorderTemplateExercises,
} from "../../../../lib/programming/templates";
import { ExercisePickerModal } from "../../../../components/ExercisePickerModal";
import { fonts, colors } from "../../../../lib/theme";

const CATEGORY_LABELS = { away: "Away programming", trial: "Trial session" };

// No draft/publish here — a template isn't itself visible to any member,
// only the one_off_workout copied from it (which is published immediately
// when a coach assigns it). No week columns either: unlike SPC's builder,
// a template is a single flat prescription since it's used once per
// assignment, not progressed over weeks.
export default function TemplateBuilder() {
  const { templateId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [template, setTemplate] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [pickerTarget, setPickerTarget] = useState(null); // "warmup" | "exercise" | null
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, warmupRows, exerciseRows, libraryRows] = await Promise.all([
        getTemplate(templateId),
        listTemplateWarmups(templateId),
        listTemplateExercises(templateId),
        listExercises(),
      ]);
      setTemplate(t);
      setWarmups(warmupRows);
      setExercises(exerciseRows);
      setLibrary(libraryRows);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [templateId]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePick = async (exercise) => {
    if (pickerTarget === "warmup") {
      const created = await addTemplateWarmup({ templateId, exerciseId: exercise.id, position: warmups.length + 1 });
      setWarmups((prev) => [...prev, created]);
    } else if (pickerTarget === "exercise") {
      const created = await addTemplateExercise({ templateId, exerciseId: exercise.id, position: exercises.length + 1 });
      setExercises((prev) => [...prev, created]);
    }
    setPickerTarget(null);
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateTemplateExercise(id, fields);
  };

  const handleRemoveExercise = async (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await removeTemplateExercise(id);
  };

  const moveExercise = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= exercises.length) return;
    const reordered = [...exercises];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setExercises(reordered);
    reorderTemplateExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 })));
  };

  const adjustSets = (item, delta) => {
    const next = Math.max(0, (item.sets ?? 0) + delta);
    handleExerciseChange(item.id, { sets: next });
  };

  const handleRemoveWarmup = async (id) => {
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    await removeTemplateWarmup(id);
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong: {loadError}
        </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
      </View>
    );
  }

  if (!template) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 32, paddingBottom: 32, maxWidth: 640 }}
    >
        <Link href="/(coach)/spc/templates" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to templates
        </Link>
        <Text className="text-xl" style={{ fontFamily: "ProtestStrike_400Regular", color: colors.primary }}>
          {template.name}
        </Text>
        <Text className="mb-6 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {CATEGORY_LABELS[template.category] ?? template.category}
        </Text>

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
          Exercises
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
            <View className="flex-row flex-wrap items-center gap-3">
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
            <TextInput
              value={item.notes ?? ""}
              onChangeText={(v) => handleExerciseChange(item.id, { notes: v })}
              placeholder="Notes (optional)"
              className="mt-2 rounded-lg border border-stone-300 px-2 py-3"
              style={{ fontFamily: fonts.sans }}
            />
          </View>
        ))}
        <Pressable onPress={() => setPickerTarget("exercise")} className="mb-6 rounded-lg border border-primary px-3 py-2.5">
          <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
            + Insert exercise
          </Text>
        </Pressable>

        <ExercisePickerModal
          visible={pickerTarget !== null}
          library={library.filter((e) => (pickerTarget === "warmup" ? e.type === "warmup" : (e.type ?? "lift") !== "warmup"))}
          onClose={() => setPickerTarget(null)}
          onPick={handlePick}
        />
      </ScrollView>
  );
}
