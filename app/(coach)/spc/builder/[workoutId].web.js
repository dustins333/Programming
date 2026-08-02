import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  MeasuringStrategy,
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
  updateSpcWorkoutExercise,
  removeSpcWorkoutExercise,
  reorderSpcWorkoutExercises,
  getSpcSiblingPatterns,
  setSpcWorkoutStatus,
  setSpcWorkoutTitle,
} from "../../../../lib/programming/spcWorkouts";
import { ExerciseFormModal } from "../../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../../components/ExercisePickerModal";
import { CommentThread } from "../../../../components/CommentThread";
import { PatternTally } from "../../../../components/PatternTally";
import { fonts, colors } from "../../../../lib/theme";

// The dragged item itself just fades out — the moving visual a coach
// actually tracks across the screen is the DragOverlay preview below, not
// a manually-positioned translate3d on this element.
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
    </View>
  );
}

function SpcExerciseRow({ item, onChange, onRemove }) {
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
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeExercise, setActiveExercise] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // dnd-kit's own collision detection (pointerWithin/`over`) was confirmed
  // unreliable in this environment: raw diagnostic logging showed the
  // browser's actual cursor position genuinely and continuously inside the
  // drop zone's real getBoundingClientRect() for a sustained stretch of a
  // drag, while dnd-kit's own `over` stayed null the entire time. Rather
  // than depend on dnd-kit's internal position tracking for library-item
  // drops, this tracks the raw pointer position directly (same technique
  // that proved reliable) and hit-tests it against these two zones' real
  // DOM rects by hand — both for the actual drop decision (handleDragEnd)
  // and for the visual highlight, so what lights up matches what will
  // actually happen. Existing-item reordering is untouched and still uses
  // dnd-kit's own sortable collision detection.
  const rawDropZoneRef = useRef(null);
  const rawWarmupZoneRef = useRef(null);
  const [rawHoverZone, setRawHoverZone] = useState(null); // "session" | "warmup" | null

  useEffect(() => {
    if (!activeExercise) {
      setRawHoverZone(null);
      return;
    }
    const handler = (e) => {
      const warmupRect = rawWarmupZoneRef.current?.getBoundingClientRect();
      const sessionRect = rawDropZoneRef.current?.getBoundingClientRect();
      const inRect = (rect) => rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      setRawHoverZone(inRect(warmupRect) ? "warmup" : inRect(sessionRect) ? "session" : null);
    };
    document.addEventListener("pointermove", handler);
    return () => document.removeEventListener("pointermove", handler);
  }, [activeExercise]);

  const isOver = rawHoverZone === "session";
  const isOverWarmup = rawHoverZone === "warmup";

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

  const filteredLibrary = useMemo(() => {
    if (!search) return library;
    return library.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  }, [library, search]);

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
    const created = await addSpcWorkoutExercise({
      workoutId,
      exerciseId: exercise.id,
      position: exercises.length + 1,
      userId: workout.spc_blocks.spc_client_id,
    });
    setExercises((prev) => [...prev, created]);
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateSpcWorkoutExercise(id, fields);
  };

  const handleRemoveExercise = async (id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
    await removeSpcWorkoutExercise(id);
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

    if (active.data.current?.type === "library") {
      // Decided by raw pointer position against the two zones' real DOM
      // rects (see rawHoverZone above), not dnd-kit's own `over` — confirmed
      // unreliable in this environment. Warm-up is the one specific target;
      // anywhere else in this builder means "add to the main session."
      if (rawHoverZone === "warmup") {
        handleAddWarmup(active.data.current.exercise);
      } else {
        handleInsertExercise(active.data.current.exercise);
      }
      return;
    }

    if (!over) return;
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
    const created = await addSpcWarmup({
      workoutId,
      exerciseId: exercise.id,
      position: warmups.length + 1,
      sets: exercise.default_sets != null ? String(exercise.default_sets) : undefined,
      reps: exercise.default_reps || undefined,
    });
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
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      // Kept fresh for existing-item reordering (still dnd-kit-driven) —
      // library-item drops no longer depend on this at all, see rawHoverZone.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
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
          <Pressable
            onPress={() => router.back()}
            className="mb-3 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>‹ Back</Text>
          </Pressable>
          <View className="mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
                {member.name} — Week {workout.week_number}, Session {workout.session_number}
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

          <TextInput
            value={workout.title ?? ""}
            onChangeText={handleTitleChange}
            placeholder="Session title (e.g. Back & Bis) — shown to the member"
            className="mb-6 w-96 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans }}
          />

          <View
            ref={rawWarmupZoneRef}
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
                    <TextInput
                      value={w.sets ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { sets: v })}
                      placeholder="sets"
                      className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-3"
                      style={{ fontFamily: fonts.sans }}
                    />
                    <TextInput
                      value={w.reps ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { reps: v })}
                      placeholder="reps"
                      className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-3"
                      style={{ fontFamily: fonts.sans }}
                    />
                    <TextInput
                      value={w.notes ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { notes: v })}
                      placeholder="notes"
                      className="w-28 rounded-lg border border-stone-300 bg-white px-2 py-3"
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
            ref={rawDropZoneRef}
            className="mb-6 rounded-xl p-2.5"
            // Generous minHeight regardless of content — a big, hard-to-miss
            // hit region rather than one that shrinks to fit whatever's
            // currently inside it (which made it easy to drop just outside
            // the measured area on a session with only one or two rows).
            style={
              isOver
                ? { minHeight: 160, backgroundColor: "#fdf6f2", borderWidth: 2, borderColor: "#a46a57", borderStyle: "dashed" }
                : { minHeight: 160, borderWidth: 2, borderColor: "transparent" }
            }
          >
            <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
              Main Session {isOver ? "· drop here" : ""}
            </Text>

            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {exercises.length === 0 ? (
                <View
                  className="items-center justify-center rounded-lg px-4"
                  style={
                    isOver
                      ? { minHeight: 96, borderWidth: 2, borderStyle: "dashed", borderColor: "#a46a57", backgroundColor: "#fdf6f2" }
                      : { minHeight: 96, borderWidth: 1, borderStyle: "dashed", borderColor: "#d6d3d1" }
                  }
                >
                  <Text
                    className="text-center"
                    style={{ fontFamily: isOver ? fonts.sansSemiBold : fonts.sans, color: isOver ? "#8a5140" : "#a8a29e" }}
                  >
                    {isOver ? "Drop here" : "Drag exercises here, or click one in the library."}
                  </Text>
                </View>
              ) : (
                exercises.map((item) => (
                  <SpcExerciseRow key={item.id} item={item} onChange={handleExerciseChange} onRemove={handleRemoveExercise} />
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
