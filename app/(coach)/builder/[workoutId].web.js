import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listExercises, createExercise, MUSCLE_GROUPS, groupExercisesByParent, summarizeRepScheme } from "../../../lib/programming/exercises";
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
  setWorkoutTitle,
} from "../../../lib/programming/workouts";
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../components/ExercisePickerModal";
import { PatternTally } from "../../../components/PatternTally";
import { CommentThread } from "../../../components/CommentThread";

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
    <View
      className="mb-1.5 flex-row items-center rounded-lg border border-stone-200 px-3 py-2"
      style={{ marginLeft: indented ? 14 : 0 }}
    >
      <Pressable onPress={() => onInsertClick(exercise)} className="flex-1 flex-row items-center active:opacity-70">
        <View className="flex-1">
          <Text style={{ fontFamily: "Montserrat_500Medium" }}>{exercise.name}</Text>
          {exercise.movement_pattern?.length ? (
            <Text className="text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
              {exercise.movement_pattern.map((p) => p.replace("_", " ")).join(", ")}
            </Text>
          ) : null}
        </View>
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

// Small chevron-header wrapper used for both the pinned warm-ups bucket and
// each muscle-group bucket in the library sidebar — a local, per-file
// component like LibraryExercise above, not a shared one (matches this
// repo's existing "small sidebar bits are duplicated per builder" pattern).
function CollapsibleSection({ title, collapsed, onToggle, tint, children }) {
  return (
    <View className="mb-4">
      <Pressable onPress={onToggle} className="mb-1 flex-row items-center justify-between">
        <Text className="text-xs uppercase" style={{ fontFamily: "Montserrat_600SemiBold", color: tint ?? "#a8a29e" }}>
          {title}
        </Text>
        <Text className="text-xs text-stone-400">{collapsed ? "▸" : "▾"}</Text>
      </Pressable>
      {collapsed ? null : children}
    </View>
  );
}

// Set-scheme rows are edited inline here (not lifted to the parent) since
// only this row's own onChange/rep_scheme is ever touched — each edit
// writes rep_scheme plus sets/reps kept in sync for every other place that
// still reads them flat (block-grid tiles, native read-only builders).
function RepSchemeRows({ item, onChange }) {
  const scheme = item.rep_scheme?.length ? item.rep_scheme : [item.reps ?? ""];

  const commit = (next) => {
    onChange(item.id, { rep_scheme: next, sets: next.length, reps: summarizeRepScheme(next) });
  };

  return (
    <View className="mt-2">
      {scheme.map((reps, i) => (
        <View key={i} className="mb-1.5 flex-row items-center gap-2">
          <Text className="w-12 text-xs text-stone-500" style={{ fontFamily: "Montserrat_500Medium" }}>
            Set {i + 1}
          </Text>
          <TextInput
            value={reps ?? ""}
            onChangeText={(v) => commit(scheme.map((r, idx) => (idx === i ? v : r)))}
            placeholder="reps (e.g. 10-12)"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2.5"
            style={{ fontFamily: "Montserrat_400Regular" }}
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
        <Text className="text-xs" style={{ fontFamily: "Montserrat_600SemiBold", color: "#8a5140" }}>
          + Add set
        </Text>
      </Pressable>
    </View>
  );
}

function SortableExerciseRow({ item, onChange, onRemove, onLinkSuperset, onUnlinkSuperset, isLastRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
            <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.exercises?.name}</Text>
            {item.exercises?.video_url ? (
              <Pressable
                onPress={() => Linking.openURL(item.exercises.video_url)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={`Watch video for ${item.exercises.name}`}
              >
                <Text className="text-xs" style={{ fontFamily: "Montserrat_400Regular", color: "#8a5140" }}>
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
              <Text style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 11, color: "#b23a22" }}>⚭ Superset</Text>
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
            value={item.tempo ?? ""}
            onChangeText={(v) => onChange(item.id, { tempo: v })}
            placeholder="tempo"
            className="w-20 rounded-lg border border-stone-300 px-2 py-2.5 text-center"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />
          <TextInput
            value={item.notes ?? ""}
            onChangeText={(v) => onChange(item.id, { notes: v })}
            placeholder="notes"
            className="flex-1 rounded-lg border border-stone-300 px-2 py-2.5"
            style={{ fontFamily: "Montserrat_400Regular" }}
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
            <Text className="text-xs" style={{ fontFamily: "Montserrat_600SemiBold", color: "#a8a29e" }}>
              +
            </Text>
          </Pressable>
        </View>
      ) : null}
    </div>
  );
}

export default function WorkoutBuilderWeb() {
  const { workoutId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();

  const [workout, setWorkout] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [siblingPatterns, setSiblingPatterns] = useState([]);
  const [search, setSearch] = useState("");
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Warm-ups collapsed by default per the direct ask; muscle-group sections
  // start expanded. Keyed by "warmups" or a muscle-group string.
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

  // Warm-ups are pinned above the muscle-group-grouped lifts, not bucketed
  // alongside them — a warm-up exercise has no muscle_group (null since
  // migration 0012), and mixing warm-up movements into the "back"/"chest"/
  // etc. lists would make it ambiguous which exercises are actually meant
  // for a session's warm-up slot.
  const isSearching = search.length > 0;
  const warmupLibrary = useMemo(() => filteredLibrary.filter((e) => e.type === "warmup"), [filteredLibrary]);
  // Only top-level (parent-less) exercises get bucketed by muscle group —
  // variations render nested under their parent instead, via childrenByParent
  // below. While actively searching, the flat filteredLibrary is used
  // directly instead (see render), so a direct search for a variation's
  // name always surfaces it without needing to expand its parent first.
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

  // Claims both sides of a new pairing, overwriting whichever superset
  // either exercise was previously part of (single-owner semantics — no
  // triples, just clean re-pairing).
  const handleLinkSuperset = (itemId, nextItemId) => {
    const groupId = crypto.randomUUID();
    setExercises((prev) => prev.map((e) => (e.id === itemId || e.id === nextItemId ? { ...e, superset_group_id: groupId } : e)));
    updateWorkoutExercise(itemId, { superset_group_id: groupId });
    updateWorkoutExercise(nextItemId, { superset_group_id: groupId });
  };

  const handleUnlinkSuperset = (item) => {
    const partner = exercises.find((e) => e.id !== item.id && e.superset_group_id === item.superset_group_id);
    setExercises((prev) =>
      prev.map((e) => (e.id === item.id || e.id === partner?.id ? { ...e, superset_group_id: null } : e))
    );
    updateWorkoutExercise(item.id, { superset_group_id: null });
    if (partner) updateWorkoutExercise(partner.id, { superset_group_id: null });
  };

  const handleNewExerciseCreated = async (form) => {
    const created = await createExercise({ ...form, createdBy: profile.id });
    setLibrary((prev) => [...prev, created]);
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
      reorderWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 })));
    }
  };

  const handleAddWarmup = async (exercise) => {
    const created = await addWarmup({
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

  const handleTitleChange = (title) => {
    setWorkout((w) => ({ ...w, title }));
    setWorkoutTitle(workoutId, title);
  };

  if (!workout) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#a46a57" />
      </View>
    );
  }

  const currentPatterns = exercises.flatMap((e) => e.exercises?.movement_pattern ?? []);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <View className="flex-1 flex-row bg-white">
        <View className="flex-col border-r border-stone-200" style={{ width: 288, flexGrow: 0, flexShrink: 0, height: "100%", minHeight: 0 }}>
          <View className="px-4 pb-3 pt-6">
            <Text className="mb-3 text-lg text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              Exercise Library
            </Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search…"
              className="mb-3 rounded-lg border border-stone-300 px-3 py-2"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
            <Pressable onPress={() => setNewExerciseModalVisible(true)} className="rounded-lg border border-primary px-3 py-2.5">
              <Text className="text-center" style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>
                + New Exercise
              </Text>
            </Pressable>
          </View>

          <ScrollView className="px-4 pb-6" style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
            {isSearching ? (
              <View className="mb-4">
                <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: "Montserrat_500Medium" }}>
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
              router.canGoBack() ? router.back() : router.push(`/(coach)/blocks?program=${workout.group_blocks.group_program_id}`)
            }
            className="mb-3 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>‹ Back</Text>
          </Pressable>
          <View className="mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
                {workout.group_blocks.group_programs.name} — Week {workout.week_number}, Session {workout.session_number}
              </Text>
              <Text
                className="text-xs"
                style={{ fontFamily: "Montserrat_500Medium", color: workout.status === "published" ? "#8a5140" : "#a8a29e" }}
              >
                {workout.status}
              </Text>
            </View>
            <Pressable onPress={handleTogglePublish} disabled={publishing} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {workout.status === "published" ? "Unpublish" : "Publish"}
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={workout.title ?? ""}
            onChangeText={handleTitleChange}
            placeholder="Session title (e.g. Back & Bis) — shown to the member"
            className="mb-6 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />

          <View className="mb-6 rounded-xl p-2.5">
            <Text
              className="mb-2 text-xs uppercase text-stone-400"
              style={{ fontFamily: "Montserrat_600SemiBold", letterSpacing: 0.4 }}
            >
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
                    <Text className="flex-1 text-stone-700" style={{ fontFamily: "Montserrat_500Medium", fontSize: 14 }}>
                      {w.exercises?.name ?? w.label}
                    </Text>
                    <TextInput
                      value={w.sets ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { sets: v })}
                      placeholder="sets"
                      className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-3"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    />
                    <TextInput
                      value={w.reps ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { reps: v })}
                      placeholder="reps"
                      className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-3"
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    />
                    <TextInput
                      value={w.notes ?? ""}
                      onChangeText={(v) => handleWarmupChange(w.id, { notes: v })}
                      placeholder="notes"
                      className="w-28 rounded-lg border border-stone-300 bg-white px-2 py-3"
                      style={{ fontFamily: "Montserrat_400Regular" }}
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
              <Text className="text-center" style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>
                + Insert warm-up exercise
              </Text>
            </Pressable>
            <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: "Montserrat_400Regular" }}>
              Max 5-6 movements.
            </Text>
          </View>

          <View className="mb-6 rounded-xl p-2.5">
            <Text
              className="mb-2 text-xs uppercase text-stone-700"
              style={{ fontFamily: "Montserrat_600SemiBold", letterSpacing: 0.4 }}
            >
              Main Session
            </Text>
            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {exercises.length === 0 ? (
                <View className="rounded-lg border border-dashed border-stone-300 px-4 py-8">
                  <Text className="text-center text-stone-400" style={{ fontFamily: "Montserrat_400Regular" }}>
                    Click an exercise in the library to add it.
                  </Text>
                </View>
              ) : (
                exercises.map((item, i) => (
                  <SortableExerciseRow
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
    </DndContext>
  );
}
