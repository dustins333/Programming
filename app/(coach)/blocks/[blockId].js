import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
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
// spans, not the main page's rolling 6-week-relative-to-today window. Reused
// both from the main grid's "Block N ›" link and from History's row click,
// so a block looks identical no matter how a coach got here.
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
    try {
      const [blockRow, workoutRows] = await Promise.all([getBlock(blockId), listWorkoutsForBlock(blockId)]);
      setBlock(blockRow);
      setWorkouts(workoutRows);
      setExercisesByWorkout(await listWorkoutExercisesForWorkouts(workoutRows.map((w) => w.id)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [blockId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    const proceed = await confirmDelete(
      `This permanently deletes this block and every session in it. This can't be undone. Continue?`
    );
    if (!proceed) return;
    setDeleting(true);
    try {
      await deleteBlock(blockId);
      router.back();
    } catch (err) {
      Alert.alert("Failed to delete block", err.message ?? String(err));
      setDeleting(false);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong: {loadError}
          </Text>
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
        <Link href="/(coach)/blocks" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to Group Programs
        </Link>

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
          {isAdmin && isFuture ? (
            <Pressable
              onPress={handleDelete}
              disabled={deleting}
              className="rounded-lg border px-4 py-2.5 disabled:opacity-50"
              style={{ borderColor: "#dc2626" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#dc2626" }}>
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
