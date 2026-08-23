import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listExercises, createExercise } from "../../../lib/programming/exercises";
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
  getSiblingLifts,
  getSameSessionLastWeek,
  copyWorkoutContent,
  setWorkoutStatus,
  setWorkoutTitle,
  listDistinctLiftsForWorkouts,
  listDistinctWarmupsForWorkouts,
} from "../../../lib/programming/workouts";
import { listWorkoutsForBlock } from "../../../lib/programming/blocks";
import {
  listSessionEducation,
  createSessionEducation,
  updateSessionEducation,
  deleteSessionEducation,
} from "../../../lib/programming/sessionEducation";
import { CoachEducationRail } from "../../../components/builder/CoachEducationRail";
import { RailResizer, loadRailWidth } from "../../../components/builder/RailResizer";
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../components/ExercisePickerModal";
import { ExerciseLibrarySidebar } from "../../../components/ExerciseLibrarySidebar";
import { SessionPreviewModal } from "../../../components/SessionPreviewModal";
import { CommentThread } from "../../../components/CommentThread";
import { PressFade } from "../../../components/PressFade";
import {
  BUILDER_CANVAS,
  BUILDER_CARD_BORDER,
  Eyebrow,
  SaveLight,
  WarmupGrid,
  WARMUP_SLOTS,
  SortableLift,
  BalanceRail,
  LastWeekRail,
  schemeLabel,
  supersetLettersFor,
  patternCountsFor,
  balanceNoteFor,
} from "../../../components/builder/SessionBuilderParts";
import { confirmOverwrite } from "../../../lib/confirmDialog";
import { toastError, toastSuccess, showToast } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { nextPosition } from "../../../lib/position";

// Session builder, coach web (design_handoff_coach_web_v2, 1e).
//
// The whole session reads as one dense line per lift and only the lift
// you're touching expands — so the shape of the session stays visible
// while you edit a detail of it. That replaces the previous layout, where
// every lift was permanently expanded into a card of inputs and six lifts
// meant scrolling past forty form fields to see what you'd written.
//
// Rest is chips backed by plain seconds. The column stays `text` (it is on
// all four exercise tables, and a type change would have to reinterpret
// years of free-text values like "60-90s"), but everything this screen
// writes is now a canonical seconds string — which is exactly what the
// member app's rest timer parses. Legacy values keep working because
// parseRestSeconds already handles them.

/* ------------------------------------------------------------------ page */

export default function WorkoutBuilderWeb() {
  const { workoutId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();

  const [workout, setWorkout] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [siblingLifts, setSiblingLifts] = useState([]);
  const [lastWeek, setLastWeek] = useState(null);
  const [blockWorkouts, setBlockWorkouts] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copyingLastWeek, setCopyingLastWeek] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  // Right rail is two tabs now: what's programmed this week, and the coach
  // education that goes out with the block (migration 0079).
  const [railTab, setRailTab] = useState("week"); // week | education
  const [education, setEducation] = useState([]);
  const [educationLifts, setEducationLifts] = useState([]);
  const [educationWarmups, setEducationWarmups] = useState([]);
  const [educationState, setEducationState] = useState("loading"); // loading | ready | error
  // Lazy initialiser, so the stored width is read once rather than on every
  // render — and so server rendering never touches localStorage.
  const [railWidth, setRailWidth] = useState(() => loadRailWidth(268));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const w = await getWorkout(workoutId);
      setWorkout(w);
      const [warmupRows, exerciseRows, libraryRows, siblings, allBlockWorkouts, previousWeek] = await Promise.all([
        listWarmups(workoutId),
        listWorkoutExercises(workoutId),
        listExercises(),
        getSiblingLifts(w.group_blocks.id, w.week_number, workoutId),
        listWorkoutsForBlock(w.group_blocks.id),
        getSameSessionLastWeek(w.group_blocks.id, w.week_number, w.session_number).catch(() => null),
      ]);
      setWarmups(warmupRows);
      setExercises(exerciseRows);
      setLibrary(libraryRows);
      setSiblingLifts(siblings);
      setBlockWorkouts(allBlockWorkouts);
      setLastWeek(previousWeek);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  // Education is keyed to (block, session_number), not to this workout — so
  // the dropdown offers every lift programmed for this session anywhere in
  // the block, not just the week that happens to be open.
  const educationBlockId = workout?.group_blocks?.id ?? null;
  const educationSession = workout?.session_number ?? null;
  const sessionWorkoutIds = useMemo(
    () => blockWorkouts.filter((w) => w.session_number === educationSession).map((w) => w.id),
    [blockWorkouts, educationSession]
  );

  // Fetched separately from load(), not inside its Promise.all: a failure
  // here must leave the builder itself perfectly usable.
  const loadEducation = useCallback(async () => {
    if (!educationBlockId || !educationSession) return;
    setEducationState("loading");
    try {
      const [rows, lifts, warmups] = await Promise.all([
        listSessionEducation(educationBlockId, educationSession),
        listDistinctLiftsForWorkouts(sessionWorkoutIds),
        listDistinctWarmupsForWorkouts(sessionWorkoutIds),
      ]);
      setEducation(rows);
      setEducationLifts(lifts);
      setEducationWarmups(warmups);
      setEducationState("ready");
    } catch (err) {
      console.error("Builder: failed to load coach education", err);
      setEducationState("error");
    }
  }, [educationBlockId, educationSession, sessionWorkoutIds]);

  useEffect(() => {
    loadEducation();
  }, [loadEducation]);

  // Every write on this screen is optimistic-then-persist, so the header's
  // "Saved" light is the only thing telling a coach the round trip landed.
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
      const created = await addWorkoutExercise({
        workoutId,
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
    track(updateWorkoutExercise(id, fields), "Couldn't save change");
  };

  const handleRemoveExercise = async (id) => {
    const removed = exercises.find((e) => e.id === id);
    const removedIndex = exercises.findIndex((e) => e.id === id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    try {
      setSaveState("saving");
      await removeWorkoutExercise(id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't remove exercise", err);
      if (removed) setExercises((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  // One tap now does both directions: link this lift to the next one, or
  // break whichever pairing it's already in. Single-owner semantics — no
  // triples, just clean re-pairing — same as before.
  const handleToggleSuperset = (item) => {
    if (item.superset_group_id) {
      const partner = exercises.find((e) => e.id !== item.id && e.superset_group_id === item.superset_group_id);
      setExercises((prev) => prev.map((e) => (e.id === item.id || e.id === partner?.id ? { ...e, superset_group_id: null } : e)));
      track(
        Promise.all([
          updateWorkoutExercise(item.id, { superset_group_id: null }),
          partner ? updateWorkoutExercise(partner.id, { superset_group_id: null }) : Promise.resolve(),
        ]),
        "Couldn't unlink superset"
      );
      return;
    }
    const index = exercises.findIndex((e) => e.id === item.id);
    const next = exercises[index + 1];
    if (!next) {
      toastError("Nothing to superset with", "This is the last lift in the session");
      return;
    }
    const groupId = crypto.randomUUID();
    setExercises((prev) => prev.map((e) => (e.id === item.id || e.id === next.id ? { ...e, superset_group_id: groupId } : e)));
    track(
      Promise.all([
        updateWorkoutExercise(item.id, { superset_group_id: groupId }),
        updateWorkoutExercise(next.id, { superset_group_id: groupId }),
      ]),
      "Couldn't link superset"
    );
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
      reorderWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))),
      "Couldn't save reorder"
    );
  };

  const handleAddWarmup = async (exercise) => {
    // The library sidebar and the drag-drop zone both land here, and neither
    // was capped the way the grid's own "+ Add" is (that button hides at six).
    // So a coach already at six could keep clicking warm-ups in the sidebar;
    // each one saved, and none of them appeared.
    if (warmups.length >= WARMUP_SLOTS) {
      showToast(`Warm-up is full at ${WARMUP_SLOTS} — remove one first`, { type: "info" });
      return;
    }
    try {
      setSaveState("saving");
      const created = await addWarmup({
        workoutId,
        exerciseId: exercise.id,
        position: nextPosition(warmups),
        sets: exercise.default_sets != null ? String(exercise.default_sets) : undefined,
        reps: exercise.default_reps || undefined,
      });
      setWarmups((prev) => [...prev, created]);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't add warm-up", err);
    }
  };

  const handleWarmupChange = (id, fields) => {
    setWarmups((prev) => prev.map((w) => (w.id === id ? { ...w, ...fields } : w)));
    track(updateWarmup(id, fields), "Couldn't save change");
  };

  const handleRemoveWarmup = async (id) => {
    const removed = warmups.find((w) => w.id === id);
    const removedIndex = warmups.findIndex((w) => w.id === id);
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    try {
      await removeWarmup(id);
    } catch (err) {
      toastError("Couldn't remove warm-up", err);
      if (removed) setWarmups((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleTogglePublish = async () => {
    setPublishing(true);
    try {
      const next = workout.status === "published" ? "draft" : "published";
      await setWorkoutStatus(workoutId, next);
      setWorkout((w) => ({ ...w, status: next }));
      toastSuccess(next === "published" ? "Published — members can see it now" : "Unpublished");
    } catch (err) {
      toastError("Couldn't publish", err);
    } finally {
      setPublishing(false);
    }
  };

  const handleTitleChange = (title) => {
    setWorkout((w) => ({ ...w, title }));
    track(setWorkoutTitle(workoutId, title), "Couldn't save title");
  };

  const handleAddEducation = async () => {
    try {
      setSaveState("saving");
      const created = await createSessionEducation({
        groupBlockId: educationBlockId,
        sessionNumber: educationSession,
        position: education.length,
        createdBy: profile?.id ?? null,
      });
      setEducation((prev) => [...prev, created]);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't add the note", err);
    }
  };

  const handleEducationChange = (id, fields) => {
    setEducation((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    track(updateSessionEducation(id, fields), "Couldn't save the note");
  };

  const handleRemoveEducation = async (id) => {
    const removed = education.find((e) => e.id === id);
    const index = education.findIndex((e) => e.id === id);
    setEducation((prev) => prev.filter((e) => e.id !== id));
    try {
      setSaveState("saving");
      await deleteSessionEducation(id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't remove the note", err);
      if (removed) setEducation((prev) => [...prev.slice(0, index), removed, ...prev.slice(index)]);
    }
  };

  const handleCopyLastWeek = async () => {
    if (!lastWeek) return;
    if (exercises.length > 0 && !(await confirmOverwrite(1))) return;
    setCopyingLastWeek(true);
    try {
      await copyWorkoutContent(lastWeek.workout.id, workoutId);
      await load();
      toastSuccess("Copied last week's session in");
    } catch (err) {
      toastError("Couldn't copy last week", err);
    } finally {
      setCopyingLastWeek(false);
    }
  };

  const supersetLetters = useMemo(() => supersetLettersFor(exercises), [exercises]);
  const patternCounts = useMemo(() => patternCountsFor(exercises, siblingLifts), [exercises, siblingLifts]);
  const balanceNote = useMemo(() => balanceNoteFor(patternCounts), [patternCounts]);

  if (loadError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
          Couldn't load this workout: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const idx = blockWorkouts.findIndex((w) => w.id === workout.id);
  const prev = idx > 0 ? blockWorkouts[idx - 1] : null;
  const next = idx >= 0 && idx < blockWorkouts.length - 1 ? blockWorkouts[idx + 1] : null;
  const published = workout.status === "published";

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
          // dismissTo, not back(). back() returns to whatever screen came
          // last, which after paging through sessions with the < > arrows is
          // the *previous session's builder*, not the grid. dismissTo unwinds
          // the stack to the grid if it is in there (restoring the program tab
          // the URL now carries) and replaces the current screen with it if
          // this builder was opened cold from a link.
          onBack={() => router.dismissTo(`/(coach)/blocks?program=${workout.group_blocks.group_program_id}`)}
        />

        <View style={{ flex: 1 }}>
          {/* Header stays put while the session scrolls under it — the
              publish control and the where-am-I breadcrumb are needed at
              any scroll depth. */}
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
                {workout.group_blocks.group_programs.name} · Block
              </Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c" }}>
                Week {workout.week_number}, Session {workout.session_number}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 6 }}>
              {[
                [prev, "‹"],
                [next, "›"],
              ].map(([target, glyph]) => (
                <Pressable
                  key={glyph}
                  onPress={target ? () => router.push(`/(coach)/builder/${target.id}`) : undefined}
                  accessibilityLabel={glyph === "‹" ? "Previous session" : "Next session"}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: BUILDER_CARD_BORDER,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: target ? 1 : 0.35,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#57534e" }}>{glyph}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flex: 1 }} />

            <SaveLight state={saveState} />

            <View style={{ backgroundColor: published ? "#e3ead9" : "#fdf6ec", borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: published ? "#4d6142" : "#8a6320" }}>
                {published ? "PUBLISHED" : "DRAFT"}
              </Text>
            </View>

            <PressFade
              onPress={() => setPreviewOpen(true)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Preview</Text>
            </PressFade>
            <Pressable
              onPress={publishing ? undefined : handleTogglePublish}
              style={{ backgroundColor: published ? "#fff" : colors.primary, borderWidth: published ? 1 : 0, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 18, opacity: publishing ? 0.6 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: published ? "#44403c" : "#fff" }}>
                {published ? "Unpublish" : "Publish"}
              </Text>
            </Pressable>
          </View>

          <View style={{ flex: 1, flexDirection: "row" }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 26, paddingVertical: 22, paddingBottom: 60 }}>
              <TextInput
                value={workout.title ?? ""}
                onChangeText={handleTitleChange}
                placeholder="Name this session…"
                style={{
                  fontFamily: fonts.display,
                  fontSize: 26,
                  color: workout.title ? "#2a211c" : "#c9c4bd",
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#ece7e1",
                  marginBottom: 20,
                }}
              />

              <WarmupGrid
                warmups={warmups}
                onChange={handleWarmupChange}
                onRemove={handleRemoveWarmup}
                onAdd={() => setWarmupPickerVisible(true)}
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
                        onToggleSuperset={handleToggleSuperset}
                        supersetLetter={item.superset_group_id ? supersetLetters[item.superset_group_id] : null}
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

            {/* The resizer IS the divider now, so the rail drops its own
                left border rather than drawing a second line beside it. */}
            <RailResizer width={railWidth} onResize={setRailWidth} />

            <ScrollView
              style={{ width: railWidth, flexGrow: 0, flexShrink: 0, backgroundColor: "#faf8f6" }}
              contentContainerStyle={{ padding: 18, flexGrow: 1 }}
            >
              <RailTabs tab={railTab} onChange={setRailTab} educationCount={education.length} />

              {railTab === "week" ? (
                <>
                  <BalanceRail counts={patternCounts} note={balanceNote} />
                  <LastWeekRail lastWeek={lastWeek} onCopy={handleCopyLastWeek} copying={copyingLastWeek} />
                  {/* Not in the v2 mock, kept deliberately: block notes are
                      coach-to-coach and the native builder still shows them, so
                      dropping them here would mean a note written on a phone was
                      invisible on the platform the work actually happens on. */}
                  <View style={{ marginTop: 26 }}>
                    <CommentThread groupBlockId={workout.group_blocks.id} />
                  </View>
                </>
              ) : (
                <CoachEducationRail
                  sessionNumber={workout.session_number}
                  items={education}
                  lifts={educationLifts}
                  warmups={educationWarmups}
                  loading={educationState === "loading"}
                  error={educationState === "error"}
                  onAdd={handleAddEducation}
                  onChange={handleEducationChange}
                  onRemove={handleRemoveEducation}
                  onRetry={loadEducation}
                />
              )}
            </ScrollView>
          </View>
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
        title={workout.title || `Week ${workout.week_number}, Session ${workout.session_number}`}
        subtitle="Exactly what the member sees"
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

/* ------------------------------------------------------------ rail tabs */

// Two-up strip at the top of the right rail. The count sits on the tab
// itself so a coach can tell there's education on this session without
// switching tabs to find out.
function RailTabs({ tab, onChange, educationCount }) {
  const tabs = [
    { key: "week", label: "This week" },
    { key: "education", label: "Coach ed", count: educationCount },
  ];
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#f4f1ec", borderRadius: 10, padding: 3, marginBottom: 18 }}>
      {tabs.map((t) => {
        const active = t.key === tab;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={{ flex: 1, borderRadius: 8, paddingVertical: 7, backgroundColor: active ? "#fff" : "transparent" }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{
                textAlign: "center",
                fontFamily: active ? fonts.sansBold : fonts.sansMedium,
                fontSize: 12,
                color: active ? "#2a211c" : "#78716c",
              }}
            >
              {t.label}
              {t.count ? ` · ${t.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
