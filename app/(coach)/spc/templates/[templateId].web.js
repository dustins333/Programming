import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listExercises, createExercise, summarizeRepScheme } from "../../../../lib/programming/exercises";
import {
  getTemplate,
  listTemplateWarmups,
  addTemplateWarmup,
  updateTemplateWarmup,
  removeTemplateWarmup,
  listTemplateExercises,
  addTemplateExercise,
  updateTemplateExercise,
  removeTemplateExercise,
  reorderTemplateExercises,
} from "../../../../lib/programming/templates";
import { ExerciseFormModal } from "../../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../../components/ExercisePickerModal";
import { ExerciseLibrarySidebar } from "../../../../components/ExerciseLibrarySidebar";
import { fonts, colors } from "../../../../lib/theme";
import { toastError } from "../../../../lib/toast";

const CATEGORY_LABELS = { away: "Away programming", trial: "Trial session" };

function RepSchemeRows({ item, onChange }) {
  const scheme = item.rep_scheme?.length ? item.rep_scheme : [item.reps ?? ""];

  const commit = (next) => {
    onChange(item.id, { rep_scheme: next, sets: next.length, reps: summarizeRepScheme(next) });
  };

  return (
    <View className="mt-2">
      {scheme.map((reps, i) => (
        <View key={i} className="mb-1.5 flex-row items-center gap-2">
          <Text className="w-12 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
            Set {i + 1}
          </Text>
          <TextInput
            value={reps ?? ""}
            onChangeText={(v) => commit(scheme.map((r, idx) => (idx === i ? v : r)))}
            placeholder="reps (e.g. 10-12)"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2.5"
            style={{ fontFamily: fonts.sans }}
          />
          {scheme.length > 1 ? (
            <Pressable
              onPress={() => commit(scheme.filter((_, idx) => idx !== i))}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={`Remove set ${i + 1}`}
            >
              <Text className="text-stone-400">✕</Text>
            </Pressable>
          ) : (
            <View style={{ width: 18 }} />
          )}
        </View>
      ))}
      <Pressable onPress={() => commit([...scheme, scheme[scheme.length - 1] ?? ""])} className="self-start">
        <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: "#8a5140" }}>
          + Add set
        </Text>
      </Pressable>
    </View>
  );
}

function SortableExerciseRow({ item, onChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <View className="mb-2 rounded-lg border border-stone-200 px-3 py-2.5">
        <View className="flex-row items-center gap-3">
          <div {...attributes} {...listeners} style={{ cursor: "grab", padding: 4 }}>
            ⠿
          </div>
          <View className="flex-1">
            <Text style={{ fontFamily: fonts.sansMedium }}>{item.exercises?.name}</Text>
            {item.exercises?.video_url ? (
              <Pressable
                onPress={() => Linking.openURL(item.exercises.video_url)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={`Watch video for ${item.exercises.name}`}
              >
                <Text className="text-xs" style={{ fontFamily: fonts.sans, color: "#8a5140" }}>
                  ▶ video
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => onRemove(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`Remove ${item.exercises?.name ?? "exercise"}`}
          >
            <Text className="text-stone-400">✕</Text>
          </Pressable>
        </View>

        <RepSchemeRows item={item} onChange={onChange} />

        <View className="mt-2 flex-row gap-2">
          <TextInput
            value={item.rest ?? ""}
            onChangeText={(v) => onChange(item.id, { rest: v })}
            placeholder="rest"
            className="w-20 rounded-lg border border-stone-300 px-2 py-2.5 text-center"
            style={{ fontFamily: fonts.sans }}
          />
          <TextInput
            value={item.notes ?? ""}
            onChangeText={(v) => onChange(item.id, { notes: v })}
            placeholder="notes"
            className="flex-1 rounded-lg border border-stone-300 px-2 py-2.5"
            style={{ fontFamily: fonts.sans }}
          />
        </View>
      </View>
    </div>
  );
}

// Web-only drag-and-drop template builder — mirrors the group/SPC workout
// builders' interaction model (dnd-kit library sidebar + sortable session
// list + a warmup drop zone) instead of the plain click-based native
// version at the sibling [templateId].js. No publish/status (templates
// aren't visible to any member directly, only the one_off_workout copied
// from one — see oneOffWorkouts.js), no per-week columns (a template is a
// single flat prescription, used once per assignment), no comments/pattern
// tally (no block/siblings concept for a standalone template).
export default function TemplateBuilderWeb() {
  const { templateId } = useLocalSearchParams();
  const { profile } = useAuth();

  const [template, setTemplate] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState("");
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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

  const handleInsertExercise = async (exercise) => {
    try {
      const created = await addTemplateExercise({ templateId, exerciseId: exercise.id, position: exercises.length + 1 });
      setExercises((prev) => [...prev, created]);
    } catch (err) {
      toastError("Couldn't add exercise", err);
    }
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateTemplateExercise(id, fields).catch((err) => toastError("Couldn't save change", err));
  };

  const handleRemoveExercise = async (id) => {
    const removed = exercises.find((e) => e.id === id);
    const removedIndex = exercises.findIndex((e) => e.id === id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    try {
      await removeTemplateExercise(id);
    } catch (err) {
      toastError("Couldn't remove exercise", err);
      if (removed) setExercises((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleAddWarmup = async (exercise) => {
    try {
      const created = await addTemplateWarmup({ templateId, exerciseId: exercise.id, position: warmups.length + 1 });
      setWarmups((prev) => [...prev, created]);
    } catch (err) {
      toastError("Couldn't add warm-up", err);
    }
  };

  const handleRemoveWarmup = async (id) => {
    const removed = warmups.find((w) => w.id === id);
    const removedIndex = warmups.findIndex((w) => w.id === id);
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    try {
      await removeTemplateWarmup(id);
    } catch (err) {
      toastError("Couldn't remove warm-up", err);
      if (removed) setWarmups((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleNewExerciseCreated = async (form) => {
    try {
      const created = await createExercise({ ...form, createdBy: profile.id });
      setLibrary((prev) => [...prev, created]);
    } catch (err) {
      toastError("Failed to save exercise", err);
      throw err;
    }
  };

  // Only reordering already-placed exercises uses drag now (SortableContext
  // below) — inserting from the library is click-only, see
  // components/ExerciseLibrarySidebar.js.
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const oldIndex = exercises.findIndex((e) => e.id === active.id);
      const newIndex = exercises.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(exercises, oldIndex, newIndex);
      setExercises(reordered);
      reorderTemplateExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))).catch((err) =>
        toastError("Couldn't save reorder", err)
      );
    }
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#8a5140" }}>Retry</Text>
        </Pressable>
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
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <View className="flex-1 flex-row bg-white">
        <ExerciseLibrarySidebar
          library={library}
          search={search}
          onSearchChange={setSearch}
          onNewExercise={() => setNewExerciseModalVisible(true)}
          onInsertLift={handleInsertExercise}
          onInsertWarmup={handleAddWarmup}
        />

        <ScrollView className="flex-1 px-8 py-6">
          <Link href="/(coach)/spc/templates" style={{ fontFamily: fonts.sansMedium, color: "#8a5140", marginBottom: 12 }}>
            ‹ Back to templates
          </Link>
          <Text className="text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
            {template.name}
          </Text>
          <Text className="mb-6 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {CATEGORY_LABELS[template.category] ?? template.category}
          </Text>

          <View className="mb-6 rounded-xl p-2.5">
            <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
              Warm-up
            </Text>
            {warmups.length > 0 && (
              <View className="mb-2 rounded-xl px-3.5" style={{ backgroundColor: "#faf7f4", borderWidth: 1, borderColor: "#f0ebe6" }}>
                {warmups.map((w, i) => (
                  <View
                    key={w.id}
                    className="flex-row items-center gap-2 py-2.5"
                    style={i < warmups.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f0ebe6" } : undefined}
                  >
                    <Text className="w-5 text-xs text-stone-400">{i + 1}.</Text>
                    <Text className="flex-1 text-stone-700" style={{ fontFamily: fonts.sansMedium, fontSize: 14 }}>
                      {w.exercises?.name ?? w.label}
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
            <Pressable onPress={() => setWarmupPickerVisible(true)} className="rounded-lg border border-primary px-3 py-2.5">
              <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
                + Insert warm-up exercise
              </Text>
            </Pressable>
            <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              Max 5-6 movements.
            </Text>
          </View>

          <View className="mb-6 rounded-xl p-2.5">
            <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
              Exercises
            </Text>
            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {exercises.length === 0 ? (
                <View className="rounded-lg border border-dashed border-stone-300 px-4 py-8">
                  <Text className="text-center text-stone-400" style={{ fontFamily: fonts.sans }}>
                    Click an exercise in the library to add it.
                  </Text>
                </View>
              ) : (
                exercises.map((item) => (
                  <SortableExerciseRow key={item.id} item={item} onChange={handleExerciseChange} onRemove={handleRemoveExercise} />
                ))
              )}
            </SortableContext>
            <Pressable
              onPress={() => setExercisePickerVisible(true)}
              className="mt-2.5 rounded-lg border border-primary px-3 py-2.5"
            >
              <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
                + Insert exercise
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <ExerciseFormModal
        visible={newExerciseModalVisible}
        initialExercise={null}
        allExercises={library}
        onClose={() => setNewExerciseModalVisible(false)}
        onSubmit={handleNewExerciseCreated}
      />

      <ExercisePickerModal
        visible={warmupPickerVisible}
        library={library.filter((e) => e.type === "warmup")}
        onClose={() => setWarmupPickerVisible(false)}
        onPick={handleAddWarmup}
      />

      <ExercisePickerModal
        visible={exercisePickerVisible}
        library={library.filter((e) => e.type !== "warmup")}
        onClose={() => setExercisePickerVisible(false)}
        onPick={handleInsertExercise}
      />
    </DndContext>
  );
}
