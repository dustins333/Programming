import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Alert, Platform } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../../../lib/programming/clients";
import { getSpcClient, updateSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { listBlocksForSpcClient, createSpcBlock, labelBlocks } from "../../../lib/programming/spcBlocks";
import { getSetting } from "../../../lib/settings";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMDY } from "../../../lib/formatDate";
import { fonts, colors } from "../../../lib/theme";
import { STATUS_LABELS, STATUS_TONES } from "../../../lib/programming/spcStatus";
import { StatusBadge } from "../../../components/StatusBadge";
import { NewSpcBlockModal } from "../../../components/NewSpcBlockModal";
import { CoachShell } from "../../../components/CoachShell";

const isWeb = Platform.OS === "web";

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Card({ title, children, style }) {
  return (
    <View className="mb-5 rounded-2xl border border-stone-200 p-5" style={style}>
      <Text className="mb-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function CoachDropdown({ value, coaches, onChange }) {
  if (!isWeb) {
    return (
      <View className="flex-row flex-wrap gap-2">
        {coaches.map((coach) => (
          <Pressable
            key={coach.id}
            onPress={() => onChange(coach.id)}
            className={`rounded-full border px-3.5 py-2.5 ${value === coach.id ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={value === coach.id ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              {coach.name}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        fontFamily: fonts.sans,
        fontSize: 14,
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #d6d3d1",
        color: "#44403c",
        backgroundColor: "white",
        minWidth: 200,
      }}
    >
      <option value="">Unassigned</option>
      {coaches.map((coach) => (
        <option key={coach.id} value={coach.id}>
          {coach.name}
        </option>
      ))}
    </select>
  );
}

export default function SpcClientDetail() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
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

  const labeledBlocks = useMemo(() => labelBlocks(blocks), [blocks]);
  const currentBlocks = useMemo(() => {
    const today = todayInBoise();
    return labeledBlocks.filter((b) => b.block_end_date >= today).sort((a, b) => (a.block_start_date < b.block_start_date ? -1 : 1));
  }, [labeledBlocks]);

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
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 960 }}>
        <Link href="/(coach)/spc" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 20 }}>
          ‹ Back to SPC
        </Link>

        <View className="mb-6 flex-row items-center gap-4">
          <View className="items-center justify-center rounded-full" style={{ width: 56, height: 56, backgroundColor: "#fdf6f2" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 17, color: colors.primaryOnWhite }}>
              {initials(member.name)}
            </Text>
          </View>
          <View>
            <Text className="text-2xl text-primary" style={{ fontFamily: fonts.display }}>
              {member.name}
            </Text>
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
              SPC
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: isWeb ? "row" : "column", gap: 20 }} className="mb-2">
          <Card title="Status" style={{ flex: 1 }}>
            <View className="flex-row flex-wrap gap-2">
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
          </Card>

          <Card title="Assigned coach" style={{ flex: 1 }}>
            <CoachDropdown value={client.assigned_coach_id} coaches={coaches} onChange={handleCoachReassign} />
          </Card>
        </View>

        <View style={{ flexDirection: isWeb ? "row" : "column", gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Card title="Sessions per week">
              <View className="flex-row items-center gap-3">
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
            </Card>

            <Card title="Notes / Goals / Feedback">
              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                multiline
                numberOfLines={5}
                placeholder="Goals, injury notes, preferences, hold/pause reasons…"
                className="mb-3 min-h-28 rounded-lg border border-stone-300 px-4 py-3"
                style={{ fontFamily: fonts.sans }}
              />
              <Pressable
                onPress={handleSaveNotes}
                disabled={savingNotes}
                className="self-start rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50"
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  {savingNotes ? "Saving…" : "Save notes"}
                </Text>
              </Pressable>
            </Card>
          </View>

          <View style={{ flex: 1 }}>
            <Card title="Blocks">
              <View className="mb-4 flex-row items-center gap-2.5">
                <Pressable onPress={() => setModalVisible(true)} className="rounded-lg bg-primary px-4 py-2">
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                    + New block
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/(coach)/spc/history/${userId}`)}
                  className="rounded-lg border border-stone-300 px-4 py-2"
                >
                  <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold }}>
                    History
                  </Text>
                </Pressable>
              </View>

              {currentBlocks.length === 0 ? (
                <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
                  No current or upcoming blocks.
                </Text>
              ) : (
                currentBlocks.map((block) => (
                  <Link key={block.id} href={`/(coach)/spc/blocks/${block.id}`} asChild>
                    <Pressable className="mb-2 rounded-lg border border-stone-200 px-4 py-3">
                      <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
                        {block.label}
                      </Text>
                      <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                        {formatDateMDY(block.block_start_date)} → {formatDateMDY(block.block_end_date)} · {block.block_length_weeks} weeks
                      </Text>
                    </Pressable>
                  </Link>
                ))
              )}
            </Card>
          </View>
        </View>

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
