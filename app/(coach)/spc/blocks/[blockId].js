import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import {
  getSpcBlock,
  listBlocksForSpcClient,
  listSpcWorkoutsForBlock,
  labelBlocks,
  deleteSpcBlock,
} from "../../../../lib/programming/spcBlocks";
import { getUser } from "../../../../lib/programming/clients";
import { listSpcWorkoutExercisesForWorkouts, copyLastBlockContent } from "../../../../lib/programming/spcWorkouts";
import { todayInBoise } from "../../../../lib/boiseDate";
import { formatDateMDY } from "../../../../lib/formatDate";
import { confirmDelete } from "../../../../lib/confirmDialog";
import { getBlockStatus } from "../../../../lib/programming/blockStatus";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { SessionCell, PlaceholderCell, SESSION_COL_WIDTH, CELL_GAP } from "../../../../components/BlockGridCells";

// One SPC block's full week x session grid — mirrors Group Programs'
// per-block detail page (app/(coach)/blocks/[blockId].js) now that SPC has
// one independent row per (week, session) too, instead of the old flat
// list of recurring sessions.
export default function SpcBlockDetail() {
  const { blockId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const [block, setBlock] = useState(null);
  const [blockLabel, setBlockLabel] = useState(null);
  const [member, setMember] = useState(null);
  const [workouts, setWorkouts] = useState(null);
  const [exercisesByWorkout, setExercisesByWorkout] = useState({});
  const [priorBlock, setPriorBlock] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const b = await getSpcBlock(blockId);
      setBlock(b);
      const [memberRow, workoutRows, siblingBlocks] = await Promise.all([
        getUser(b.spc_client_id),
        listSpcWorkoutsForBlock(blockId),
        listBlocksForSpcClient(b.spc_client_id),
      ]);
      setMember(memberRow);
      setWorkouts(workoutRows);
      setExercisesByWorkout(await listSpcWorkoutExercisesForWorkouts(workoutRows.map((w) => w.id)));
      setBlockLabel(labelBlocks(siblingBlocks).find((sb) => sb.id === b.id)?.label ?? "Block");
      const prior = siblingBlocks
        .filter((other) => other.id !== b.id && other.block_end_date < b.block_start_date)
        .sort((a, c) => (a.block_end_date < c.block_end_date ? 1 : -1))[0];
      setPriorBlock(prior ?? null);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [blockId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopyLastBlock = async () => {
    setCopying(true);
    try {
      await copyLastBlockContent(priorBlock.id, block.id);
      setCopied(true);
      Alert.alert("Copied", "Last block's warm-ups and exercises were copied in week-by-week — adjust anything that needs to change.");
      await load();
    } catch (err) {
      Alert.alert("Failed to copy last block", err.message ?? String(err));
    } finally {
      setCopying(false);
    }
  };

  const handleDelete = async () => {
    const proceed = await confirmDelete("This permanently deletes this block and every session in it. This can't be undone. Continue?");
    if (!proceed) return;
    setDeleting(true);
    try {
      await deleteSpcBlock(blockId);
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

  if (!block || !member || !workouts) {
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
        <Link
          href={`/(coach)/spc/${block.spc_client_id}`}
          style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}
        >
          ‹ Back to client
        </Link>

        <View className="mb-4 flex-row items-start justify-between">
          <View>
            <Text className="mb-1 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: colors.primary }}>
              {member.name} — {blockLabel ?? "SPC block"}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                {formatDateMDY(block.block_start_date)} → {formatDateMDY(block.block_end_date)} ({block.block_length_weeks} weeks)
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

        {priorBlock ? (
          <Pressable onPress={handleCopyLastBlock} disabled={copying || copied} className="mb-6 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: copied ? "#a8a29e" : "#8a5140" }}>
              {copying ? "Copying…" : copied ? "Copied last block" : "Copy last block"}
            </Text>
          </Pressable>
        ) : null}

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
                        onPress={() => router.push(`/(coach)/spc/builder/${workout.id}`)}
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
