import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { toastError } from "../../../lib/toast";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getBlock, listWorkoutsForBlock, deleteBlock } from "../../../lib/programming/blocks";
import { listWorkoutExercisesForWorkouts } from "../../../lib/programming/workouts";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMDY } from "../../../lib/formatDate";
import { confirmDelete } from "../../../lib/confirmDialog";
import { getBlockStatus } from "../../../lib/programming/blockStatus";
import { CoachShell } from "../../../components/CoachShell";
import { SessionCell, PlaceholderCell, SESSION_COL_WIDTH, CELL_GAP } from "../../../components/BlockGridCells";
import { fonts, colors } from "../../../lib/theme";

const DISPLAY_NAME = { "Better With Age": "BWA" };

// One block's full week x session grid — every week the block actually
// spans, not the main page's rolling 6-week-relative-to-today window. The
// main grid's own tiles open the builder directly now (see blocks/index.js's
// header comment) — this page is History-only, reached from a retired
// block's row click.
export default function BlockDetail() {
  const { blockId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const [block, setBlock] = useState(null);
  const [workouts, setWorkouts] = useState(null);
  const [exercisesByWorkout, setExercisesByWorkout] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
    try {
      const [blockRow, workoutRows] = await Promise.all([getBlock(blockId), listWorkoutsForBlock(blockId)]);
      setBlock(blockRow);
      setWorkouts(workoutRows);
      setExercisesByWorkout(await listWorkoutExercisesForWorkouts(workoutRows.map((w) => w.id)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [blockId]);

  // Stays mounted in the stack while the coach drills into a session's
  // builder and back — a mount-only effect would leave the grid's tiles
  // stale after an edit. useFocusEffect refetches on every refocus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleDelete = async () => {
    const proceed = await confirmDelete(
      `This permanently deletes this block and every session in it. This can't be undone. Continue?`
    );
    if (!proceed) return;
    setDeleting(true);
    try {
      await deleteBlock(blockId);
      router.canGoBack() ? router.back() : router.push(`/(coach)/blocks/history?program=${block.group_program_id}`);
    } catch (err) {
      toastError("Failed to delete block", err);
      setDeleting(false);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        </View>
      </CoachShell>
    );
  }

  if (!block || !workouts) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  const today = todayInBoise();
  const status = getBlockStatus(block, today);
  const isAdmin = profile?.role === "admin";
  const isFuture = block.block_start_date > today;
  const weeks = [...new Set(workouts.map((w) => w.week_number))].sort((a, b) => a - b);
  const sessions = [...new Set(workouts.map((w) => w.session_number))].sort((a, b) => a - b);
  const groupWidth = sessions.length * SESSION_COL_WIDTH + (sessions.length - 1) * CELL_GAP;

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32 }}>
        <Pressable
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.push(`/(coach)/blocks/history?program=${block.group_program_id}`)
          }
          style={{ marginBottom: 12 }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
        </Pressable>

        <View className="mb-6 flex-row items-start justify-between">
          <View>
            <Text className="mb-1 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
              {DISPLAY_NAME[block.group_programs?.name] ?? block.group_programs?.name ?? "Block"}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                {formatDateMDY(block.block_start_date)} → {formatDateMDY(block.block_end_date)}
              </Text>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: status.color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                · {status.label}
              </Text>
            </View>
          </View>
          {isAdmin && isFuture && Platform.OS === "web" ? (
            <Pressable
              onPress={handleDelete}
              disabled={deleting}
              className="rounded-lg border px-4 py-2.5"
              style={{ opacity: deleting ? 0.5 : 1, borderColor: "#b23a22" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#b23a22" }}>
                {deleting ? "Deleting…" : "Delete block"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: groupWidth }}>
            <View className="mb-3 flex-row gap-3">
              {sessions.map((n) => (
                <View key={n} style={{ width: SESSION_COL_WIDTH }} className="items-center">
                  <Text className="text-xs uppercase text-stone-500" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                    Session {n}
                  </Text>
                </View>
              ))}
            </View>

            {weeks.map((week) => (
              <View key={week} className="mb-4">
                <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                  Week {week}
                </Text>
                <View className="flex-row gap-3">
                  {sessions.map((sessionNum) => {
                    const workout = workouts.find((w) => w.week_number === week && w.session_number === sessionNum);
                    if (!workout) return <PlaceholderCell key={sessionNum} />;
                    return (
                      <SessionCell
                        key={sessionNum}
                        workout={workout}
                        weekNum={week}
                        exerciseNames={exercisesByWorkout[workout.id] ?? []}
                        onPress={() => router.push(`/(coach)/builder/${workout.id}`)}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </CoachShell>
  );
}
