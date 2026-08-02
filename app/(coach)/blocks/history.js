import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { listBlocks, listGroupPrograms } from "../../../lib/programming/blocks";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMDY } from "../../../lib/formatDate";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const DISPLAY_NAME = { "Better With Age": "BWA" };

// Scoped to whichever program the coach was looking at on the Group
// Programs page — a coach viewing Flagship's calendar and asking for
// history wants Flagship's retired blocks, not BWA's and LLYL's mixed in.
export default function BlockHistory() {
  const router = useRouter();
  const { program: programId } = useLocalSearchParams();
  const [blocks, setBlocks] = useState(null);
  const [program, setProgram] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [rows, programs] = await Promise.all([listBlocks(), listGroupPrograms()]);
      const today = todayInBoise();
      setBlocks(rows.filter((b) => b.group_program_id === programId && b.block_end_date < today));
      setProgram(programs.find((p) => p.id === programId) ?? null);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [programId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-8 py-8" style={{ maxWidth: 640 }}>
        <Link
          href={`/(coach)/blocks?program=${programId}`}
          style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}
        >
          ‹ Back to Group Programs
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
          {program ? `${DISPLAY_NAME[program.name] ?? program.name} History` : "Block History"}
        </Text>
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Retired blocks — past their end date.
        </Text>

        {loadError ? (
          <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        ) : !blocks ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FlatList
            data={blocks}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                No past blocks yet.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/(coach)/blocks/${item.id}`)}
                className="flex-row items-center justify-between border-b border-stone-100 py-3.5"
              >
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14 }} className="text-stone-700">
                  {formatDateMDY(item.block_start_date)} → {formatDateMDY(item.block_end_date)}
                </Text>
                <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  View sessions ›
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </CoachShell>
  );
}
