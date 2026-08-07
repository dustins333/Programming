import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
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
import { toastError } from "../../../../lib/toast";

const CATEGORY_LABELS = { away: "Away programming", trial: "Trial session" };

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
          <View className="flex-row items-center gap-1.5">
            <Text style={{ fontFamily: fonts.sansMedium }}>{exercise.name}</Text>
            {exercise.type === "warmup" ? (
              <View className="rounded-full px-2 py-[2px]" style={{ backgroundColor: "#fdf6ee" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#8a5a2e", fontSize: 9.5 }}>warm-up</Text>
              </View>
            ) : null}
          </View>
          {exercise.movement_pattern?.length ? (
            <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
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
