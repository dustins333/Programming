import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listExercises, MUSCLE_GROUPS, createExercise } from "../../../../lib/programming/exercises";
import { getUser } from "../../../../lib/programming/clients";
import {
  getSpcWorkout,
  listSpcWarmups,
  addSpcWarmup,
  updateSpcWarmup,
  removeSpcWarmup,
  listSpcWorkoutExercises,
  addSpcWorkoutExercise,
  removeSpcWorkoutExercise,
  reorderSpcWorkoutExercises,
  updateSpcExerciseWeek,
  getSpcSiblingPatterns,
  setSpcWorkoutStatus,
} from "../../../../lib/programming/spcWorkouts";
import { ExerciseFormModal } from "../../exercises/ExerciseFormModal";
import { CommentThread } from "../../builder/CommentThread";
import { PatternTally } from "../../builder/PatternTally";
import { formatDateMDY } from "../../../../lib/formatDate";
import { fonts, colors } from "../../../../lib/theme";

function initialsFor(name) {
  if (!name) return "";
  return name.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).join("");
}

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
        className="mb-1.5 cursor-grab rounded-lg border border-stone-200 px-3 py-2 active:opacity-70"
      >
        <Text style={{ fontFamily: fonts.sansMedium }}>{exercise.name}</Text>
      </Pressable>
    </div>
  );
}

function WeekCell({ week, onChange }) {
  return (
    <View className="w-24 border-l border-stone-100 px-2">
      <TextInput
        value={String(week.sets ?? "")}
        onChangeText={(v) => onChange(week.id, { sets: v === "" ? null : Number(v) || 0 })}
        keyboardType="numeric"
        placeholder="sets"
        className="mb-1 rounded border border-stone-300 px-1.5 py-1 text-center text-xs"
        style={{ fontFamily: fonts.sans }}
      />
      <TextInput
        value={week.reps ?? ""}
        onChangeText={(v) => onChange(week.id, { reps: v })}
        placeholder="reps"
        className="mb-1 rounded border border-stone-300 px-1.5 py-1 text-center text-xs"
        style={{ fontFamily: fonts.sans }}
      />
      <TextInput
        value={week.rest ?? ""}
        onChangeText={(v) => onChange(week.id, { rest: v })}
        placeholder="rest"
        className="rounded border border-stone-300 px-1.5 py-1 text-center text-xs"
        style={{ fontFamily: fonts.sans }}
      />
      <Text className="mt-1 text-center text-[10px] text-stone-400" style={{ fontFamily: fonts.sans }}>
        {week.coach_initials ? `${week.coach_initials} ${formatDateMDY(week.touched_date)}` : "—"}
      </Text>
    </View>
  );
}

function SpcExerciseRow({ item, blockLengthWeeks, onChangeWeek, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const weeksByNumber = Object.fromEntries(item.spc_exercise_weeks.map((w) => [w.week_number, w]));

  return (
    <div ref={setNodeRef} style={style}>
      <View className="mb-2 flex-row items-start rounded-lg border border-stone-200 px-3 py-2">
        <div {...attributes} {...listeners} style={{ cursor: "grab", padding: 4 }}>
          ⠿
        </div>
        <View className="mr-2 w-40">
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
        <ScrollView horizontal>
          {Array.from({ length: blockLengthWeeks }, (_, i) => i + 1).map((weekNumber) => {
            const week = weeksByNumber[weekNumber];
            if (!week) return null;
            return <WeekCell key={week.id} week={week} onChange={(id, fields) => onChangeWeek(item.id, id, fields)} />;
          })}
        </ScrollView>
        <Pressable
          onPress={() => onRemove(item.id)}
          className="ml-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Remove ${item.exercises?.name ?? "exercise"}`}
        >
          <Text className="text-stone-400">✕</Text>
        </Pressable>
      </View>
    </div>
  );
}

export default function SpcWorkoutBuilderWeb() {
  const { workoutId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();

  const [workout, setWorkout] = useState(null);
  const [member, setMember] = useState(null);
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
    const w = await getSpcWorkout(workoutId);
    setWorkout(w);
    const [memberRow, warmupRows, exerciseRows, libraryRows, siblings] = await Promise.all([
      getUser(w.spc_blocks.spc_client_id),
      listSpcWarmups(workoutId),
      listSpcWorkoutExercises(workoutId),
      listExercises(),
      getSpcSiblingPatterns(w.spc_blocks.id, workoutId),
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
    const created = await addSpcWorkoutExercise({
      workoutId,
      exerciseId: exercise.id,
      position: exercises.length + 1,
      blockLengthWeeks: workout.spc_blocks.block_length_weeks,
      userId: workout.spc_blocks.spc_client_id,
    });
    setExercises((prev) => [...prev, created]);
  };

  const handleChangeWeek = (exerciseId, weekId, fields) => {
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== exerciseId
          ? e
          : {
              ...e,
              spc_exercise_weeks: e.spc_exercise_weeks.map((w) =>
                w.id !== weekId
                  ? w
                  : { ...w, ...fields, coach_initials: initialsFor(profile.name), touched_date: new Date().toISOString().slice(0, 10) }
              ),
            }
      )
    );
    updateSpcExerciseWeek(weekId, fields, profile.name);
  };

  const handleRemoveExercise = async (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await removeSpcWorkoutExercise(id);
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
      reorderSpcWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 })));
    }
  };

  const handleAddWarmup = async (exercise) => {
    const created = await addSpcWarmup({ workoutId, exerciseId: exercise.id, position: warmups.length + 1 });
    setWarmups((prev) => [...prev, created]);
  };

  const handleWarmupChange = (id, fields) => {
    setWarmups((prev) => prev.map((w) => (w.id === id ? { ...w, ...fields } : w)));
    updateSpcWarmup(id, fields);
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

  const currentPatterns = exercises.map((e) => e.exercises?.movement_pattern).filter(Boolean);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <View className="flex-1 flex-row bg-white">
        <ScrollView className="w-72 border-r border-stone-200 px-4 py-6">
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
          <Pressable
            onPress={() => router.push(`/(coach)/spc/blocks/${workout.spc_blocks.id}`)}
            className="mb-3 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>‹ Back to block</Text>
          </Pressable>
          <View className="mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
                {member.name} — Session {workout.session_number}
              </Text>
              <Text
                className="text-xs"
                style={{ fontFamily: fonts.sansMedium, color: workout.status === "published" ? "#8a5140" : "#a8a29e" }}
              >
                {workout.status}
              </Text>
            </View>
            <Pressable onPress={handleTogglePublish} disabled={publishing} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {workout.status === "published" ? "Unpublish" : "Publish"}
              </Text>
            </Pressable>
          </View>

          <View className="mb-6">
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
                    <TextInput
                      value={w.sets ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { sets: v })}
                      placeholder="sets"
                      className="w-16 rounded border border-stone-300 bg-white px-2 py-1"
                      style={{ fontFamily: fonts.sans }}
                    />
                    <TextInput
                      value={w.reps ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { reps: v })}
                      placeholder="reps"
                      className="w-16 rounded border border-stone-300 bg-white px-2 py-1"
                      style={{ fontFamily: fonts.sans }}
                    />
                    <TextInput
                      value={w.notes ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { notes: v })}
                      placeholder="notes"
                      className="w-28 rounded border border-stone-300 bg-white px-2 py-1"
                      style={{ fontFamily: fonts.sans }}
                    />
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
            <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              Click an exercise in the library while building the warm-up list (max 5-6 movements).
            </Text>
          </View>

          <View ref={setDropZoneRef} className="mb-6">
            <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
              Main Session {isOver ? "· drop here" : ""}
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
                  <SpcExerciseRow
                    key={item.id}
                    item={item}
                    blockLengthWeeks={workout.spc_blocks.block_length_weeks}
                    onChangeWeek={handleChangeWeek}
                    onRemove={handleRemoveExercise}
                  />
                ))
              )}
            </SortableContext>
          </View>

          <View className="mb-6">
            <PatternTally currentPatterns={currentPatterns} siblingPatterns={siblingPatterns} />
          </View>

          <CommentThread spcBlockId={workout.spc_blocks.id} />
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
