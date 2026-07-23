import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { listGroupPrograms, createBlock, listWorkoutsForBlock, listBlocksForProgram, addDays } from "../../../lib/programming/blocks";
import { listWorkoutExercisesForWorkouts } from "../../../lib/programming/workouts";
import { currentWeekNumber } from "../../../lib/programming/schedule";
import { todayInBoise } from "../../../lib/boiseDate";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { NewBlockModal } from "../../../components/NewBlockModal";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const ROW_LABEL_WIDTH = 118;
const SESSION_COL_WIDTH = 168;
const CELL_MIN_HEIGHT = 122;
const CELL_GAP = 12; // matches className="gap-3"
const PANEL_PADDING = 14;
// Approximate height of a panel's name-band + session-label header stack —
// the row-label column has no header of its own, so it gets a plain spacer
// this tall to keep "Current week" etc. lined up with the first grid row
// inside the panel next to it. A few px of slop here is invisible in
// practice (rows are 122px tall), so this doesn't need to be exact.
const HEADER_STACK_HEIGHT = 94;
const DISPLAY_NAME = { "Better With Age": "BWA" };
const PANEL_BG = { Flagship: "#fdf6f2", "Better With Age": "#eef1e7" };

// Rows are relative to TODAY (a real calendar date), not tied to one
// block's own week numbering — Flagship (4wk blocks) and BWA (6wk blocks)
// each display their own "Wk N" per row, and a row can be covered by
// whichever block (current or already-scheduled-next) actually spans that
// date, so a coach filling week 5-6 while week 1-4 is still current shows
// up correctly instead of assuming only one block ever applies.
const WEEK_OFFSETS = [
  { offset: 0, label: "Current week" },
  { offset: 1, label: "Next week" },
  { offset: 2, label: "3 weeks out" },
  { offset: 3, label: "4 weeks out" },
  { offset: 4, label: "5 weeks out" },
  { offset: 5, label: "6 weeks out" },
];

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

// Groups consecutive uncovered rows into single spans, so a program with
// no active block (or one that ends partway through the visible window)
// gets one "start a block" prompt sized to the actual gap, instead of
// repeating the same message in every empty session cell.
function groupRows(rows) {
  const groups = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].block) {
      groups.push({ type: "covered", row: rows[i] });
      i += 1;
    } else {
      let j = i;
      while (j < rows.length && !rows[j].block) j += 1;
      groups.push({ type: "gap", rows: rows.slice(i, j) });
      i = j;
    }
  }
  return groups;
}

function SessionCell({ workout, weekNum, exerciseNames, onPress }) {
  const shown = exerciseNames.slice(0, 5);
  const extra = exerciseNames.length - shown.length;
  return (
    <Pressable onPress={onPress} style={{ width: SESSION_COL_WIDTH, minHeight: CELL_MIN_HEIGHT }} className="rounded-lg border border-stone-200 p-2.5">
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11 }} className="text-stone-500">
          Wk {weekNum}
        </Text>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: workout.status === "published" ? "#7c9070" : "#d6d3d1",
          }}
        />
      </View>
      {shown.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11 }} className="text-stone-300">
          Empty
        </Text>
      ) : (
        shown.map((name, i) => (
          <Text key={i} numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 11.5 }} className="mb-0.5 text-stone-600">
            {name}
          </Text>
        ))
      )}
      {extra > 0 ? (
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11 }} className="text-stone-400">
          +{extra} more
        </Text>
      ) : null}
    </Pressable>
  );
}

function PlaceholderCell() {
  return (
    <View
      style={{ width: SESSION_COL_WIDTH, minHeight: CELL_MIN_HEIGHT }}
      className="items-center justify-center rounded-lg border border-dashed border-stone-200"
    >
      <Text className="px-2 text-center text-xs text-stone-300" style={{ fontFamily: fonts.sans }}>
        Not scheduled
      </Text>
    </View>
  );
}

// One prompt spanning exactly the rows that have nothing covering them —
// right where the gap actually starts, whether that's because the program
// has never had a block or because its current one ends partway through
// the visible window.
function GapSlot({ rowCount, groupWidth, onStart, starting }) {
  const height = rowCount * CELL_MIN_HEIGHT + (rowCount - 1) * CELL_GAP;
  return (
    <View
      style={{ width: groupWidth, height, marginBottom: CELL_GAP }}
      className="items-center justify-center rounded-xl border border-dashed border-stone-300 px-4"
    >
      <Text className="mb-3 text-center text-stone-400" style={{ fontFamily: fonts.sans }}>
        Nothing scheduled yet.
      </Text>
      <Pressable onPress={onStart} disabled={starting} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {starting ? "Starting…" : "Start new block"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function Blocks() {
  const { profile } = useAuth();
  const router = useRouter();
  const [programData, setProgramData] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [startingProgramId, setStartingProgramId] = useState(null);

  const load = useCallback(async () => {
    try {
      const programs = await listGroupPrograms();
      const ordered = [...programs].sort((a, b) => (a.name === "Flagship" ? -1 : b.name === "Flagship" ? 1 : 0));
      setProgramData(await Promise.all(ordered.map(loadProgramData)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async ({ groupProgramId, startDate }) => {
    try {
      await createBlock({ groupProgramId, startDate, createdBy: profile.id });
      await load();
    } catch (err) {
      Alert.alert("Failed to create block", err.message ?? String(err));
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
      Alert.alert("Failed to start new block", err.message ?? String(err));
    } finally {
      setStartingProgramId(null);
    }
  };

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-8 py-8">
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
            Group Programs
          </Text>
          <View className="flex-row gap-2.5">
            <Pressable onPress={() => router.push("/(coach)/blocks/history")} className="rounded-lg border border-stone-300 px-4 py-2.5">
              <Text className="text-stone-600" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                History
              </Text>
            </Pressable>
            <Pressable onPress={() => setModalVisible(true)} className="rounded-lg bg-primary px-4 py-2.5">
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                + New Block
              </Text>
            </Pressable>
          </View>
        </View>

        {loadError ? (
          <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        ) : !programData ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row items-start gap-6">
              <View style={{ width: ROW_LABEL_WIDTH }}>
                <View style={{ height: HEADER_STACK_HEIGHT }} />
                {WEEK_OFFSETS.map(({ offset, label }) => (
                  <View key={offset} style={{ minHeight: CELL_MIN_HEIGHT }} className="mb-3 justify-center">
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12 }} className="text-stone-600">
                      {label}
                    </Text>
                  </View>
                ))}
              </View>

              {programData.map(({ program, rows, exercisesByWorkout, allBlocks }) => {
                const groupWidth = program.sessions_per_week * SESSION_COL_WIDTH + (program.sessions_per_week - 1) * CELL_GAP;

                return (
                  <View
                    key={program.id}
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
                            return (
                              <SessionCell
                                key={sessionNum}
                                workout={workout}
                                weekNum={group.row.weekNum}
                                exerciseNames={exercisesByWorkout[workout.id] ?? []}
                                onPress={() => router.push(`/(coach)/builder/${workout.id}`)}
                              />
                            );
                          })}
                        </View>
                      ) : (
                        <GapSlot
                          key={`gap-${idx}`}
                          rowCount={group.rows.length}
                          groupWidth={groupWidth}
                          onStart={() => handleStartGapBlock(program, group.rows, allBlocks)}
                          starting={startingProgramId === program.id}
                        />
                      )
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        <NewBlockModal
          visible={modalVisible}
          programs={programData?.map((d) => d.program)}
          onClose={() => setModalVisible(false)}
          onSubmit={handleCreate}
        />
      </View>
    </CoachShell>
  );
}
