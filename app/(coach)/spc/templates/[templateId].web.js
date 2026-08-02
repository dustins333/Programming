import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listExercises, MUSCLE_GROUPS, createExercise } from "../../../../lib/programming/exercises";
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
import { fonts, colors } from "../../../../lib/theme";

const CATEGORY_LABELS = { away: "Away programming", trial: "Trial session" };

// The dragged item itself just fades out — the moving visual a coach
// actually tracks across the screen is the DragOverlay preview below, not
// a manually-positioned translate3d on this element. The old self-transform
// approach only moved the item within the sidebar's own scrolling box, so
// it visually vanished the moment the cursor left that column (clipped by
// the ScrollView's overflow) — same class of bug already fixed once for the
// SPC dashboard's kanban drag.
function LibraryExercise({ exercise, onInsertClick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${exercise.id}`,
    data: { type: "library", exercise },
  });

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.35 : 1 }} {...listeners} {...attributes}>
      <Pressable
        onPress={() => onInsertClick(exercise)}
        className="mb-1.5 cursor-grab rounded-lg border border-stone-200 px-3 py-2 active:opacity-70"
      >
        <Text style={{ fontFamily: fonts.sansMedium }}>{exercise.name}</Text>
        {exercise.movement_pattern ? (
          <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {exercise.movement_pattern.replace("_", " ")}
          </Text>
        ) : null}
      </Pressable>
    </div>
  );
}

function ExerciseDragPreview({ exercise }) {
  return (
    <View
      className="rounded-lg border px-3 py-2"
      style={{ width: 240, backgroundColor: "white", borderColor: "#a46a57", shadowColor: "#44403c", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14 }}
    >
      <Text style={{ fontFamily: fonts.sansMedium }}>{exercise.name}</Text>
      {exercise.movement_pattern ? (
        <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          {exercise.movement_pattern.replace("_", " ")}
        </Text>
      ) : null}
    </View>
  );
}

function SortableExerciseRow({ item, onChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <View className="mb-2 flex-row items-center gap-3 rounded-lg border border-stone-200 px-3 py-2">
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
        <TextInput
          value={String(item.sets ?? "")}
          onChangeText={(v) => onChange(item.id, { sets: v === "" ? null : Number(v) || 0 })}
          keyboardType="numeric"
          placeholder="sets"
          className="w-16 rounded-lg border border-stone-300 px-2 py-3 text-center"
          style={{ fontFamily: fonts.sans }}
        />
        <TextInput
          value={item.reps ?? ""}
          onChangeText={(v) => onChange(item.id, { reps: v })}
          placeholder="reps"
          className="w-16 rounded-lg border border-stone-300 px-2 py-3 text-center"
          style={{ fontFamily: fonts.sans }}
        />
        <TextInput
          value={item.rest ?? ""}
          onChangeText={(v) => onChange(item.id, { rest: v })}
          placeholder="rest"
          className="w-16 rounded-lg border border-stone-300 px-2 py-3 text-center"
          style={{ fontFamily: fonts.sans }}
        />
        <TextInput
          value={item.notes ?? ""}
          onChangeText={(v) => onChange(item.id, { notes: v })}
          placeholder="notes"
          className="w-28 rounded-lg border border-stone-300 px-2 py-3"
          style={{ fontFamily: fonts.sans }}
        />
        <Pressable
          onPress={() => onRemove(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Remove ${item.exercises?.name ?? "exercise"}`}
        >
          <Text className="text-stone-400">✕</Text>
        </Pressable>
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
  const [loadError, setLoadError] = useState(null);
  const [activeExercise, setActiveExercise] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const { setNodeRef: setDropZoneRef, isOver } = useDroppable({ id: "session-dropzone" });
  const { setNodeRef: setWarmupDropZoneRef, isOver: isOverWarmup } = useDroppable({ id: "warmup-dropzone" });

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

  const filteredLibrary = useMemo(() => {
    if (!search) return library;
    return library.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  }, [library, search]);

  // Warm-ups are pinned above the muscle-group-grouped lifts, not bucketed
  // alongside them — a warm-up exercise has no muscle_group (null since
  // migration 0012), and mixing warm-up movements into the "back"/"chest"/
  // etc. lists would make it ambiguous which exercises are actually meant
  // for a session's warm-up slot.
  const warmupLibrary = useMemo(() => filteredLibrary.filter((e) => e.type === "warmup"), [filteredLibrary]);
  const libraryByGroup = useMemo(() => {
    const groups = {};
    MUSCLE_GROUPS.forEach((mg) => (groups[mg] = []));
    filteredLibrary.forEach((e) => {
      if (e.type === "warmup") return;
      if (!groups[e.muscle_group]) groups[e.muscle_group] = [];
      groups[e.muscle_group].push(e);
    });
    return groups;
  }, [filteredLibrary]);

  const handleInsertExercise = async (exercise) => {
    const created = await addTemplateExercise({ templateId, exerciseId: exercise.id, position: exercises.length + 1 });
    setExercises((prev) => [...prev, created]);
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateTemplateExercise(id, fields);
  };

  const handleRemoveExercise = async (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await removeTemplateExercise(id);
  };

  const handleAddWarmup = async (exercise) => {
    const created = await addTemplateWarmup({ templateId, exerciseId: exercise.id, position: warmups.length + 1 });
    setWarmups((prev) => [...prev, created]);
  };

  const handleRemoveWarmup = async (id) => {
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    await removeTemplateWarmup(id);
  };

  const handleNewExerciseCreated = async (form) => {
    const created = await createExercise({ ...form, createdBy: profile.id });
    setLibrary((prev) => [...prev, created]);
  };

  const handleDragStart = (event) => {
    if (event.active.data.current?.type === "library") {
      setActiveExercise(event.active.data.current.exercise);
    }
  };

  const handleDragEnd = (event) => {
    setActiveExercise(null);
    const { active, over } = event;
    if (!over) return;

    if (active.data.current?.type === "library") {
      if (over.id === "warmup-dropzone") {
        handleAddWarmup(active.data.current.exercise);
      } else if (over.id === "session-dropzone" || exercises.some((e) => e.id === over.id)) {
        handleInsertExercise(active.data.current.exercise);
      }
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = exercises.findIndex((e) => e.id === active.id);
      const newIndex = exercises.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(exercises, oldIndex, newIndex);
      setExercises(reordered);
      reorderTemplateExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 })));
    }
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong: {loadError}
        </Text>
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
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveExercise(null)}
    >
      <View className="flex-1 flex-row bg-white">
        <ScrollView
          className="border-r border-stone-200 px-4 py-6"
          style={{ width: 288, flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text className="mb-3 text-lg text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
            Exercise Library
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search…"
            className="mb-3 rounded-lg border border-stone-300 px-3 py-2"
            style={{ fontFamily: fonts.sans }}
          />
          <Pressable onPress={() => setNewExerciseModalVisible(true)} className="mb-4 rounded-lg border border-primary px-3 py-2.5">
            <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
              + New Exercise
            </Text>
          </Pressable>
          {warmupLibrary.length > 0 && (
            <View className="mb-4 rounded-lg p-2" style={{ backgroundColor: "#f4ede3" }}>
              <Text className="mb-1 text-xs uppercase" style={{ fontFamily: fonts.sansSemiBold, color: "#8a5a2e" }}>
                Warm-ups
              </Text>
              {warmupLibrary.map((exercise) => (
                <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={handleAddWarmup} />
              ))}
            </View>
          )}
          {MUSCLE_GROUPS.map((mg) =>
            libraryByGroup[mg]?.length ? (
              <View key={mg} className="mb-4">
                <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
                  {mg.replace("_", " ")}
                </Text>
                {libraryByGroup[mg].map((exercise) => (
                  <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={handleInsertExercise} />
                ))}
              </View>
            ) : null
          )}
        </ScrollView>

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

          <View
            ref={setWarmupDropZoneRef}
            className="mb-6 rounded-xl p-2.5"
            style={isOverWarmup ? { backgroundColor: "#fdf6f2", borderWidth: 2, borderColor: "#a46a57", borderStyle: "dashed" } : { borderWidth: 2, borderColor: "transparent" }}
          >
            <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
              Warm-up {isOverWarmup ? "· drop here" : ""}
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
              Or drag an exercise from the library into this section (max 5-6 movements).
            </Text>
          </View>

          <View
            ref={setDropZoneRef}
            className="mb-6 rounded-xl p-2.5"
            style={isOver ? { backgroundColor: "#fdf6f2", borderWidth: 2, borderColor: "#a46a57", borderStyle: "dashed" } : { borderWidth: 2, borderColor: "transparent" }}
          >
            <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
              Exercises {isOver ? "· drop here" : ""}
            </Text>
            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {exercises.length === 0 ? (
                <View className="rounded-lg border border-dashed border-stone-300 px-4 py-8">
                  <Text className="text-center text-stone-400" style={{ fontFamily: fonts.sans }}>
                    Drag exercises here, or click one in the library.
                  </Text>
                </View>
              ) : (
                exercises.map((item) => (
                  <SortableExerciseRow key={item.id} item={item} onChange={handleExerciseChange} onRemove={handleRemoveExercise} />
                ))
              )}
            </SortableContext>
          </View>
        </ScrollView>
      </View>

      <DragOverlay>{activeExercise ? <ExerciseDragPreview exercise={activeExercise} /> : null}</DragOverlay>

      <ExerciseFormModal
        visible={newExerciseModalVisible}
        initialExercise={null}
        onClose={() => setNewExerciseModalVisible(false)}
        onSubmit={handleNewExerciseCreated}
      />

      <ExercisePickerModal
        visible={warmupPickerVisible}
        library={library.filter((e) => e.type === "warmup")}
        onClose={() => setWarmupPickerVisible(false)}
        onPick={handleAddWarmup}
      />
    </DndContext>
  );
}
