import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, Platform } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { getUser } from "../../../../lib/programming/clients";
import { listBlocksForSpcClient, labelBlocks, deleteSpcBlock, listSpcWorkoutsForBlock } from "../../../../lib/programming/spcBlocks";
import { todayInBoise } from "../../../../lib/boiseDate";
import { formatDateMDY } from "../../../../lib/formatDate";
import { confirmDelete } from "../../../../lib/confirmDialog";
import { toastError } from "../../../../lib/toast";
import { getBlockStatus } from "../../../../lib/programming/blockStatus";
import { CoachShell } from "../../../../components/CoachShell";
import { PrintSessionPickerModal } from "../../../../components/PrintSessionPickerModal";
import { fonts, colors } from "../../../../lib/theme";

// Every block for this client (past, current, and upcoming), not just
// retired ones — opening one lands on the same week x session grid the
// client's main SPC page uses. Current/upcoming blocks also get a Print
// button (SPC only, per direct ask) that opens a session picker and
// generates a one-session-per-page printable view.
export default function SpcClientHistory() {
  const { userId } = useLocalSearchParams();
  const router = useRouter();
  const { profile } = useAuth();
  const [member, setMember] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [printBlockId, setPrintBlockId] = useState(null);
  const [printSessions, setPrintSessions] = useState([]);
  const [printLoading, setPrintLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [memberRow, blockRows] = await Promise.all([getUser(userId), listBlocksForSpcClient(userId)]);
      setMember(memberRow);
      setBlocks(labelBlocks(blockRows).sort((a, b) => (a.block_start_date < b.block_start_date ? 1 : -1)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = profile?.role === "admin";

  const handleDelete = async (block) => {
    const proceed = await confirmDelete("This permanently deletes this block and every session in it. This can't be undone. Continue?");
    if (!proceed) return;
    setDeletingId(block.id);
    try {
      await deleteSpcBlock(block.id);
      await load();
    } catch (err) {
      toastError("Failed to delete block", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePrintClick = async (blockId) => {
    setPrintBlockId(blockId);
    setPrintLoading(true);
    try {
      const workouts = await listSpcWorkoutsForBlock(blockId);
      const sessionNumbers = [...new Set(workouts.map((w) => w.session_number))].sort((a, b) => a - b);
      setPrintSessions(sessionNumbers);
    } catch (err) {
      toastError("Failed to load sessions", err);
      setPrintBlockId(null);
    } finally {
      setPrintLoading(false);
    }
  };

  const handlePickSession = (sessionNumber) => {
    const blockId = printBlockId;
    setPrintBlockId(null);
    router.push(`/(coach)/spc/print/${blockId}?session=${sessionNumber}`);
  };

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-8 py-8" style={{ maxWidth: 720 }}>
        <Link href={`/(coach)/spc/${userId}`} style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to {member?.name ?? "client"}
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
          Block History
        </Text>
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Every block for this client — past, current, and upcoming.
        </Text>

        {loadError ? (
          <View className="items-start">
            <Text className="mb-2 text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load history: {loadError}
            </Text>
            <Pressable onPress={load}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </Pressable>
          </View>
        ) : !blocks ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FlatList
            data={blocks}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                No past blocks yet — finished blocks land here once their end date passes.
              </Text>
            }
            renderItem={({ item }) => {
              const today = todayInBoise();
              const status = getBlockStatus(item, today);
              const isFuture = item.block_start_date > today;
              const canPrint = status.key !== "past" && Platform.OS === "web";
              return (
                <View className="flex-row items-center justify-between border-b border-stone-100 py-3.5">
                  <Pressable onPress={() => router.push(`/(coach)/spc/blocks/${item.id}`)} className="flex-1 flex-row items-center gap-2.5">
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14 }} className="text-stone-700">
                      {item.label}
                    </Text>
                    <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      {formatDateMDY(item.block_start_date)} → {formatDateMDY(item.block_end_date)}
                    </Text>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: status.color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      · {status.label}
                    </Text>
                  </Pressable>
                  <View className="flex-row items-center gap-3">
                    {isAdmin && isFuture ? (
                      <Pressable onPress={() => handleDelete(item)} disabled={deletingId === item.id} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#b23a22" }}>
                          {deletingId === item.id ? "Deleting…" : "Delete"}
                        </Text>
                      </Pressable>
                    ) : null}
                    {canPrint ? (
                      <Pressable onPress={() => handlePrintClick(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Print</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
        )}

        <PrintSessionPickerModal
          visible={!!printBlockId}
          sessionNumbers={printSessions}
          loading={printLoading}
          onClose={() => setPrintBlockId(null)}
          onPick={handlePickSession}
        />
      </View>
    </CoachShell>
  );
}
