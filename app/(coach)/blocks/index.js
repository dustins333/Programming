import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import {
  listGroupPrograms,
  createBlock,
  listWorkoutsForBlock,
  getLatestBlock,
  startNextBlock,
} from "../../../lib/programming/blocks";
import { listWorkoutExercisesForWorkouts } from "../../../lib/programming/workouts";
import { getCurrentBlock } from "../../../lib/programming/memberPlan";
import { currentWeekNumber } from "../../../lib/programming/schedule";
import { todayInBoise } from "../../../lib/boiseDate";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { NewBlockModal } from "./NewBlockModal";
import { CoachShell } from "../../../components/CoachShell";
import { formatDateMDY } from "../../../lib/formatDate";
import { fonts, colors } from "../../../lib/theme";

const ROW_LABEL_WIDTH = 118;
const SESSION_COL_WIDTH = 168;
const CELL_MIN_HEIGHT = 122;
const CELL_GAP = 12; // matches className="gap-3"
const DISPLAY_NAME = { "Better With Age": "BWA" };

// Rows are relative to each program's OWN current week, not a shared
// calendar week — Flagship (4wk blocks) and BWA (6wk blocks) are almost
// never "on week 3" at the same time, since they start on different dates.
const WEEK_OFFSETS = [
  { offset: 0, label: "Current week" },
  { offset: 1, label: "Next week" },
  { offset: 2, label: "3 weeks out" },
  { offset: 3, label: "4 weeks out" },
  { offset: 4, label: "5 weeks out" },
  { offset: 5, label: "6 weeks out" },
];

// Total height of the 6-row grid — used to size the single "start a block"
// prompt that replaces it when a program has nothing active.
const GRID_HEIGHT = WEEK_OFFSETS.length * CELL_MIN_HEIGHT + (WEEK_OFFSETS.length - 1) * CELL_GAP;

async function loadProgramData(program) {
  const activeBlock = await getCurrentBlock(program.id);
  if (!activeBlock) {
    const latestBlock = await getLatestBlock(program.id);
    return { program, block: null, latestBlock, baseWeek: null, weeksByNumber: {}, exercisesByWorkout: {} };
  }
  const allWorkouts = await listWorkoutsForBlock(activeBlock.id);
  const baseWeek = currentWeekNumber(activeBlock.block_start_date, program.block_length_weeks);
  const weeksByNumber = {};
  for (const { offset } of WEEK_OFFSETS) {
    const weekNum = baseWeek + offset;
    if (weekNum > program.block_length_weeks) continue;
    weeksByNumber[weekNum] = allWorkouts
      .filter((w) => w.week_number === weekNum)
      .sort((a, b) => a.session_number - b.session_number);
  }
  const workoutIds = Object.values(weeksByNumber).flat().map((w) => w.id);
  const exercisesByWorkout = await listWorkoutExercisesForWorkouts(workoutIds);
  return { program, block: activeBlock, latestBlock: null, baseWeek, weeksByNumber, exercisesByWorkout };
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

function PlaceholderCell({ text }) {
  return (
    <View
      style={{ width: SESSION_COL_WIDTH, minHeight: CELL_MIN_HEIGHT }}
      className="items-center justify-center rounded-lg border border-dashed border-stone-200"
    >
      <Text className="px-2 text-center text-xs text-stone-300" style={{ fontFamily: fonts.sans }}>
        {text}
      </Text>
    </View>
  );
}

// Replaces the whole 6-row grid for a program that has no active block —
// one prompt spanning the full grid height instead of repeating "No active
// block" in every one of that program's session cells. Distinguishes
// "nothing scheduled" (offer to auto-start one) from "a future block is
// already queued, just hasn't started yet" (nothing to do but wait).
function EmptyProgramSlot({ groupWidth, latestBlock, onStart, starting }) {
  const today = todayInBoise();
  const alreadyScheduled = latestBlock && latestBlock.block_start_date > today;
  return (
    <View
      style={{ width: groupWidth, height: GRID_HEIGHT }}
      className="items-center justify-center rounded-xl border border-dashed border-stone-300 px-4"
    >
      {alreadyScheduled ? (
        <Text className="text-center text-stone-400" style={{ fontFamily: fonts.sans }}>
          Next block starts {formatDateMDY(latestBlock.block_start_date)}.
        </Text>
      ) : (
        <>
          <Text className="mb-3 text-center text-stone-400" style={{ fontFamily: fonts.sans }}>
            No active block right now.
          </Text>
          <Pressable onPress={onStart} disabled={starting} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {starting ? "Starting…" : "Start new block"}
            </Text>
          </Pressable>
        </>
      )}
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

  const handleStartNextBlock = async (program) => {
    setStartingProgramId(program.id);
    try {
      await startNextBlock(program.id, profile.id);
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
            <View>
              <View className="mb-2 flex-row items-center gap-6">
                <View style={{ width: ROW_LABEL_WIDTH }} />
                {programData.map(({ program }) => {
                  const groupWidth = program.sessions_per_week * SESSION_COL_WIDTH + (program.sessions_per_week - 1) * CELL_GAP;
                  return (
                    <View key={program.id} style={{ width: groupWidth }} className="items-center rounded-lg bg-stone-50 py-2">
                      <Text style={{ fontFamily: fonts.display, fontSize: 17 }} className="text-primary">
                        {DISPLAY_NAME[program.name] ?? program.name}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View className="mb-3 flex-row items-center gap-6">
                <View style={{ width: ROW_LABEL_WIDTH }} />
                {programData.map(({ program }) => (
                  <View key={program.id} className="flex-row gap-3">
                    {Array.from({ length: program.sessions_per_week }, (_, i) => i + 1).map((n) => (
                      <View key={n} style={{ width: SESSION_COL_WIDTH }} className="items-center">
                        <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                          Session {n}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>

              <View className="flex-row items-start gap-6">
                <View style={{ width: ROW_LABEL_WIDTH }}>
                  {WEEK_OFFSETS.map(({ offset, label }) => (
                    <View key={offset} style={{ minHeight: CELL_MIN_HEIGHT }} className="mb-3 justify-center">
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12 }} className="text-stone-600">
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>

                {programData.map(({ program, block, latestBlock, baseWeek, weeksByNumber, exercisesByWorkout }) => {
                  const groupWidth = program.sessions_per_week * SESSION_COL_WIDTH + (program.sessions_per_week - 1) * CELL_GAP;

                  if (!block) {
                    return (
                      <EmptyProgramSlot
                        key={program.id}
                        groupWidth={groupWidth}
                        latestBlock={latestBlock}
                        onStart={() => handleStartNextBlock(program)}
                        starting={startingProgramId === program.id}
                      />
                    );
                  }

                  return (
                    <View key={program.id}>
                      {WEEK_OFFSETS.map(({ offset }) => {
                        const weekNum = baseWeek + offset;
                        const withinBlock = weekNum <= program.block_length_weeks;
                        const sessions = withinBlock ? (weeksByNumber[weekNum] ?? []) : [];
                        return (
                          <View key={offset} className="mb-3 flex-row gap-3">
                            {Array.from({ length: program.sessions_per_week }, (_, i) => i + 1).map((sessionNum) => {
                              if (!withinBlock) return <PlaceholderCell key={sessionNum} text="Block ends before this week" />;
                              const workout = sessions.find((w) => w.session_number === sessionNum);
                              if (!workout) return <PlaceholderCell key={sessionNum} text="Not scheduled" />;
                              return (
                                <SessionCell
                                  key={sessionNum}
                                  workout={workout}
                                  weekNum={weekNum}
                                  exerciseNames={exercisesByWorkout[workout.id] ?? []}
                                  onPress={() => router.push(`/(coach)/builder/${workout.id}`)}
                                />
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
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
