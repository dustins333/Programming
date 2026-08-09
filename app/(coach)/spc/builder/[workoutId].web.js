import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin, MeasuringStrategy } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import {
  listExercises,
  MUSCLE_GROUPS,
  createExercise,
  groupExercisesByParent,
  summarizeRepScheme,
} from "../../../../lib/programming/exercises";
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
import { listSpcWorkoutsForBlock } from "../../../../lib/programming/spcBlocks";
import { ExerciseFormModal } from "../../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../../components/ExercisePickerModal";
import { CommentThread } from "../../../../components/CommentThread";
import { PatternTally } from "../../../../components/PatternTally";
import { fonts, colors } from "../../../../lib/theme";
import { toastError } from "../../../../lib/toast";

// Click-to-insert only — no drag-from-library. Used to be a dnd-kit
// draggable row with the "expand variations" chevron nested inside it —
// that's nested interactive content (a focusable draggable wrapper
// containing its own focusable button), which caused a real bug: clicking
// the chevron while scrolled down shifted the sidebar's scroll position out
// from under the click. Fixed at the root by making the chevron a sibling
// of the insert button, not nested inside it, and dropping the drag wiring
// entirely — plain click-to-insert already covers the same functionality.
function LibraryExercise({ exercise, onInsertClick, hasChildren, expanded, onToggleExpand, indented }) {
  return (
    <View className="mb-1.5 flex-row items-center rounded-lg border border-stone-200 px-3 py-2" style={{ marginLeft: indented ? 14 : 0 }}>
      <Pressable onPress={() => onInsertClick(exercise)} className="flex-1 flex-row items-center gap-1.5 active:opacity-70">
        <Text style={{ fontFamily: fonts.sansMedium }}>{exercise.name}</Text>
        {exercise.type === "warmup" ? (
          <View className="rounded-full px-2 py-[2px]" style={{ backgroundColor: "#fdf6ee" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#8a5a2e", fontSize: 9.5 }}>warm-up</Text>
          </View>
        ) : null}
      </Pressable>
      {hasChildren ? (
        <Pressable
          onPress={onToggleExpand}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={expanded ? `Collapse ${exercise.name} variations` : `Show ${exercise.name} variations`}
        >
          <Text className="text-stone-400">{expanded ? "▾" : "▸"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CollapsibleSection({ title, collapsed, onToggle, tint, children }) {
  return (
    <View className="mb-4">
      <Pressable onPress={onToggle} className="mb-1 flex-row items-center justify-between">
        <Text className="text-xs uppercase" style={{ fontFamily: fonts.sansSemiBold, color: tint ?? "#a8a29e" }}>
          {title}
        </Text>
        <Text className="text-xs text-stone-400">{collapsed ? "▸" : "▾"}</Text>
      </Pressable>
      {collapsed ? null : children}
    </View>
  );
}

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

function SpcExerciseRow({ item, onChange, onRemove, onLinkSuperset, onUnlinkSuperset, isLastRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <View
        className="mb-1 rounded-lg border px-3 py-2.5"
        style={{ borderColor: item.superset_group_id ? "#a46a57" : "#e7e5e4" }}
      >
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
          {item.superset_group_id ? (
            <Pressable
              onPress={() => onUnlinkSuperset(item)}
              className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
              style={{ backgroundColor: "#fdece5" }}
              accessibilityLabel="Unlink superset"
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#b23a22" }}>⚭ Superset</Text>
              <Text style={{ fontSize: 11, color: "#b23a22" }}>✕</Text>
            </Pressable>
          ) : null}
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

      {!isLastRow ? (
        <View className="my-0.5 items-center">
          <Pressable
            onPress={onLinkSuperset}
            hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
            accessibilityLabel="Link into a superset with the next exercise"
          >
            <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: "#a8a29e" }}>
              +
            </Text>
          </Pressable>
        </View>
      ) : null}
    </div>
  );
}

export default function SpcWorkoutBuilderWeb() {
  const { workoutId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();

  const [workout, setWorkout] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [member, setMember] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [siblingPatterns, setSiblingPatterns] = useState([]);
  const [search, setSearch] = useState("");
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Every session in this block (week/session order) — powers the prev/next
  // arrows so programming sessions in sequence doesn't bounce through the grid.
  const [blockWorkouts, setBlockWorkouts] = useState([]);
  const [collapsedSections, setCollapsedSections] = useState(() => new Set(["warmups"]));
  const [expandedParents, setExpandedParents] = useState(() => new Set());

  const toggleSection = (key) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleParent = (id) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const w = await getSpcWorkout(workoutId);
      setWorkout(w);
      const [memberRow, warmupRows, exerciseRows, libraryRows, siblings, allBlockWorkouts] = await Promise.all([
        getUser(w.spc_blocks.spc_client_id),
        listSpcWarmups(workoutId),
        listSpcWorkoutExercises(workoutId),
        listExercises(),
        getSpcSiblingPatterns(w.spc_blocks.id, w.week_number, workoutId),
        listSpcWorkoutsForBlock(w.spc_blocks.id),
      ]);
      setMember(memberRow);
      setWarmups(warmupRows);
      setExercises(exerciseRows);
      setLibrary(libraryRows);
      setSiblingPatterns(siblings);
      setBlockWorkouts(allBlockWorkouts);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLibrary = useMemo(() => {
    if (!search) return library;
    return library.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  }, [library, search]);

  const isSearching = search.length > 0;
  const warmupLibrary = useMemo(() => filteredLibrary.filter((e) => e.type === "warmup"), [filteredLibrary]);
  const { childrenByParent } = useMemo(() => groupExercisesByParent(library), [library]);
  const libraryByGroup = useMemo(() => {
    const groups = {};
    MUSCLE_GROUPS.forEach((mg) => (groups[mg] = []));
    filteredLibrary.forEach((e) => {
      if (e.type === "warmup" || e.parent_exercise_id) return;
      (e.muscle_group ?? []).forEach((mg) => {
        if (!groups[mg]) groups[mg] = [];
        groups[mg].push(e);
      });
    });
    return groups;
  }, [filteredLibrary]);

  const handleInsertExercise = async (exercise) => {
    try {
      const created = await addSpcWorkoutExercise({
        workoutId,
        exerciseId: exercise.id,
        position: exercises.length + 1,
        userId: workout.spc_blocks.spc_client_id,
      });
      setExercises((prev) => [...prev, created]);
    } catch (err) {
      toastError("Couldn't add exercise", err);
    }
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    updateSpcWorkoutExercise(id, fields).catch((err) => toastError("Couldn't save change", err));
  };

  const handleRemoveExercise = async (id) => {
    const removed = exercises.find((e) => e.id === id);
    const removedIndex = exercises.findIndex((e) => e.id === id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    try {
      await removeSpcWorkoutExercise(id);
    } catch (err) {
      toastError("Couldn't remove exercise", err);
      if (removed) setExercises((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleLinkSuperset = (itemId, nextItemId) => {
    const groupId = crypto.randomUUID();
    setExercises((prev) => prev.map((e) => (e.id === itemId || e.id === nextItemId ? { ...e, superset_group_id: groupId } : e)));
    Promise.all([
      updateSpcWorkoutExercise(itemId, { superset_group_id: groupId }),
      updateSpcWorkoutExercise(nextItemId, { superset_group_id: groupId }),
    ]).catch((err) => toastError("Couldn't link superset", err));
  };

  const handleUnlinkSuperset = (item) => {
    const partner = exercises.find((e) => e.id !== item.id && e.superset_group_id === item.superset_group_id);
    setExercises((prev) =>
      prev.map((e) => (e.id === item.id || e.id === partner?.id ? { ...e, superset_group_id: null } : e))
    );
    Promise.all([
      updateSpcWorkoutExercise(item.id, { superset_group_id: null }),
      partner ? updateSpcWorkoutExercise(partner.id, { superset_group_id: null }) : Promise.resolve(),
    ]).catch((err) => toastError("Couldn't unlink superset", err));
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
  // below) — inserting from the library is click-only, see LibraryExercise.
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const oldIndex = exercises.findIndex((e) => e.id === active.id);
      const newIndex = exercises.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(exercises, oldIndex, newIndex);
      setExercises(reordered);
      reorderSpcWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))).catch((err) =>
        toastError("Couldn't save reorder", err)
      );
    }
  };

  const handleAddWarmup = async (exercise) => {
    try {
      const created = await addSpcWarmup({
        workoutId,
        exerciseId: exercise.id,
        position: warmups.length + 1,
        sets: exercise.default_sets != null ? String(exercise.default_sets) : undefined,
        reps: exercise.default_reps || undefined,
      });
      setWarmups((prev) => [...prev, created]);
    } catch (err) {
      toastError("Couldn't add warm-up", err);
    }
  };

  const handleWarmupChange = (id, fields) => {
    setWarmups((prev) => prev.map((w) => (w.id === id ? { ...w, ...fields } : w)));
    updateSpcWarmup(id, fields).catch((err) => toastError("Couldn't save change", err));
  };

  const handleRemoveWarmup = async (id) => {
    const removed = warmups.find((w) => w.id === id);
    const removedIndex = warmups.findIndex((w) => w.id === id);
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    try {
      await removeSpcWarmup(id);
    } catch (err) {
      toastError("Couldn't remove warm-up", err);
      if (removed) setWarmups((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleTogglePublish = async () => {
    setPublishing(true);
    try {
      const next = workout.status === "published" ? "draft" : "published";
      await setSpcWorkoutStatus(workoutId, next);
      setWorkout((w) => ({ ...w, status: next }));
    } catch (err) {
      toastError("Couldn't publish", err);
    } finally {
      setPublishing(false);
    }
  };

  const handleTitleChange = (title) => {
    setWorkout((w) => ({ ...w, title }));
    setSpcWorkoutTitle(workoutId, title).catch((err) => toastError("Couldn't save title", err));
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Couldn't load this workout: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#8a5140" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!workout || !member) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const currentPatterns = exercises.flatMap((e) => e.exercises?.movement_pattern ?? []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragEnd={handleDragEnd}
    >
      <View className="flex-1 flex-row bg-white">
        <View className="flex-col border-r border-stone-200" style={{ width: 288, flexGrow: 0, flexShrink: 0, height: "100%", minHeight: 0 }}>
          <View className="px-4 pb-3 pt-6">
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
            <Pressable onPress={() => setNewExerciseModalVisible(true)} className="rounded-lg border border-primary px-3 py-2.5">
              <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
                + New Exercise
              </Text>
            </Pressable>
          </View>

          <ScrollView className="px-4 pb-6" style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
            {isSearching ? (
              <View className="mb-4">
                <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
                  Results
                </Text>
                {filteredLibrary.filter((e) => e.type !== "warmup").map((exercise) => (
                  <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={handleInsertExercise} />
                ))}
                {warmupLibrary.map((exercise) => (
                  <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={handleAddWarmup} />
                ))}
              </View>
            ) : (
              <>
                {warmupLibrary.length > 0 && (
                  <View className="mb-1 rounded-lg p-2" style={{ backgroundColor: "#f4ede3" }}>
                    <CollapsibleSection
                      title="Warm-ups"
                      collapsed={collapsedSections.has("warmups")}
                      onToggle={() => toggleSection("warmups")}
                      tint="#8a5a2e"
                    >
                      {warmupLibrary.map((exercise) => (
                        <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={handleAddWarmup} />
                      ))}
                    </CollapsibleSection>
                  </View>
                )}
                {MUSCLE_GROUPS.map((mg) =>
                  libraryByGroup[mg]?.length ? (
                    <CollapsibleSection
                      key={mg}
                      title={mg.replace("_", " ")}
                      collapsed={collapsedSections.has(mg)}
                      onToggle={() => toggleSection(mg)}
                    >
                      {libraryByGroup[mg].map((exercise) => {
                        const children = childrenByParent.get(exercise.id) ?? [];
                        const expanded = expandedParents.has(exercise.id);
                        return (
                          <View key={exercise.id}>
                            <LibraryExercise
                              exercise={exercise}
                              onInsertClick={handleInsertExercise}
                              hasChildren={children.length > 0}
                              expanded={expanded}
                              onToggleExpand={() => toggleParent(exercise.id)}
                            />
                            {expanded
                              ? children.map((child) => (
                                  <LibraryExercise key={child.id} exercise={child} onInsertClick={handleInsertExercise} indented />
                                ))
                              : null}
                          </View>
                        );
                      })}
                    </CollapsibleSection>
                  ) : null
                )}
              </>
            )}
          </ScrollView>
        </View>

        <ScrollView className="flex-1 px-8 py-6">
          <Pressable
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.push(`/(coach)/spc/blocks/${workout.spc_blocks.id}`)
            }
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
                {workout.status === "published" ? "Published" : "Draft"}
              </Text>
            </View>
            <View className="flex-row items-center gap-2.5">
              {(() => {
                // Prev/next through the block in week/session order — same
                // affordance as the group web builder.
                const idx = blockWorkouts.findIndex((w) => w.id === workout.id);
                const prev = idx > 0 ? blockWorkouts[idx - 1] : null;
                const next = idx >= 0 && idx < blockWorkouts.length - 1 ? blockWorkouts[idx + 1] : null;
                const NavArrow = ({ target, isPrev }) =>
                  target ? (
                    <Pressable
                      onPress={() => router.push(`/(coach)/spc/builder/${target.id}`)}
                      className="rounded-lg border px-3 py-2.5"
                      style={{ borderColor: "#d9d4cd" }}
                      accessibilityLabel={`${isPrev ? "Previous" : "Next"} session: Week ${target.week_number}, Session ${target.session_number}`}
                    >
                      <Text className="text-stone-700" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
                        {isPrev ? `‹ Wk${target.week_number} · S${target.session_number}` : `Wk${target.week_number} · S${target.session_number} ›`}
                      </Text>
                    </Pressable>
                  ) : null;
                return (
                  <>
                    <NavArrow target={prev} isPrev />
                    <NavArrow target={next} />
                  </>
                );
              })()}
              <Pressable onPress={handleTogglePublish} disabled={publishing} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  {workout.status === "published" ? "Unpublish" : "Publish"}
                </Text>
              </Pressable>
            </View>
          </View>

          <TextInput
            value={workout.title ?? ""}
            onChangeText={handleTitleChange}
            placeholder="Session title (e.g. Back & Bis) — shown to the member"
            className="mb-6 w-96 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans }}
          />

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
              Max 5-6 movements.
            </Text>
          </View>

          <View className="mb-6 rounded-xl p-2.5" style={{ minHeight: 160 }}>
            <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
              Main Session
            </Text>

            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {exercises.length === 0 ? (
                <View
                  className="items-center justify-center rounded-lg px-4"
                  style={{ minHeight: 96, borderWidth: 1, borderStyle: "dashed", borderColor: "#d6d3d1" }}
                >
                  <Text className="text-center" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                    Click an exercise in the library to add it.
                  </Text>
                </View>
              ) : (
                exercises.map((item, i) => (
                  <SpcExerciseRow
                    key={item.id}
                    item={item}
                    onChange={handleExerciseChange}
                    onRemove={handleRemoveExercise}
                    onLinkSuperset={() => handleLinkSuperset(item.id, exercises[i + 1].id)}
                    onUnlinkSuperset={handleUnlinkSuperset}
                    isLastRow={i === exercises.length - 1}
                  />
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

          <View className="mb-6">
            <PatternTally currentPatterns={currentPatterns} siblingPatterns={siblingPatterns} />
          </View>

          <CommentThread spcBlockId={workout.spc_blocks.id} />
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
