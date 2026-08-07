import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { listGroupPrograms, createGroupProgram, updateGroupProgram, createBlock, listWorkoutsForBlock, listBlocksForProgram, addDays } from "../../../lib/programming/blocks";
import { listWorkoutExercisesForWorkouts, copyWorkoutContent } from "../../../lib/programming/workouts";
import { currentWeekNumber } from "../../../lib/programming/schedule";
import { WEEK_OFFSETS, groupRows } from "../../../lib/programming/gridRows";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMD } from "../../../lib/formatDate";
import { confirmOverwrite } from "../../../lib/confirmDialog";
import { toastError } from "../../../lib/toast";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { NewBlockModal } from "../../../components/NewBlockModal";
import { NewGroupProgramModal } from "../../../components/NewGroupProgramModal";
import { CoachShell } from "../../../components/CoachShell";
import { SessionCell, PlaceholderCell, GapSlot, SESSION_COL_WIDTH, CELL_MIN_HEIGHT, CELL_GAP } from "../../../components/BlockGridCells";
import { fonts, colors } from "../../../lib/theme";

const ROW_LABEL_WIDTH = 118;
const PANEL_PADDING = 14;
// Approximate height of a panel's name-band + session-label header stack —
// the row-label column has no header of its own, so it gets a plain spacer
// this tall to keep "Current week" etc. lined up with the first grid row
// inside the panel next to it. A few px of slop here is invisible in
// practice (rows are 122px tall), so this doesn't need to be exact.
const HEADER_STACK_HEIGHT = 94;
const DISPLAY_NAME = { "Better With Age": "BWA" };
const PANEL_BG = { Flagship: "#fdf6f2", "Better With Age": "#eef1e7" };
// Building/editing programming is web-only per direct request — native is
// a read-only view of whatever's already built (block creation, the
// per-program settings editor, and the click-to-copy flow all disappear
// here; tapping a session cell still opens the builder route, which is
// itself read-only on native — see app/(coach)/builder/[workoutId].js).
const isWeb = Platform.OS === "web";

async function loadProgramData(program) {
  const allBlocks = await listBlocksForProgram(program.id);
  const today = todayInBoise();

  const rows = WEEK_OFFSETS.map(({ offset, label }) => {
    const weekDate = addDays(today, offset * 7);
    const block = allBlocks.find((b) => b.block_start_date <= weekDate && weekDate <= b.block_end_date) ?? null;
    const weekNum = block ? currentWeekNumber(block.block_start_date, program.block_length_weeks, weekDate) : null;
    return { offset, label, weekDate, block, weekNum, sessions: [] };
  });

  const blockIds = [...new Set(rows.map((r) => r.block?.id).filter(Boolean))];
  const workoutsByBlockId = {};
  await Promise.all(
    blockIds.map(async (id) => {
      workoutsByBlockId[id] = await listWorkoutsForBlock(id);
    })
  );

  const allWorkoutIds = [];
  for (const row of rows) {
    if (!row.block) continue;
    row.sessions = (workoutsByBlockId[row.block.id] ?? []).filter((w) => w.week_number === row.weekNum);
    allWorkoutIds.push(...row.sessions.map((s) => s.id));
  }

  const exercisesByWorkout = await listWorkoutExercisesForWorkouts(allWorkoutIds);
  return { program, rows, exercisesByWorkout, allBlocks };
}

export default function Blocks() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [programData, setProgramData] = useState(null);
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newProgramModalVisible, setNewProgramModalVisible] = useState(false);
  const [editProgramModalVisible, setEditProgramModalVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [startingProgramId, setStartingProgramId] = useState(null);
  const [copySource, setCopySource] = useState(null);
  const [copyTargets, setCopyTargets] = useState(new Set());
  const [copyBusy, setCopyBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const programs = await listGroupPrograms();
      const ordered = [...programs].sort((a, b) => (a.name === "Flagship" ? -1 : b.name === "Flagship" ? 1 : 0));
      setProgramData(await Promise.all(ordered.map(loadProgramData)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  // This is the "blocks" tab's root screen (see blocks/_layout.js's Stack
  // comment) — it stays mounted on native as the coach drills into a
  // builder and back, so a mount-only effect would only ever load this
  // grid once per session. useFocusEffect refetches every time this screen
  // regains focus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Defaults to whichever program a ?program= deep link named (e.g. a
  // client detail page's "View current block ›" link), falling back to the
  // first program (Flagship, when present) — and re-picks if the currently
  // selected one ever disappears from the list rather than showing a blank
  // panel.
  useEffect(() => {
    if (!programData || programData.length === 0) return;
    if (!programData.some((d) => d.program.id === selectedProgramId)) {
      const fromParam = typeof params.program === "string" && programData.some((d) => d.program.id === params.program) ? params.program : null;
      setSelectedProgramId(fromParam ?? programData[0].program.id);
    }
  }, [programData, selectedProgramId, params.program]);

  const cancelCopy = useCallback(() => {
    setCopySource(null);
    setCopyTargets(new Set());
  }, []);

  // Switching program tabs (or reloading data) mid-copy would leave stale
  // workout ids referring to a grid that's no longer on screen — just drop
  // out of copy mode rather than trying to carry it across.
  useEffect(() => {
    cancelCopy();
  }, [selectedProgramId, cancelCopy]);

  const handleCreate = async ({ groupProgramId, startDate }) => {
    try {
      await createBlock({ groupProgramId, startDate, createdBy: profile.id });
      await load();
    } catch (err) {
      toastError("Failed to create block", err);
      throw err;
    }
  };

  const handleCreateProgram = async ({ name, blockLengthWeeks, sessionsPerWeek, sessionDays }) => {
    try {
      const program = await createGroupProgram({ name, blockLengthWeeks, sessionsPerWeek, sessionDays });
      await load();
      setSelectedProgramId(program.id);
    } catch (err) {
      toastError("Failed to create group program", err);
      throw err;
    }
  };

  const handleUpdateProgram = async ({ name, blockLengthWeeks, sessionsPerWeek, sessionDays }) => {
    try {
      await updateGroupProgram(selectedProgramId, {
        name,
        block_length_weeks: blockLengthWeeks,
        sessions_per_week: sessionsPerWeek,
        session_days: sessionDays,
      });
      await load();
    } catch (err) {
      toastError("Failed to update group program", err);
      throw err;
    }
  };

  // Starts right where THIS gap begins, not just "after the overall latest
  // block" — those differ if a block was deliberately scheduled further out,
  // leaving a nearer gap this button shouldn't run past.
  const handleStartGapBlock = async (program, gapRows, allBlocks) => {
    setStartingProgramId(program.id);
    try {
      const precedingBlock = allBlocks
        .filter((b) => b.block_end_date < gapRows[0].weekDate)
        .sort((a, b) => (a.block_end_date < b.block_end_date ? 1 : -1))[0];
      const startDate = precedingBlock ? addDays(precedingBlock.block_end_date, 1) : todayInBoise();
      await createBlock({ groupProgramId: program.id, startDate, createdBy: profile.id });
      await load();
    } catch (err) {
      toastError("Failed to start new block", err);
    } finally {
      setStartingProgramId(null);
    }
  };

  const startCopy = (workout, weekNum) => {
    setCopySource({ workoutId: workout.id, sessionNumber: workout.session_number, weekNum });
    setCopyTargets(new Set());
  };

  const toggleCopyTarget = (workoutId) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(workoutId)) next.delete(workoutId);
      else next.add(workoutId);
      return next;
    });
  };

  const handleConfirmCopy = async () => {
    const targets = [...copyTargets];
    if (targets.length === 0 || !selected) return;
    const nonEmptyCount = targets.filter((id) => (selected.exercisesByWorkout[id]?.length ?? 0) > 0).length;
    if (nonEmptyCount > 0) {
      const proceed = await confirmOverwrite(nonEmptyCount);
      if (!proceed) return;
    }
    setCopyBusy(true);
    try {
      await Promise.all(targets.map((id) => copyWorkoutContent(copySource.workoutId, id)));
      await load();
      cancelCopy();
    } catch (err) {
      toastError("Failed to copy session", err);
    } finally {
      setCopyBusy(false);
    }
  };

  const selected = programData?.find((d) => d.program.id === selectedProgramId);

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerStyle={{ paddingHorizontal: 40, paddingVertical: 32 }}>
        <View className="mb-5 flex-row items-center justify-between">
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 24 }}>Group Programs</Text>
          <View className="flex-row gap-2.5">
            <Pressable
              onPress={() => selectedProgramId && router.push(`/(coach)/blocks/history?program=${selectedProgramId}`)}
              disabled={!selectedProgramId}
              className="rounded-lg border px-4 py-2.5"
              style={{ borderColor: "#d9d4cd", opacity: selectedProgramId ? 1 : 0.5 }}
            >
              <Text className="text-stone-700" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                History
              </Text>
            </Pressable>
            {isWeb && (
              <Pressable
                onPress={() => setModalVisible(true)}
                className="rounded-lg px-4 py-2.5"
                style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16 }}
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                  + New Block
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {loadError ? (
          <><Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        ) : !programData ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {/* Which program's grid is showing below — was previously all
                programs laid out side by side, which stopped scaling once
                a coach could add specialty programs beyond Flagship/BWA. */}
            <View className="mb-[18px] flex-row flex-wrap items-center justify-between gap-2">
              <View className="flex-row flex-wrap items-center gap-2">
                {programData.map(({ program }) => {
                  const isActive = program.id === selectedProgramId;
                  return (
                    <Pressable
                      key={program.id}
                      onPress={() => setSelectedProgramId(program.id)}
                      className="rounded-xl px-5 py-3.5"
                      style={
                        isActive
                          ? { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 }
                          : { borderWidth: 1.5, borderColor: colors.primary }
                      }
                    >
                      <Text style={{ fontFamily: fonts.sansBold, color: isActive ? "white" : colors.primaryOnWhite, fontSize: 15 }}>
                        {DISPLAY_NAME[program.name] ?? program.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {isWeb && (
                  <Pressable
                    onPress={() => setNewProgramModalVisible(true)}
                    className="rounded-xl px-5 py-3.5"
                    style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: "#d9d4cd" }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: "#a8a29e", fontSize: 15 }}>+ New group type</Text>
                  </Pressable>
                )}
              </View>
              {selected && isWeb && (
                <Pressable onPress={() => setEditProgramModalVisible(true)} className="rounded-lg border px-4 py-3.5" style={{ borderColor: "#d9d4cd" }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 14 }}>
                    ⚙ {DISPLAY_NAME[selected.program.name] ?? selected.program.name} settings
                  </Text>
                </Pressable>
              )}
            </View>

            {selected && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row items-start gap-6">
                  <View style={{ width: ROW_LABEL_WIDTH }}>
                    <View style={{ height: HEADER_STACK_HEIGHT }} />
                    {WEEK_OFFSETS.map(({ offset, label }) => {
                      const weekStart = addDays(todayInBoise(), offset * 7);
                      const weekEnd = addDays(weekStart, 6);
                      const isCurrent = offset === 0;
                      return (
                        <View key={offset} style={{ minHeight: CELL_MIN_HEIGHT }} className="mb-3 justify-center">
                          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: isCurrent ? "#4d6142" : "#57534e" }}>
                            {label}
                          </Text>
                          <Text style={{ fontFamily: fonts.sans, fontSize: 10.5 }} className="mt-0.5 text-stone-400">
                            {formatDateMD(weekStart)} - {formatDateMD(weekEnd)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {(() => {
                    const { program, rows, exercisesByWorkout, allBlocks } = selected;
                    const groupWidth = program.sessions_per_week * SESSION_COL_WIDTH + (program.sessions_per_week - 1) * CELL_GAP;

                    return (
                      <View
                        style={{
                          width: groupWidth + PANEL_PADDING * 2,
                          backgroundColor: PANEL_BG[program.name] ?? "#f5f4f3",
                          borderRadius: 20,
                          padding: PANEL_PADDING,
                        }}
                      >
                        <View className="mb-2 items-center py-2">
                          <Text style={{ fontFamily: fonts.display, fontSize: 17 }} className="text-primary">
                            {DISPLAY_NAME[program.name] ?? program.name}
                          </Text>
                        </View>

                        <View className="mb-3 flex-row gap-3">
                          {Array.from({ length: program.sessions_per_week }, (_, i) => i + 1).map((n) => (
                            <View key={n} style={{ width: SESSION_COL_WIDTH }} className="items-center">
                              <Text className="text-xs uppercase text-stone-500" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                                Session {n}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {groupRows(rows).map((group, idx) =>
                          group.type === "covered" ? (
                            <View key={group.row.offset} className="mb-3 flex-row gap-3">
                              {Array.from({ length: program.sessions_per_week }, (_, i) => i + 1).map((sessionNum) => {
                                const workout = group.row.sessions.find((w) => w.session_number === sessionNum);
                                if (!workout) return <PlaceholderCell key={sessionNum} />;

                                const hasContent = (exercisesByWorkout[workout.id] ?? []).length > 0;
                                let copyRole;
                                let cellOnPress;
                                if (copySource) {
                                  if (workout.id === copySource.workoutId) {
                                    copyRole = "source";
                                    cellOnPress = cancelCopy;
                                  } else {
                                    copyRole = copyTargets.has(workout.id) ? "selected" : "eligible";
                                    cellOnPress = () => toggleCopyTarget(workout.id);
                                  }
                                } else {
                                  cellOnPress = () => router.push(`/(coach)/builder/${workout.id}`);
                                }

                                return (
                                  <SessionCell
                                    key={sessionNum}
                                    workout={workout}
                                    weekNum={group.row.weekNum}
                                    exerciseNames={exercisesByWorkout[workout.id] ?? []}
                                    onPress={cellOnPress}
                                    highlight={group.row.offset === 0}
                                    copyRole={copyRole}
                                    onStartCopy={isWeb && hasContent ? () => startCopy(workout, group.row.weekNum) : undefined}
                                  />
                                );
                              })}
                            </View>
                          ) : (
                            <GapSlot
                              key={`gap-${idx}`}
                              rowCount={group.rows.length}
                              groupWidth={groupWidth}
                              onStart={isWeb ? () => handleStartGapBlock(program, group.rows, allBlocks) : undefined}
                              starting={startingProgramId === program.id}
                            />
                          )
                        )}
                      </View>
                    );
                  })()}
                </View>
              </ScrollView>
            )}

            {copySource && (
              <View style={{ maxWidth: 900, marginTop: 20, position: Platform.OS === "web" ? "sticky" : "relative", bottom: 16 }}>
                <View
                  className="flex-row items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: "#44403c", shadowColor: "#44403c", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 28 }}
                >
                  <Text style={{ color: "white", fontFamily: fonts.sans, fontSize: 13 }}>
                    Copying{" "}
                    <Text style={{ fontFamily: fonts.sansBold }}>
                      Session {copySource.sessionNumber} · Wk {copySource.weekNum}
                    </Text>{" "}
                    — {copyTargets.size} tile{copyTargets.size === 1 ? "" : "s"} selected
                  </Text>
                  <View className="flex-row gap-2">
                    <Pressable onPress={cancelCopy} className="rounded-lg border px-3.5 py-2" style={{ borderColor: "#78716c" }}>
                      <Text style={{ color: "white", fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleConfirmCopy}
                      disabled={copyTargets.size === 0 || copyBusy}
                      className="rounded-lg px-3.5 py-2"
                      style={{ backgroundColor: colors.primary, opacity: copyTargets.size === 0 || copyBusy ? 0.5 : 1 }}
                    >
                      <Text style={{ color: "white", fontFamily: fonts.sansBold, fontSize: 12.5 }}>
                        {copyBusy ? "Copying…" : `Copy to ${copyTargets.size} tile${copyTargets.size === 1 ? "" : "s"}`}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        <NewBlockModal
          visible={modalVisible}
          programs={programData?.map((d) => d.program)}
          onClose={() => setModalVisible(false)}
          onSubmit={handleCreate}
        />
        <NewGroupProgramModal
          visible={newProgramModalVisible}
          onClose={() => setNewProgramModalVisible(false)}
          onSubmit={handleCreateProgram}
        />
        <NewGroupProgramModal
          visible={editProgramModalVisible}
          initialProgram={selected?.program}
          onClose={() => setEditProgramModalVisible(false)}
          onSubmit={handleUpdateProgram}
        />
      </ScrollView>
    </CoachShell>
  );
}
