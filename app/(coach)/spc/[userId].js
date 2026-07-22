import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../../../lib/programming/clients";
import { getSpcClient, updateSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { listBlocksForSpcClient, createSpcBlock } from "../../../lib/programming/spcBlocks";
import { getSetting } from "../../../lib/settings";
import { fonts, colors } from "../../../lib/theme";
import { STATUS_LABELS } from "./index";
import { NewSpcBlockModal } from "./NewSpcBlockModal";
import { CoachShell } from "../../../components/CoachShell";

export default function SpcClientDetail() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const [member, setMember] = useState(null);
  const [client, setClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultLengthWeeks, setDefaultLengthWeeks] = useState(4);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [memberRow, clientRow, coachRows, blockRows, defaultLength] = await Promise.all([
        getUser(userId),
        getSpcClient(userId),
        listCoaches(),
        listBlocksForSpcClient(userId),
        getSetting("default_block_length_spc_weeks", 4),
      ]);
      setMember(memberRow);
      setClient(clientRow);
      setCoaches(coachRows);
      setBlocks(blockRows);
      setNotesDraft(clientRow?.notes_goals_feedback ?? "");
      setDefaultLengthWeeks(Number(defaultLength));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatus = async (status) => {
    try {
      await setSpcStatus(userId, status);
      await load();
    } catch (err) {
      Alert.alert("Failed to update status", err.message ?? String(err));
    }
  };

  const handleCoachReassign = async (coachId) => {
    try {
      await updateSpcClient(userId, { assigned_coach_id: coachId });
      await load();
    } catch (err) {
      Alert.alert("Failed to reassign coach", err.message ?? String(err));
    }
  };

  const handleSessionsChange = async (delta) => {
    const next = Math.max(1, (client?.sessions_per_week ?? 2) + delta);
    try {
      await updateSpcClient(userId, { sessions_per_week: next });
      await load();
    } catch (err) {
      Alert.alert("Failed to update sessions/week", err.message ?? String(err));
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateSpcClient(userId, { notes_goals_feedback: notesDraft });
      await load();
    } catch (err) {
      Alert.alert("Failed to save notes", err.message ?? String(err));
    } finally {
      setSavingNotes(false);
    }
  };

  const handleCreateBlock = async ({ startDate, lengthWeeks }) => {
    try {
      await createSpcBlock({
        spcClientId: userId,
        coachId: client?.assigned_coach_id ?? profile.id,
        startDate,
        lengthWeeks,
        sessionsPerWeek: client?.sessions_per_week ?? 2,
      });
      await load();
    } catch (err) {
      Alert.alert("Failed to create block", err.message ?? String(err));
      throw err;
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

  if (!member || !client) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 640 }}>
      <Text className="text-2xl text-primary" style={{ fontFamily: fonts.display }}>
        {member.name}
      </Text>
      <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
        SPC
      </Text>

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Status
      </Text>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <Pressable
            key={status}
            onPress={() => handleStatus(status)}
            className={`rounded-full border px-3.5 py-2.5 ${client.status === status ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={client.status === status ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Assigned coach
      </Text>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {coaches.map((coach) => (
          <Pressable
            key={coach.id}
            onPress={() => handleCoachReassign(coach.id)}
            className={`rounded-full border px-3.5 py-2.5 ${client.assigned_coach_id === coach.id ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text
              className={client.assigned_coach_id === coach.id ? "text-white" : "text-stone-700"}
              style={{ fontFamily: fonts.sans }}
            >
              {coach.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Sessions per week
      </Text>
      <View className="mb-6 flex-row items-center gap-3">
        <Pressable
          onPress={() => handleSessionsChange(-1)}
          className="rounded border border-stone-300 px-3 py-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Decrease sessions per week"
        >
          <Text>−</Text>
        </Pressable>
        <Text style={{ fontFamily: fonts.sansMedium }}>{client.sessions_per_week}</Text>
        <Pressable
          onPress={() => handleSessionsChange(1)}
          className="rounded border border-stone-300 px-3 py-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Increase sessions per week"
        >
          <Text>+</Text>
        </Pressable>
      </View>

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Notes / Goals / Feedback
      </Text>
      <TextInput
        value={notesDraft}
        onChangeText={setNotesDraft}
        multiline
        numberOfLines={4}
        placeholder="Goals, injury notes, preferences, hold/pause reasons…"
        className="mb-2 min-h-24 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      <Pressable
        onPress={handleSaveNotes}
        disabled={savingNotes}
        className="mb-8 self-start rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50"
      >
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {savingNotes ? "Saving…" : "Save notes"}
        </Text>
      </Pressable>

      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
          Blocks
        </Text>
        <Pressable onPress={() => setModalVisible(true)} className="rounded-lg bg-primary px-4 py-2">
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            + New block
          </Text>
        </Pressable>
      </View>
      {blocks.length === 0 ? (
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
          No blocks yet.
        </Text>
      ) : (
        blocks.map((block) => (
          <Link key={block.id} href={`/(coach)/spc/blocks/${block.id}`} asChild>
            <Pressable className="mb-2 rounded-lg border border-stone-200 px-4 py-3">
              <Text style={{ fontFamily: fonts.sansMedium }}>
                {block.block_start_date} → {block.block_end_date}
              </Text>
              <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                {block.block_length_weeks} weeks
              </Text>
            </Pressable>
          </Link>
        ))
      )}

      <NewSpcBlockModal
        visible={modalVisible}
        defaultLengthWeeks={defaultLengthWeeks}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreateBlock}
      />
    </ScrollView>
    </CoachShell>
  );
}
