import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch, Alert, Platform } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getUser, listAssignmentsForUser, addGroupMembership, removeGroupMembership, setMembershipSessionsPerWeek } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { getCurrentBlock } from "../../../lib/programming/memberPlan";
import { currentWeekNumber } from "../../../lib/programming/schedule";
import { getMissedSessionFlagsByUser } from "../../../lib/programming/flags";
import { getSpcClient, assignSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { getNutritionClient, assignNutritionClient, setNutritionStatus } from "../../../lib/nutrition/clients";
import { listTemplates } from "../../../lib/programming/templates";
import { listOneOffWorkoutsForUser, createOneOffFromTemplate, deleteOneOffWorkout } from "../../../lib/programming/oneOffWorkouts";
import { listCompletedOneOffWorkoutIds } from "../../../lib/programming/sessionCompletions";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { StatusBadge } from "../../../components/StatusBadge";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { AssignOneOffModal } from "../../../components/AssignOneOffModal";
import { CoachShell } from "../../../components/CoachShell";
import { STATUS_LABELS, STATUS_TONES } from "../../../lib/programming/spcStatus";
import { todayInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";

const NUTRITION_TONES = { active: "onTrack", paused: "paused" };
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };
const isWeb = Platform.OS === "web";

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Card({ children, style }) {
  return (
    <View className="mb-4 rounded-2xl border bg-white p-5" style={[{ borderColor: "#ece7e1" }, CARD_SHADOW, style]}>
      {children}
    </View>
  );
}

function SettingsCard({ icon, title, children, headerRight }) {
  return (
    <Card>
      <View className="mb-3.5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5">
          <Ionicons name={icon} size={16} color="#44403c" />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14 }} className="text-stone-700">
            {title}
          </Text>
        </View>
        {headerRight}
      </View>
      {children}
    </Card>
  );
}

function ViewLink({ label, onPress }) {
  return (
    <Pressable onPress={onPress} className="mt-3 flex-row items-center gap-1 self-start">
      <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function ProgressBar({ fraction }) {
  return (
    <View className="overflow-hidden rounded-full" style={{ height: 6, backgroundColor: "#f1efed" }}>
      <View style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", backgroundColor: "#4d6142", borderRadius: 999 }} />
    </View>
  );
}

// Block-progress side + missed-session flags side, side by side on web,
// stacked on native (same isWeb-flag responsive pattern spc/[userId].js
// already uses). Injury/note flags are intentionally not built yet — there
// is no way in this app to tag a coach note as injury-related, so shipping
// that half of the design's example would mean fabricating data; only the
// "missed session" flag (computed from real completions) is real here.
function SnapshotPanel({ blockRows, flags }) {
  if (blockRows.length === 0 && flags.length === 0) return null;
  return (
    <Card>
      <View style={{ flexDirection: isWeb ? "row" : "column", flexWrap: "wrap", gap: isWeb ? 32 : 20 }}>
        {blockRows.length > 0 && (
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text className="mb-2.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
              Current block
            </Text>
            {blockRows.map((row, idx) => (
              <View key={row.programId} style={idx > 0 ? { marginTop: 14 } : undefined}>
                <Text className="mb-2 text-stone-700" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
                  {row.programName} · Week {row.weekNum} of {row.totalWeeks}
                </Text>
                <ProgressBar fraction={row.weekNum / row.totalWeeks} />
              </View>
            ))}
          </View>
        )}
        {flags.length > 0 && (
          <View
            style={
              isWeb && blockRows.length > 0
                ? { flex: 1.4, minWidth: 280, borderLeftWidth: 1, borderLeftColor: "#ece7e1", paddingLeft: 32 }
                : { flex: 1.4, minWidth: 280 }
            }
          >
            <Text className="mb-2.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
              Flags
            </Text>
            {flags.map((flag, idx) => (
              <View key={idx} className="mb-1.5 flex-row items-center gap-2">
                <View className="shrink-0 rounded-full px-2.5 py-[3px]" style={{ backgroundColor: "#fdece5" }}>
                  <Text style={{ fontFamily: fonts.sansBold, color: "#b23a22", fontSize: 10.5 }}>Missed session</Text>
                </View>
                <Text className="flex-1 text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                  No log for Session {flag.sessionNumber} ({flag.programName}) · this week
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

export default function ClientProfile() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [currentBlocksByProgramId, setCurrentBlocksByProgramId] = useState({});
  const [missedFlags, setMissedFlags] = useState([]);
  const [spcClient, setSpcClient] = useState(null);
  const [nutritionClient, setNutritionClient] = useState(null);
  const [oneOffs, setOneOffs] = useState([]);
  const [completedOneOffIds, setCompletedOneOffIds] = useState(new Set());
  const [templates, setTemplates] = useState([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [memberRow, assignmentRows, programRows, spcRow, nutritionRow, oneOffRows, completedIds, templateRows] = await Promise.all([
        getUser(userId),
        listAssignmentsForUser(userId),
        listGroupPrograms(),
        getSpcClient(userId),
        getNutritionClient(userId),
        listOneOffWorkoutsForUser(userId),
        listCompletedOneOffWorkoutIds(userId),
        listTemplates(),
      ]);
      setMember(memberRow);
      setAssignments(assignmentRows);
      setPrograms(programRows);
      setSpcClient(spcRow);
      setNutritionClient(nutritionRow);
      setOneOffs(oneOffRows);
      setCompletedOneOffIds(completedIds);
      setTemplates(templateRows);

      const blocks = await Promise.all(assignmentRows.map((a) => getCurrentBlock(a.group_program_id)));
      const blocksByProgramId = {};
      assignmentRows.forEach((a, i) => {
        blocksByProgramId[a.group_program_id] = blocks[i];
      });
      setCurrentBlocksByProgramId(blocksByProgramId);

      try {
        const flagsByUser = await getMissedSessionFlagsByUser();
        setMissedFlags(flagsByUser.get(userId) ?? []);
      } catch {
        setMissedFlags([]);
      }
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // A client can hold several memberships at once now (e.g. Flagship plus
  // a specialty program), so this toggles one specific program's
  // membership on/off rather than picking a single mutually-exclusive
  // program.
  const handleToggleMembership = async (groupProgramId, enrolled) => {
    try {
      if (enrolled) {
        await addGroupMembership(userId, groupProgramId);
      } else {
        await removeGroupMembership(userId, groupProgramId);
      }
      await load();
    } catch (err) {
      Alert.alert("Failed to update group program", err.message ?? String(err));
    }
  };

  const handleFrequencySelect = async (groupProgramId, sessionsPerWeek) => {
    try {
      await setMembershipSessionsPerWeek(userId, groupProgramId, sessionsPerWeek);
      await load();
    } catch (err) {
      Alert.alert("Failed to update session frequency", err.message ?? String(err));
    }
  };

  const spcActive = Boolean(spcClient && spcClient.status !== "paused");
  const handleSpcToggle = async (enrolled) => {
    try {
      if (!enrolled) {
        await setSpcStatus(userId, "paused");
      } else if (spcClient) {
        await setSpcStatus(userId, "needs_printed");
      } else {
        await assignSpcClient(userId, profile.id);
      }
      await load();
    } catch (err) {
      Alert.alert("Failed to update SPC status", err.message ?? String(err));
    }
  };

  const nutritionActive = nutritionClient?.status === "active";
  const handleNutritionToggle = async (enrolled) => {
    try {
      if (!enrolled) {
        await setNutritionStatus(userId, "paused");
      } else if (nutritionClient) {
        await setNutritionStatus(userId, "active");
      } else {
        await assignNutritionClient(userId, profile.id);
      }
      await load();
    } catch (err) {
      Alert.alert("Failed to update nutrition status", err.message ?? String(err));
    }
  };

  const handleAssignOneOff = async (template) => {
    try {
      await createOneOffFromTemplate({ userId, templateId: template.id, templateName: template.name, assignedBy: profile.id });
      await load();
    } catch (err) {
      Alert.alert("Failed to assign one-off workout", err.message ?? String(err));
    }
  };

  const handleDeleteOneOff = async (oneOff) => {
    try {
      await deleteOneOffWorkout(oneOff.id);
      await load();
    } catch (err) {
      Alert.alert("Failed to remove one-off workout", err.message ?? String(err));
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

  if (!member) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  const today = todayInBoise();
  const blockRows = assignments
    .map((a) => {
      const block = currentBlocksByProgramId[a.group_program_id];
      if (!block) return null;
      const totalWeeks = a.group_programs?.block_length_weeks ?? 1;
      return {
        programId: a.group_program_id,
        programName: a.group_programs?.name ?? "Group program",
        weekNum: currentWeekNumber(block.block_start_date, totalWeeks, today),
        totalWeeks,
      };
    })
    .filter(Boolean);

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 900 }}>
        <Link href="/(coach)/clients" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, marginBottom: 18, fontSize: 13 }}>
          ‹ Back to clients
        </Link>

        <View className="mb-6 flex-row items-center gap-3.5">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 52, height: 52, backgroundColor: "#fdf6f2" }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: colors.primaryOnWhite }}>
              {initials(member.name)}
            </Text>
          </View>
          <View>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 22 }}>
              {member.name}
            </Text>
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
              {member.email}
              {member.phone ? ` · ${member.phone}` : ""}
            </Text>
          </View>
        </View>

        <SnapshotPanel blockRows={blockRows} flags={missedFlags} />

        <SettingsCard icon="barbell-outline" title="Group programs">
          {programs.length === 0 ? (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
              No group programs exist yet — create one from the Group Programs tab.
            </Text>
          ) : (
            programs.map((program) => {
              const membership = assignments.find((a) => a.group_program_id === program.id);
              const enrolled = !!membership;
              const block = currentBlocksByProgramId[program.id];
              return (
                <View key={program.id} className="mb-2.5 overflow-hidden rounded-xl border" style={{ borderColor: enrolled ? "#dbe8cf" : "#ece7e1" }}>
                  <View
                    className="flex-row items-center justify-between px-3.5 py-3"
                    style={enrolled ? { borderBottomWidth: 1, borderBottomColor: "#f0ede8" } : undefined}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <Switch
                        value={enrolled}
                        onValueChange={(v) => handleToggleMembership(program.id, v)}
                        trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                        thumbColor="#ffffff"
                      />
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                        {program.name}
                      </Text>
                    </View>
                    {enrolled ? (
                      block ? (
                        <Pressable onPress={() => router.push(`/(coach)/blocks?program=${program.id}`)}>
                          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
                            View current block ›
                          </Text>
                        </Pressable>
                      ) : (
                        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                          No active block
                        </Text>
                      )
                    ) : null}
                  </View>
                  {enrolled ? (
                    <View className="px-3.5 py-3" style={{ backgroundColor: "#faf8f6" }}>
                      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
                        Frequency
                      </Text>
                      <View style={{ maxWidth: 220 }}>
                        <SegmentedControl
                          segments={[
                            { key: "1", label: "1x" },
                            { key: "2", label: "2x" },
                            { key: "3", label: "3x" },
                          ]}
                          activeKey={String(membership.sessions_per_week ?? 3)}
                          onSelect={(key) => handleFrequencySelect(program.id, Number(key))}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </SettingsCard>

        <View style={{ flexDirection: isWeb ? "row" : "column", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <SettingsCard
              icon="clipboard-outline"
              title="SPC"
              headerRight={spcClient ? <StatusBadge tone={STATUS_TONES[spcClient.status]} label={STATUS_LABELS[spcClient.status]} /> : null}
            >
              <View className="flex-row items-center gap-3">
                <Switch
                  value={spcActive}
                  onValueChange={handleSpcToggle}
                  trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                  thumbColor="#ffffff"
                />
                <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                  {spcClient ? "Enrolled" : "Not enrolled"}
                </Text>
              </View>
              {spcClient ? <ViewLink label="View SPC program ›" onPress={() => router.push(`/(coach)/spc/${userId}`)} /> : null}
            </SettingsCard>
          </View>

          <View style={{ flex: 1 }}>
            <SettingsCard
              icon="restaurant-outline"
              title="Nutrition"
              headerRight={
                nutritionClient ? (
                  <StatusBadge tone={NUTRITION_TONES[nutritionClient.status] ?? "paused"} label={nutritionActive ? "Active" : "Paused"} />
                ) : null
              }
            >
              <View className="flex-row items-center gap-3">
                <Switch
                  value={nutritionActive}
                  onValueChange={handleNutritionToggle}
                  trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                  thumbColor="#ffffff"
                />
                <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                  {nutritionClient ? "Enrolled" : "Not enrolled"}
                </Text>
              </View>
              {nutritionClient ? (
                <ViewLink label="View nutrition dashboard ›" onPress={() => router.push(`/(coach)/nutrition/clients/${userId}`)} />
              ) : null}
            </SettingsCard>
          </View>
        </View>

        <SettingsCard icon="add-circle-outline" title="One-off workouts">
          {oneOffs.length === 0 ? (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
              None assigned — away workouts or trial sessions show up here and in the client's My Fitness tab.
            </Text>
          ) : (
            oneOffs.map((oneOff) => {
              const completed = completedOneOffIds.has(oneOff.id);
              return (
                <View key={oneOff.id} className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3">
                  <View className="flex-1">
                    <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                      {oneOff.title}
                    </Text>
                    <Text className="text-xs" style={{ fontFamily: fonts.sans, color: completed ? "#4d6142" : "#a8a29e" }}>
                      {completed ? "✓ Completed" : oneOff.status === "published" ? "Not yet completed" : "Draft"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteOneOff(oneOff)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={`Remove one-off workout ${oneOff.title}`}
                  >
                    <Text className="text-stone-400">✕</Text>
                  </Pressable>
                </View>
              );
            })
          )}
          <Pressable
            onPress={() => setAssignModalVisible(true)}
            className="mt-3 self-start rounded-lg px-4 py-2.5"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              + Assign one-off
            </Text>
          </Pressable>
        </SettingsCard>

        <AssignOneOffModal
          visible={assignModalVisible}
          templates={templates}
          onClose={() => setAssignModalVisible(false)}
          onPick={handleAssignOneOff}
        />
      </ScrollView>
    </CoachShell>
  );
}
