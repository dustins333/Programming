import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listExercises, createExercise } from "../../../../lib/programming/exercises";
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
import { ExerciseFormModal } from "../../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../../components/ExercisePickerModal";
import { ExerciseLibrarySidebar } from "../../../../components/ExerciseLibrarySidebar";
import { SessionPreviewModal } from "../../../../components/SessionPreviewModal";
import { PressFade } from "../../../../components/PressFade";
import {
  BUILDER_CANVAS,
  BUILDER_CARD_BORDER,
  Eyebrow,
  SaveLight,
  WarmupGrid,
  SortableLift,
  schemeLabel,
} from "../../../../components/builder/SessionBuilderParts";
import { fonts, colors } from "../../../../lib/theme";
import { toastError } from "../../../../lib/toast";

// Template builder, coach web — the third consumer of the shared session
// builder (design_handoff_coach_web_v2, screen 06).
//
// A template is one flat prescription reused across clients, so three things
// the group and SPC builders have don't apply and are switched off rather
// than faked:
//   · no draft/publish — a template isn't visible to any member directly
//   · no supersets — deliberately excluded from templates in migration 0030
//   · no tempo — template_exercises has no tempo column
//   · no balance / last-week rails — there's no block or sibling sessions
//     to compare a standalone template against
//
// template_warmups also has no sets/reps columns (unlike group and SPC), so
// the warm-up grid runs with editable={false} and lists the movement alone.

const CATEGORY_LABELS = { away: "Away programming", trial: "Trial session" };

export default function TemplateBuilderWeb() {
  const { templateId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();

  const [template, setTemplate] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [templateRow, warmupRows, exerciseRows, libraryRows] = await Promise.all([
        getTemplate(templateId),
        listTemplateWarmups(templateId),
        listTemplateExercises(templateId),
        listExercises(),
      ]);
      setTemplate(templateRow);
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
      const created = await addTemplateExercise({
        templateId,
        exerciseId: exercise.id,
        position: exercises.length + 1,
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
    track(updateTemplateExercise(id, fields), "Couldn't save change");
  };

  const handleRemoveExercise = async (id) => {
    const removed = exercises.find((e) => e.id === id);
    const removedIndex = exercises.findIndex((e) => e.id === id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    try {
      setSaveState("saving");
      await removeTemplateExercise(id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't remove exercise", err);
      if (removed) setExercises((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
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

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((e) => e.id === active.id);
    const newIndex = exercises.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(exercises, oldIndex, newIndex);
    setExercises(reordered);
    track(
      reorderTemplateExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))),
      "Couldn't save reorder"
    );
  };

  const handleAddWarmup = async (exercise) => {
    try {
      setSaveState("saving");
      const created = await addTemplateWarmup({ templateId, exerciseId: exercise.id, position: warmups.length + 1 });
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
      await removeTemplateWarmup(id);
    } catch (err) {
      toastError("Couldn't remove warm-up", err);
      if (removed) setWarmups((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  if (loadError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
          Couldn't load this template: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!template) {
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
          onBack={() => (router.canGoBack() ? router.back() : router.push("/(coach)/spc/templates"))}
        />

        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingHorizontal: 26,
              paddingVertical: 14,
              backgroundColor: "#fff",
              borderBottomWidth: 1,
              borderBottomColor: BUILDER_CARD_BORDER,
            }}
          >
            <View style={{ minWidth: 0 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                Template · {CATEGORY_LABELS[template.category] ?? template.category}
              </Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c" }}>{template.name}</Text>
            </View>

            <View style={{ flex: 1 }} />

            <SaveLight state={saveState} />

            <PressFade
              onPress={() => setPreviewOpen(true)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Preview</Text>
            </PressFade>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 26, paddingVertical: 22, paddingBottom: 60, maxWidth: 900 }}>
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
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5140", lineHeight: 18 }}>
                A template is written once and copied onto a client when you assign it. Editing it here doesn't change
                any one-off already assigned from it.
              </Text>
            </View>

            <WarmupGrid
              warmups={warmups}
              onRemove={handleRemoveWarmup}
              onAdd={() => setWarmupPickerVisible(true)}
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
                      expanded={expandedId === item.id}
                      onExpand={setExpandedId}
                      onChange={handleExerciseChange}
                      onRemove={handleRemoveExercise}
                      showTempo={false}
                      showSuperset={false}
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
      <SessionPreviewModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={template.name}
        subtitle="Exactly what the client sees once this is assigned"
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
