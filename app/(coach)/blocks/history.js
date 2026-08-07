import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { toastError } from "../../../lib/toast";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listBlocks, listGroupPrograms, deleteBlock } from "../../../lib/programming/blocks";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMDY } from "../../../lib/formatDate";
import { confirmDelete } from "../../../lib/confirmDialog";
import { getBlockStatus } from "../../../lib/programming/blockStatus";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const DISPLAY_NAME = { "Better With Age": "BWA" };

// Scoped to whichever program the coach was looking at on the Group
// Programs page — a coach viewing Flagship's calendar and asking for
// history wants Flagship's blocks, not BWA's and LLYL's mixed in. Shows
// every block (past, current, and upcoming), not just retired ones —
// opening one lands on the same week x session grid the main page uses.
export default function BlockHistory() {
  const router = useRouter();
  const { profile } = useAuth();
  const { program: programId } = useLocalSearchParams();
  const [blocks, setBlocks] = useState(null);
  const [program, setProgram] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [rows, programs] = await Promise.all([listBlocks(), listGroupPrograms()]);
      const filtered = rows.filter((b) => b.group_program_id === programId).sort((a, b) => (a.block_start_date < b.block_start_date ? 1 : -1));
      setBlocks(filtered);
      setProgram(programs.find((p) => p.id === programId) ?? null);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [programId]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = profile?.role === "admin";

  const handleDelete = async (block) => {
    const proceed = await confirmDelete("This permanently deletes this block and every session in it. This can't be undone. Continue?");
    if (!proceed) return;
    setDeletingId(block.id);
    try {
      await deleteBlock(block.id);
      await load();
    } catch (err) {
      toastError("Failed to delete block", err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-8 py-8" style={{ maxWidth: 720 }}>
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
          Every block for this program — past, current, and upcoming.
        </Text>

        {loadError ? (
          <><Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        ) : !blocks ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FlatList
            data={blocks}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                No blocks yet.
              </Text>
            }
            renderItem={({ item }) => {
              const today = todayInBoise();
              const status = getBlockStatus(item, today);
              const isFuture = item.block_start_date > today;
              return (
                <View className="flex-row items-center justify-between border-b border-stone-100 py-3.5">
                  <Pressable onPress={() => router.push(`/(coach)/blocks/${item.id}`)} className="flex-1 flex-row items-center gap-2.5">
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14 }} className="text-stone-700">
                      {formatDateMDY(item.block_start_date)} → {formatDateMDY(item.block_end_date)}
                    </Text>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: status.color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      · {status.label}
                    </Text>
                  </Pressable>
                  <View className="flex-row items-center gap-3">
                    {isAdmin && isFuture ? (
                      <Pressable onPress={() => handleDelete(item)} disabled={deletingId === item.id} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#dc2626" }}>
                          {deletingId === item.id ? "Deleting…" : "Delete"}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => router.push(`/(coach)/blocks/${item.id}`)}>
                      <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                        View sessions ›
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </CoachShell>
  );
}
