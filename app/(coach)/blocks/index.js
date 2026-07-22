import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert, Platform } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listBlocks, listGroupPrograms, createBlock } from "../../../lib/programming/blocks";
import { NewBlockModal } from "./NewBlockModal";
import { CoachShell } from "../../../components/CoachShell";

const isWeb = Platform.OS === "web";

export default function Blocks() {
  const { profile } = useAuth();
  const [blocks, setBlocks] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const load = useCallback(async () => {
    const [blockRows, programRows] = await Promise.all([listBlocks(), listGroupPrograms()]);
    setBlocks(blockRows);
    setPrograms(programRows);
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

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-6 py-8" style={isWeb ? { paddingHorizontal: 40, paddingVertical: 40 } : undefined}>
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
            Group Program Blocks
          </Text>
          <Pressable onPress={() => setModalVisible(true)} className="rounded-lg bg-primary px-4 py-2.5">
            <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              + New Block
            </Text>
          </Pressable>
        </View>

        {!blocks ? (
          <ActivityIndicator color="#a46a57" />
        ) : (
          <FlatList
            data={blocks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={isWeb ? { flexDirection: "row", flexWrap: "wrap", gap: 16 } : undefined}
            ListEmptyComponent={
              <Text className="text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                No blocks yet — create one to start building.
              </Text>
            }
            renderItem={({ item }) => (
              <Link href={`/(coach)/blocks/${item.id}`} asChild>
                <Pressable
                  className="mb-2 rounded-lg border border-stone-200 px-4 py-3"
                  style={isWeb ? { width: 280 } : undefined}
                >
                  <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.group_programs?.name}</Text>
                  <Text className="text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                    {item.block_start_date} → {item.block_end_date}
                  </Text>
                </Pressable>
              </Link>
            )}
          />
        )}

        <NewBlockModal visible={modalVisible} programs={programs} onClose={() => setModalVisible(false)} onSubmit={handleCreate} />
      </View>
    </CoachShell>
  );
}
