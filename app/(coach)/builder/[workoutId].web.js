import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listExercises, MUSCLE_GROUPS } from "../../../lib/programming/exercises";
import {
  getWorkout,
  listWarmups,
  addWarmup,
  updateWarmup,
  removeWarmup,
  listWorkoutExercises,
  addWorkoutExercise,
  updateWorkoutExercise,
  removeWorkoutExercise,
  reorderWorkoutExercises,
  getSiblingPatterns,
  setWorkoutStatus,
} from "../../../lib/programming/workouts";
import { ExerciseFormModal } from "../exercises/ExerciseFormModal";
import { createExercise } from "../../../lib/programming/exercises";
import { PatternTally } from "./PatternTally";
import { CommentThread } from "./CommentThread";

function LibraryExercise({ exercise, onInsertClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib-${exercise.id}`,
    data: { type: "library", exercise },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Pressable
        onPress={() => onInsertClick(exercise)}
        className="mb-1.5 cursor-grab rounded-lg border border-neutral-200 px-3 py-2 active:opacity-70"
      >
        <Text style={{ fontFamily: "Montserrat_500Medium" }}>{exercise.name}</Text>
        {exercise.movement_pattern ? (
          <Text className="text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
            {exercise.movement_pattern.replace("_", " ")}
          </Text>
        ) : null}
      </Pressable>
    </div>
  );
}

function SortableExerciseRow({ item, onChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <View className="mb-2 flex-row items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2">
        <div {...attributes} {...listeners} style={{ cursor: "grab", padding: 4 }}>
          ⠿
        </div>
        <View className="flex-1">
          <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.exercises?.name}</Text>
          {item.exercises?.video_url ? (
            <Pressable onPress={() => Linking.openURL(item.exercises.video_url)}>
              <Text className="text-xs text-accent" style={{ fontFamily: "Montserrat_400Regular" }}>
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
          className="w-16 rounded border border-neutral-300 px-2 py-1.5 text-center"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <TextInput
          value={item.reps ?? ""}
          onChangeText={(v) => onChange(item.id, { reps: v })}
          placeholder="reps"
          className="w-16 rounded border border-neutral-300 px-2 py-1.5 text-center"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <TextInput
          value={item.tempo ?? ""}
          onChangeText={(v) => onChange(item.id, { tempo: v })}
          placeholder="tempo"
          className="w-16 rounded border border-neutral-300 px-2 py-1.5 text-center"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <TextInput
          value={item.notes ?? ""}
          onChangeText={(v) => onChange(item.id, { notes: v })}
          placeholder="notes"
          className="w-28 rounded border border-neutral-300 px-2 py-1.5"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <Pressable onPress={() => onRemove(item.id)}>
          <Text className="text-neutral-400">✕</Text>
        </Pressable>
      </View>
    </div>
  );
}

export default function WorkoutBuilderWeb() {
  const { workoutId } = useLocalSearchParams();
  const { profile } = useAuth();

  const [workout, setWorkout] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [siblingPatterns, setSiblingPatterns] = useState([]);
  const [search, setSearch] = useState("");
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { setNodeRef: setDropZoneRef, isOver } = useDroppable({ id: "session-dropzone" });

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

  const filteredLibrary = useMemo(() => {
    if (!search) return library;
    return library.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  }, [library, search]);

  const libraryByGroup = useMemo(() => {
    const groups = {};
    MUSCLE_GROUPS.forEach((mg) => (groups[mg] = []));
    filteredLibrary.forEach((e) => {
      if (!groups[e.muscle_group]) groups[e.muscle_group] = [];
      groups[e.muscle_group].push(e);
    });
    return groups;
  }, [filteredLibrary]);

  const handleInsertExercise = async (exercise) => {
    const created = await addWorkoutExercise({
      workoutId,
      exerciseId: exercise.id,
      position: exercises.length + 1,
    });
    setExercises((prev) => [...prev, created]);
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateWorkoutExercise(id, fields);
  };

  const handleRemoveExercise = async (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await removeWorkoutExercise(id);
  };

  const handleNewExerciseCreated = async (form) => {
    const created = await createExercise({ ...form, createdBy: profile.id });
    setLibrary((prev) => [...prev, created]);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    if (active.data.current?.type === "library") {
      if (over.id === "session-dropzone" || exercises.some((e) => e.id === over.id)) {
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
      reorderWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 })));
    }
  };

  const handleAddWarmup = async (exercise) => {
    const created = await addWarmup({ workoutId, exerciseId: exercise.id, position: warmups.length + 1 });
    setWarmups((prev) => [...prev, created]);
  };

  const handleWarmupChange = (id, fields) => {
    setWarmups((prev) => prev.map((w) => (w.id === id ? { ...w, ...fields } : w)));
    updateWarmup(id, fields);
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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <View className="flex-1 flex-row bg-white">
        <ScrollView className="w-72 border-r border-neutral-200 px-4 py-6">
          <Text className="mb-3 text-lg text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Exercise Library
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search…"
            className="mb-3 rounded-lg border border-neutral-300 px-3 py-2"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />
          <Pressable onPress={() => setNewExerciseModalVisible(true)} className="mb-4 rounded-lg border border-primary px-3 py-2">
            <Text className="text-center text-accent" style={{ fontFamily: "Montserrat_500Medium" }}>
              + New Exercise
            </Text>
          </Pressable>
          {MUSCLE_GROUPS.map((mg) =>
            libraryByGroup[mg]?.length ? (
              <View key={mg} className="mb-4">
                <Text className="mb-1 text-xs uppercase text-neutral-400" style={{ fontFamily: "Montserrat_500Medium" }}>
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
          <View className="mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-2xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {workout.group_blocks.group_programs.name} — Week {workout.week_number}, Session {workout.session_number}
              </Text>
              <Text className={workout.status === "published" ? "text-accent" : "text-neutral-400"} style={{ fontFamily: "Montserrat_400Regular" }}>
                {workout.status}
              </Text>
            </View>
            <Pressable onPress={handleTogglePublish} disabled={publishing} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {workout.status === "published" ? "Unpublish" : "Publish"}
              </Text>
            </Pressable>
          </View>

          <View className="mb-6">
            <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              Warm-up
            </Text>
            {warmups.map((w, i) => (
              <View key={w.id} className="mb-2 flex-row items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
                <Text className="w-5 text-neutral-400">{i + 1}.</Text>
                <Text className="flex-1" style={{ fontFamily: "Montserrat_500Medium" }}>
                  {w.exercises?.name ?? w.label}
                </Text>
                <TextInput
                  value={w.sets ?? ""}
                  onChangeText={(v) => handleWarmupChange(w.id, { sets: v })}
                  placeholder="sets"
                  className="w-16 rounded border border-neutral-300 px-2 py-1"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                />
                <TextInput
                  value={w.reps ?? ""}
                  onChangeText={(v) => handleWarmupChange(w.id, { reps: v })}
                  placeholder="reps"
                  className="w-16 rounded border border-neutral-300 px-2 py-1"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                />
                <TextInput
                  value={w.notes ?? ""}
                  onChangeText={(v) => handleWarmupChange(w.id, { notes: v })}
                  placeholder="notes"
                  className="w-28 rounded border border-neutral-300 px-2 py-1"
                  style={{ fontFamily: "Montserrat_400Regular" }}
                />
                <Pressable onPress={() => handleRemoveWarmup(w.id)}>
                  <Text className="text-neutral-400">✕</Text>
                </Pressable>
              </View>
            ))}
            <Text className="text-xs text-neutral-400" style={{ fontFamily: "Montserrat_400Regular" }}>
              Click an exercise in the library while building the warm-up list (max 5-6 movements).
            </Text>
          </View>

          <View ref={setDropZoneRef} className="mb-6">
            <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              Main Session {isOver ? "· drop here" : ""}
            </Text>
            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {exercises.length === 0 ? (
                <View className="rounded-lg border border-dashed border-neutral-300 px-4 py-8">
                  <Text className="text-center text-neutral-400" style={{ fontFamily: "Montserrat_400Regular" }}>
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

          <View className="mb-6">
            <PatternTally currentPatterns={currentPatterns} siblingPatterns={siblingPatterns} />
          </View>

          <CommentThread groupBlockId={workout.group_blocks.id} />
        </ScrollView>
      </View>

      <ExerciseFormModal
        visible={newExerciseModalVisible}
        initialExercise={null}
        onClose={() => setNewExerciseModalVisible(false)}
        onSubmit={handleNewExerciseCreated}
      />
    </DndContext>
  );
}
