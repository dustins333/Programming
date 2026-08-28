import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listExercises, createExercise, isLibraryReviewer } from "../../../../lib/programming/exercises";
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
  getSpcSiblingLifts,
  getSpcSameSessionLastWeek,
  copySpcWorkoutContent,
  setSpcWorkoutStatus,
  setSpcWorkoutTitle,
} from "../../../../lib/programming/spcWorkouts";
import { listSpcWorkoutsForBlock } from "../../../../lib/programming/spcBlocks";
import { ExerciseFormModal } from "../../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../../components/ExercisePickerModal";
import { ExerciseLibrarySidebar } from "../../../../components/ExerciseLibrarySidebar";
import { SessionPreviewModal } from "../../../../components/SessionPreviewModal";
import { CommentThread } from "../../../../components/CommentThread";
import { ClientLimitationsCard } from "../../../../components/ClientLimitationsCard";
import { listClientLimitations } from "../../../../lib/programming/clientNotes";
import { getClientGoal } from "../../../../lib/programming/clientGoals";
import { ClientGoalCard } from "../../../../components/ClientGoalCard";
import { PressFade } from "../../../../components/PressFade";
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
  patternCountsFor,
  balanceNoteFor,
} from "../../../../components/builder/SessionBuilderParts";
import { liftLabelsFor } from "../../../../lib/programming/sessionLabels";
import { confirmOverwrite } from "../../../../lib/confirmDialog";
import { toastError, toastSuccess, showToast } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { nextPosition } from "../../../../lib/position";

// SPC session builder, coach web (design_handoff_coach_web_v2, screen 06).
//
// Structurally the same screen as the group builder — they share every piece
// through components/builder/SessionBuilderParts. That is deliberate: a coach
// moves between a group session and an SPC session interchangeably, and the
// previous split (group rebuilt to the v2 layout, SPC left on permanently
// expanded cards) was a real inconsistency between two screens doing the
// same job.
//
// What's genuinely different here is only the shape of the thing being
// programmed: an SPC block belongs to one client rather than a shared
// program, so the header names her and the back link goes to her block
// rather than to a program grid.

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
  const [siblingLifts, setSiblingLifts] = useState([]);
  const [lastWeek, setLastWeek] = useState(null);
  const [blockWorkouts, setBlockWorkouts] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  // Set when the new-exercise form was reached through a picker's "+ New" —
  // the created exercise then gets inserted into this session immediately.
  const [pendingInsert, setPendingInsert] = useState(null); // null | "lift" | "warmup"
  const [pendingName, setPendingName] = useState("");
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copyingLastWeek, setCopyingLastWeek] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  // Own state, own failure mode — migration 0057 may not be run in every
  // environment, and a builder must never fail to open over a rail panel.
  const [limitations, setLimitations] = useState(null);
  const [goal, setGoal] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const w = await getSpcWorkout(workoutId);
      setWorkout(w);
      const [memberRow, warmupRows, exerciseRows, libraryRows, siblings, allBlockWorkouts, previousWeek] = await Promise.all([
        getUser(w.spc_blocks.spc_client_id),
        listSpcWarmups(workoutId),
        listSpcWorkoutExercises(workoutId),
        listExercises(),
        getSpcSiblingLifts(w.spc_blocks.id, w.week_number, workoutId),
        listSpcWorkoutsForBlock(w.spc_blocks.id),
        getSpcSameSessionLastWeek(w.spc_blocks.id, w.week_number, w.session_number).catch(() => null),
      ]);
      setMember(memberRow);
      setWarmups(warmupRows);
      setExercises(exerciseRows);
      setLibrary(libraryRows);
      setSiblingLifts(siblings);
      setBlockWorkouts(allBlockWorkouts);
      try {
        setLimitations(await listClientLimitations(w.spc_blocks.spc_client_id));
      } catch {
        setLimitations([]);
      }
      try {
        setGoal((await getClientGoal(w.spc_blocks.spc_client_id))?.goal ?? null);
      } catch {
        setGoal(null);
      }
      setLastWeek(previousWeek);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  // Every write here is optimistic-then-persist, so the header's "Saved"
  // light is the only thing telling a coach the round trip landed.
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
      const created = await addSpcWorkoutExercise({
        workoutId,
        exerciseId: exercise.id,
        position: nextPosition(exercises),
        userId: workout.spc_blocks.spc_client_id,
        defaultSets: exercise.default_sets,
        defaultReps: exercise.default_reps,
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
    track(updateSpcWorkoutExercise(id, fields), "Couldn't save change");
  };

  const handleRemoveExercise = async (id) => {
    const removed = exercises.find((e) => e.id === id);
    const removedIndex = exercises.findIndex((e) => e.id === id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    try {
      setSaveState("saving");
      await removeSpcWorkoutExercise(id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't remove exercise", err);
      if (removed) setExercises((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  // One tap does both directions: link this lift to the next one, or break
  // whichever pairing it's already in. Single-owner semantics — no triples,
  // just clean re-pairing — same as the group builder.
  const handleToggleSuperset = (item) => {
    if (item.superset_group_id) {
      const partner = exercises.find((e) => e.id !== item.id && e.superset_group_id === item.superset_group_id);
      setExercises((prev) => prev.map((e) => (e.id === item.id || e.id === partner?.id ? { ...e, superset_group_id: null } : e)));
      track(
        Promise.all([
          updateSpcWorkoutExercise(item.id, { superset_group_id: null }),
          partner ? updateSpcWorkoutExercise(partner.id, { superset_group_id: null }) : Promise.resolve(),
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
        updateSpcWorkoutExercise(item.id, { superset_group_id: groupId }),
        updateSpcWorkoutExercise(next.id, { superset_group_id: groupId }),
      ]),
      "Couldn't link superset"
    );
  };

  const handleNewExerciseCreated = async (form) => {
    try {
      const created = await createExercise({ ...form, createdBy: profile.id, approved: isLibraryReviewer(profile) });
      setLibrary((prev) => [...prev, created]);
      // Came through a picker's "+ New": drop it straight into the session,
      // routed by the TYPE actually saved (see the group builder's note).
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
          updateSpcWarmup(w.id, { superset_group_id: null }),
          alsoClear ? updateSpcWarmup(alsoClear.id, { superset_group_id: null }) : Promise.resolve(),
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
        updateSpcWarmup(w.id, { superset_group_id: groupId }),
        prevWarmup.superset_group_id ? Promise.resolve() : updateSpcWarmup(prevWarmup.id, { superset_group_id: groupId }),
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
      reorderSpcWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))),
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
      const created = await addSpcWarmup({
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
    track(updateSpcWarmup(id, fields), "Couldn't save change");
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
      toastSuccess(next === "published" ? "Published — visible to the client now" : "Unpublished");
    } catch (err) {
      toastError("Couldn't publish", err);
    } finally {
      setPublishing(false);
    }
  };

  const handleTitleChange = (title) => {
    setWorkout((w) => ({ ...w, title }));
    track(setSpcWorkoutTitle(workoutId, title), "Couldn't save title");
  };

  const handleCopyLastWeek = async () => {
    if (!lastWeek) return;
    if (exercises.length > 0 && !(await confirmOverwrite(1))) return;
    setCopyingLastWeek(true);
    try {
      await copySpcWorkoutContent(lastWeek.workout.id, workoutId);
      await load();
      toastSuccess("Copied last week's session in");
    } catch (err) {
      toastError("Couldn't copy last week", err);
    } finally {
      setCopyingLastWeek(false);
    }
  };

  const liftLabels = useMemo(() => liftLabelsFor(exercises), [exercises]);
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

  if (!workout || !member) {
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
          // Same reasoning as the group builder: after paging sessions with
          // the < > arrows, back() lands on the previous session's builder
          // rather than the client. dismissTo unwinds to the client page.
          onBack={() => router.dismissTo(`/(coach)/spc/${workout.spc_blocks.spc_client_id}`)}
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
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{member.name} · SPC</Text>
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
                  onPress={target ? () => router.push(`/(coach)/spc/builder/${target.id}`) : undefined}
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
              style={{
                backgroundColor: published ? "#fff" : colors.primary,
                borderWidth: published ? 1 : 0,
                borderColor: "#d9d4cd",
                borderRadius: 9,
                paddingVertical: 9,
                paddingHorizontal: 18,
                opacity: publishing ? 0.6 : 1,
              }}
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
                onToggleLink={handleToggleWarmupLink}
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
                        label={liftLabels[item.id]}
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

            <ScrollView
              style={{ width: 268, flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: BUILDER_CARD_BORDER, backgroundColor: "#faf8f6" }}
              contentContainerStyle={{ padding: 18, flexGrow: 1 }}
            >
              {/* The goal leads the rail, then limitations: what she's working
                  toward is the frame, and the limitations are the constraints
                  on it. Read-only — editing belongs on her own page. */}
              {goal ? (
                <ClientGoalCard goal={goal} showSharedMark={false} style={{ marginBottom: 18 }} />
              ) : null}
              {/* Limitations lead the constraints — they're a constraint on what
                  you're about to write, so they have to be read before the
                  balance and last-week panels, not after. Read-only here:
                  editing them belongs on the client's own page, which is
                  where the coach has the context to change one. */}
              {limitations && limitations.length > 0 ? (
                <View style={{ marginBottom: 22 }}>
                  <Text
                    style={{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.55, color: "#a8a29e", textTransform: "uppercase", marginBottom: 10 }}
                  >
                    Limitations
                  </Text>
                  <ClientLimitationsCard limitations={limitations} editable={false} compact />
                </View>
              ) : null}
              <BalanceRail counts={patternCounts} note={balanceNote} />
              <LastWeekRail lastWeek={lastWeek} onCopy={handleCopyLastWeek} copying={copyingLastWeek} />
              {/* Same reasoning as the group builder: block notes are
                  coach-to-coach and the native builder still shows them. */}
              <View style={{ marginTop: 26 }}>
                <CommentThread spcBlockId={workout.spc_blocks.id} />
              </View>
            </ScrollView>
          </View>
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
        title={workout.title || `Week ${workout.week_number}, Session ${workout.session_number}`}
        subtitle="Exactly what the client sees"
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
