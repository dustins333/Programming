import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { getSpcBlock, listBlocksForSpcClient, listSpcWorkoutsForBlock } from "../../../../lib/programming/spcBlocks";
import { copyLastBlockContent } from "../../../../lib/programming/spcWorkouts";
import { fonts, colors } from "../../../../lib/theme";

export default function SpcBlockDetail() {
  const { blockId } = useLocalSearchParams();
  const [block, setBlock] = useState(null);
  const [workouts, setWorkouts] = useState(null);
  const [priorBlock, setPriorBlock] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const b = await getSpcBlock(blockId);
      setBlock(b);
      const [workoutRows, siblingBlocks] = await Promise.all([
        listSpcWorkoutsForBlock(blockId),
        listBlocksForSpcClient(b.spc_client_id),
      ]);
      setWorkouts(workoutRows);
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
      await copyLastBlockContent(priorBlock.id, block.id, block.block_length_weeks);
      setCopied(true);
      Alert.alert("Copied", "Last block's warm-ups and exercises were copied in — fill in this block's weekly numbers.");
    } catch (err) {
      Alert.alert("Failed to copy last block", err.message ?? String(err));
    } finally {
      setCopying(false);
    }
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong: {loadError}
        </Text>
      </View>
    );
  }

  if (!block || !workouts) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="mb-1 text-2xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
        SPC block
      </Text>
      <Text className="mb-6 text-neutral-500" style={{ fontFamily: fonts.sans }}>
        {block.block_start_date} → {block.block_end_date} ({block.block_length_weeks} weeks)
      </Text>

      <View className="mb-6 flex-row flex-wrap gap-3">
        <Link href={`/(coach)/spc/print/${block.id}`} className="text-accent" style={{ fontFamily: fonts.sansMedium }}>
          Export / Print
        </Link>
        {priorBlock ? (
          <Pressable onPress={handleCopyLastBlock} disabled={copying || copied}>
            <Text className={copied ? "text-neutral-400" : "text-accent"} style={{ fontFamily: fonts.sansMedium }}>
              {copying ? "Copying…" : copied ? "Copied last block" : "Copy last block"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text className="mb-2 text-sm text-neutral-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Sessions
      </Text>
      {workouts.map((w) => (
        <Link key={w.id} href={`/(coach)/spc/builder/${w.id}`} asChild>
          <Pressable className="mb-2 rounded-lg border border-neutral-200 px-4 py-3">
            <Text style={{ fontFamily: fonts.sansMedium }}>Session {w.session_number}</Text>
            <Text className={w.status === "published" ? "text-accent" : "text-neutral-400"} style={{ fontFamily: fonts.sans }}>
              {w.status}
            </Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
