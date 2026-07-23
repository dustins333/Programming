import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { listBlocks } from "../../../lib/programming/blocks";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMDY } from "../../../lib/formatDate";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

export default function BlockHistory() {
  const router = useRouter();
  const [blocks, setBlocks] = useState(null);

  const load = useCallback(async () => {
    const rows = await listBlocks();
    const today = todayInBoise();
    setBlocks(rows.filter((b) => b.block_end_date < today));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-8 py-8" style={{ maxWidth: 640 }}>
        <Link href="/(coach)/blocks" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to Group Programs
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
          Block History
        </Text>
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Retired blocks — past their end date.
        </Text>

        {!blocks ? (
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
                  {item.group_programs?.name}
                </Text>
                <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  {formatDateMDY(item.block_start_date)} → {formatDateMDY(item.block_end_date)}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </CoachShell>
  );
}
