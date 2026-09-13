import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAuth } from "../../lib/auth/AuthProvider";
import { listExercises, createExercise, isLibraryReviewer } from "../../lib/programming/exercises";
import { ExerciseFormModal } from "../ExerciseFormModal";
import { ExercisePickerModal } from "../ExercisePickerModal";
import { ExerciseLibrarySidebar } from "../ExerciseLibrarySidebar";
import { SessionPreviewModal } from "../SessionPreviewModal";
import { PressFade } from "../PressFade";
import {
  BUILDER_CANVAS,
  BUILDER_CARD_BORDER,
  Eyebrow,
  SaveLight,
  WarmupGrid,
  WARMUP_SLOTS,
  SortableLift,
  schemeLabel,
} from "./SessionBuilderParts";
import { liftLabelsFor } from "../../lib/programming/sessionLabels";
import { fonts, colors } from "../../lib/theme";
import { toastError, showToast } from "../../lib/toast";
import { nextPosition } from "../../lib/position";

// The drag-and-drop builder for a single flat session: one prescription, no
// weeks, no block. Shared by a template (templates/[templateId].web.js) and a
// client's one-off session (one-offs/[oneOffId].web.js), which are the same
// shape in different tables. What differs is passed in as `api` rather than
// forked, so a fix to supersets or warm-up linking lands on both.
//
// Neither table has warm-up sets/reps columns, so the warm-up grid always runs
// with editable={false} and lists the movement alone.
//
// api: {
//   load()                                   -> { warmups, exercises }
//   addWarmup({ exerciseId, position })      -> row
//   updateWarmup(id, fields)
//   removeWarmup(id)
//   addExercise({ exerciseId, position, sets, reps }) -> row
//   updateExercise(id, fields)
//   removeExercise(id)
//   reorderExercises([{ id, position }])
// }
//
// header(state) renders the left of the header bar; headerActions(state) the
// right, after the save light. state = { warmups, exercises, saveState }.
export function FlatSessionBuilder({
  loadKey,
  api,
  header,
  headerActions,
  note,
  onBack,
  previewTitle,
  previewSubtitle,
  lastLiftNoun = "session",
}) {
  const { profile } = useAuth();

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  // Set when the new-exercise form was reached through a picker's "+ New" —
  // the created exercise then gets inserted immediately.
  const [pendingInsert, setPendingInsert] = useState(null); // null | "lift" | "warmup"
  const [pendingName, setPendingName] = useState("");
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [content, libraryRows] = await Promise.all([api.load(), listExercises()]);
      setWarmups(content.warmups);
      setExercises(content.exercises);
      setLibrary(libraryRows);
      setReady(true);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
    // api is rebuilt by the host each render; loadKey is what identifies the
    // thing being built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  useEffect(() => {
    load();
  }, [load]);

  const track = (promise, message) => {
    setSaveState("saving");
    return promise
      .then(() => setSaveState("saved"))
      .catch((err) => {
        setSaveState("error");
        toastError(message, err);
      });
  };

  const handleInsertExercise = async (exercise) => {
    try {
      setSaveState("saving");
      const created = await api.addExercise({
        exerciseId: exercise.id,
        position: nextPosition(exercises),
        sets: exercise.default_sets != null ? Number(exercise.default_sets) : undefined,
        reps: exercise.default_reps || undefined,
      });
      setExercises((prev) => [...prev, created]);
      setExpandedId(created.id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't add exercise", err);
    }
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    track(api.updateExercise(id, fields), "Couldn't save change");
  };

  const handleRemoveExercise = async (id) => {
    const removed = exercises.find((e) => e.id === id);
    const removedIndex = exercises.findIndex((e) => e.id === id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    try {
      setSaveState("saving");
      await api.removeExercise(id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't remove exercise", err);
      if (removed) setExercises((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleAddWarmup = async (exercise) => {
    // The library sidebar and the drag-drop zone both land here, and neither
    // is capped the way the grid's own "+ Add" is (that button hides at six).
    if (warmups.length >= WARMUP_SLOTS) {
      showToast(`Warm-up is full at ${WARMUP_SLOTS} — remove one first`, { type: "info" });
      return;
    }
    try {
      setSaveState("saving");
      const created = await api.addWarmup({ exerciseId: exercise.id, position: nextPosition(warmups) });
      setWarmups((prev) => [...prev, created]);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't add warm-up", err);
    }
  };

  const handleRemoveWarmup = async (id) => {
    const removed = warmups.find((w) => w.id === id);
    const removedIndex = warmups.findIndex((w) => w.id === id);
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    try {
      await api.removeWarmup(id);
    } catch (err) {
      toastError("Couldn't remove warm-up", err);
      if (removed) setWarmups((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleNewExerciseCreated = async (form) => {
    try {
      const created = await createExercise({ ...form, createdBy: profile.id, approved: isLibraryReviewer(profile) });
      setLibrary((prev) => [...prev, created]);
      // Came through a picker's "+ New": drop it straight in, routed by the
      // TYPE actually saved (see the group builder's note).
      if (pendingInsert) {
        if (created.type === "warmup") await handleAddWarmup(created);
        else await handleInsertExercise(created);
        setPendingInsert(null);
        setPendingName("");
      }
    } catch (err) {
      toastError("Failed to save exercise", err);
      throw err;
    }
  };

  const openCreateAndInsert = (target) => (searchText) => {
    setExercisePickerVisible(false);
    setWarmupPickerVisible(false);
    setPendingInsert(target);
    setPendingName(searchText ?? "");
    setNewExerciseModalVisible(true);
  };

  // One tap does both directions: link this lift to the next one, or break
  // whichever pairing it's already in — same semantics as the group builder.
  const handleToggleSuperset = (item) => {
    if (item.superset_group_id) {
      const partner = exercises.find((e) => e.id !== item.id && e.superset_group_id === item.superset_group_id);
      setExercises((prev) => prev.map((e) => (e.id === item.id || e.id === partner?.id ? { ...e, superset_group_id: null } : e)));
      track(
        Promise.all([
          api.updateExercise(item.id, { superset_group_id: null }),
          partner ? api.updateExercise(partner.id, { superset_group_id: null }) : Promise.resolve(),
        ]),
        "Couldn't unlink superset"
      );
      return;
    }
    const index = exercises.findIndex((e) => e.id === item.id);
    const next = exercises[index + 1];
    if (!next) {
      toastError("Nothing to superset with", `This is the last lift in the ${lastLiftNoun}`);
      return;
    }
    const groupId = crypto.randomUUID();
    setExercises((prev) => prev.map((e) => (e.id === item.id || e.id === next.id ? { ...e, superset_group_id: groupId } : e)));
    track(
      Promise.all([
        api.updateExercise(item.id, { superset_group_id: groupId }),
        api.updateExercise(next.id, { superset_group_id: groupId }),
      ]),
      "Couldn't link superset"
    );
  };

  // Superset with the PREVIOUS warm-up — chains of 3+ are allowed, unlike
  // lift supersets. Same semantics as the group builder's copy.
  const handleToggleWarmupLink = (w) => {
    if (w.superset_group_id) {
      const remaining = warmups.filter((x) => x.id !== w.id && x.superset_group_id === w.superset_group_id);
      const alsoClear = remaining.length === 1 ? remaining[0] : null;
      setWarmups((prev) =>
        prev.map((x) => (x.id === w.id || x.id === alsoClear?.id ? { ...x, superset_group_id: null } : x))
      );
      track(
        Promise.all([
          api.updateWarmup(w.id, { superset_group_id: null }),
          alsoClear ? api.updateWarmup(alsoClear.id, { superset_group_id: null }) : Promise.resolve(),
        ]),
        "Couldn't unlink warm-ups"
      );
      return;
    }
    const index = warmups.findIndex((x) => x.id === w.id);
    const prevWarmup = index > 0 ? warmups[index - 1] : null;
    if (!prevWarmup) return;
    const groupId = prevWarmup.superset_group_id ?? crypto.randomUUID();
    setWarmups((prev) => prev.map((x) => (x.id === w.id || x.id === prevWarmup.id ? { ...x, superset_group_id: groupId } : x)));
    track(
      Promise.all([
        api.updateWarmup(w.id, { superset_group_id: groupId }),
        prevWarmup.superset_group_id ? Promise.resolve() : api.updateWarmup(prevWarmup.id, { superset_group_id: groupId }),
      ]),
      "Couldn't link warm-ups"
    );
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((e) => e.id === active.id);
    const newIndex = exercises.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(exercises, oldIndex, newIndex);
    setExercises(reordered);
    track(
      api.reorderExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))),
      "Couldn't save reorder"
    );
  };

  const liftLabels = useMemo(() => liftLabelsFor(exercises), [exercises]);
  const state = { warmups, exercises, saveState };

  if (loadError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
          Couldn't load this: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: BUILDER_CANVAS }}>
        <ExerciseLibrarySidebar
          library={library}
          search={search}
          onSearchChange={setSearch}
          onNewExercise={() => setNewExerciseModalVisible(true)}
          onInsertLift={handleInsertExercise}
          onInsertWarmup={handleAddWarmup}
          onBack={() => onBack(state)}
        />

        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 14,
              paddingHorizontal: 26,
              paddingVertical: 14,
              backgroundColor: "#fff",
              borderBottomWidth: 1,
              borderBottomColor: BUILDER_CARD_BORDER,
            }}
          >
            <View style={{ minWidth: 0, flexShrink: 1 }}>{header(state)}</View>

            <View style={{ flex: 1 }} />

            <SaveLight state={saveState} />

            <PressFade
              onPress={() => setPreviewOpen(true)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Preview</Text>
            </PressFade>

            {headerActions ? headerActions(state) : null}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 26, paddingVertical: 22, paddingBottom: 60, maxWidth: 900 }}>
            {note ? (
              <View
                style={{
                  backgroundColor: "#fdf6f2",
                  borderWidth: 1,
                  borderColor: "#f0ddd2",
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 13,
                  marginBottom: 20,
                }}
              >
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5140", lineHeight: 18 }}>{note}</Text>
              </View>
            ) : null}

            <WarmupGrid
              warmups={warmups}
              onRemove={handleRemoveWarmup}
              onAdd={() => setWarmupPickerVisible(true)}
              onToggleLink={handleToggleWarmupLink}
              editable={false}
            />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 9 }}>
              <Eyebrow>
                MAIN SESSION · {exercises.length} LIFT{exercises.length === 1 ? "" : "S"}
              </Eyebrow>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c9c4bd" }}>Click a lift to edit</Text>
            </View>

            <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: BUILDER_CARD_BORDER, borderRadius: 12, overflow: "hidden" }}>
              <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                {exercises.length === 0 ? (
                  <View style={{ padding: 26 }}>
                    <Text style={{ textAlign: "center", fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>
                      Click an exercise in the library to add it.
                    </Text>
                  </View>
                ) : (
                  exercises.map((item, i) => (
                    <SortableLift
                      key={item.id}
                      item={item}
                      index={i}
                      label={liftLabels[item.id]}
                      expanded={expandedId === item.id}
                      onExpand={setExpandedId}
                      onChange={handleExerciseChange}
                      onRemove={handleRemoveExercise}
                      onToggleSuperset={handleToggleSuperset}
                      linkedToNext={Boolean(
                        item.superset_group_id && item.superset_group_id === exercises[i + 1]?.superset_group_id
                      )}
                    />
                  ))
                )}
              </SortableContext>
              <Pressable onPress={() => setExercisePickerVisible(true)} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}>
                <Text style={{ textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
                  + Insert exercise
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>

      <ExerciseFormModal
        visible={newExerciseModalVisible}
        initialExercise={null}
        initialType={pendingInsert === "warmup" ? "warmup" : "lift"}
        initialName={pendingName}
        submitLabel={pendingInsert ? "Save & insert" : undefined}
        allExercises={library}
        onClose={() => {
          setNewExerciseModalVisible(false);
          setPendingInsert(null);
          setPendingName("");
        }}
        onSubmit={handleNewExerciseCreated}
      />
      <ExercisePickerModal
        visible={warmupPickerVisible}
        library={library.filter((e) => e.type === "warmup")}
        onClose={() => setWarmupPickerVisible(false)}
        onPick={handleAddWarmup}
        onCreateNew={openCreateAndInsert("warmup")}
      />
      <ExercisePickerModal
        visible={exercisePickerVisible}
        library={library.filter((e) => e.type !== "warmup")}
        onClose={() => setExercisePickerVisible(false)}
        onPick={handleInsertExercise}
        onCreateNew={openCreateAndInsert("lift")}
      />
      <SessionPreviewModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={previewTitle}
        subtitle={previewSubtitle}
        warmups={warmups.map((w) => w.exercises?.name ?? w.label ?? "Warm-up")}
        exercises={exercises.map((e) => ({
          id: e.id,
          name: e.exercises?.name ?? "Exercise",
          detail: schemeLabel(e),
        }))}
      />
    </DndContext>
  );
}
