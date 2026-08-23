import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { listExercises } from "../../../../lib/programming/exercises";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../../../lib/scrollToKeyboard";
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
import { toastError } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { nextPosition } from "../../../../lib/position";

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

  // Native has no automatic keyboard-avoidance in this app (see
  // lib/scrollToKeyboard.js) — this builder is a plain ScrollView with a
  // reps/rest/notes TextInput per exercise, unwired until now, so a
  // lower-in-the-list field could sit hidden behind the keyboard with no
  // way to scroll it into view. scrollFieldIntoView is called from the
  // whole item's own ref (itemRefs, keyed by exercise id — a dynamic-length
  // list, so refs live in a Map rather than one per fixed slot), same
  // whole-card-not-just-field target ExerciseCard.js uses for the identical
  // reason. tabBarHeight is subtracted since this screen is a Tabs.Screen
  // under (coach)'s navigator (href:null just hides it from the tab bar
  // list, the bar itself still renders).
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const itemRefs = useRef(new Map());
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
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
    try {
      if (pickerTarget === "warmup") {
        const created = await addTemplateWarmup({ templateId, exerciseId: exercise.id, position: nextPosition(warmups) });
        setWarmups((prev) => [...prev, created]);
      } else if (pickerTarget === "exercise") {
        const created = await addTemplateExercise({
          templateId,
          exerciseId: exercise.id,
          position: nextPosition(exercises),
          sets: exercise.default_sets != null ? Number(exercise.default_sets) : undefined,
          reps: exercise.default_reps || undefined,
        });
        setExercises((prev) => [...prev, created]);
      }
    } catch (err) {
      toastError("Couldn't add exercise", err);
    }
    setPickerTarget(null);
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateTemplateExercise(id, fields).catch((err) => toastError("Couldn't save change", err));
  };

  const handleRemoveExercise = async (id) => {
    const previous = exercises;
    setExercises((prev) => prev.filter((e) => e.id !== id));
    try {
      await removeTemplateExercise(id);
    } catch (err) {
      setExercises(previous);
      toastError("Couldn't remove exercise", err);
    }
  };

  const moveExercise = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= exercises.length) return;
    const reordered = [...exercises];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setExercises(reordered);
    reorderTemplateExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))).catch((err) =>
      toastError("Couldn't reorder exercises", err)
    );
  };

  const adjustSets = (item, delta) => {
    const next = Math.max(0, (item.sets ?? 0) + delta);
    handleExerciseChange(item.id, { sets: next });
  };

  const handleRemoveWarmup = async (id) => {
    const previous = warmups;
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    try {
      await removeTemplateWarmup(id);
    } catch (err) {
      setWarmups(previous);
      toastError("Couldn't remove warm-up", err);
    }
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
      ref={scrollViewRef}
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 32, paddingBottom: 32 + keyboardPadding, maxWidth: 640 }}
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
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
          <View
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
            }}
            className="mb-3 rounded-lg border border-stone-200 px-3 py-3"
          >
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
                onFocus={() => scrollFieldIntoView(itemRefs.current.get(item.id))}
                placeholder="reps"
                className="w-20 rounded-lg border border-stone-300 px-2 py-3"
                style={{ fontFamily: fonts.sans }}
              />
              <TextInput
                value={item.rest ?? ""}
                onChangeText={(v) => handleExerciseChange(item.id, { rest: v })}
                onFocus={() => scrollFieldIntoView(itemRefs.current.get(item.id))}
                placeholder="rest"
                className="w-20 rounded-lg border border-stone-300 px-2 py-3"
                style={{ fontFamily: fonts.sans }}
              />
            </View>
            <TextInput
              value={item.notes ?? ""}
              onChangeText={(v) => handleExerciseChange(item.id, { notes: v })}
              onFocus={() => scrollFieldIntoView(itemRefs.current.get(item.id))}
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
