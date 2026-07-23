import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch, Alert } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getUser, getAssignment, assignProgram } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { getCurrentBlock } from "../../../lib/programming/memberPlan";
import { getSpcClient, assignSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { getNutritionClient, assignNutritionClient, setNutritionStatus } from "../../../lib/nutrition/clients";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { StatusBadge } from "../../../components/StatusBadge";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { CoachShell } from "../../../components/CoachShell";
import { STATUS_LABELS, STATUS_TONES } from "../../../lib/programming/spcStatus";
import { fonts, colors } from "../../../lib/theme";

const NUTRITION_TONES = { active: "onTrack", paused: "paused" };

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function SettingsCard({ icon, title, children }) {
  return (
    <View className="mb-5 rounded-2xl border border-stone-200 p-5">
      <View className="mb-4 flex-row items-center gap-2.5">
        <Ionicons name={icon} size={17} color={colors.primaryOnWhite} />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }} className="text-stone-700">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function ViewLink({ label, onPress }) {
  return (
    <Pressable onPress={onPress} className="mt-3 flex-row items-center gap-1 self-start">
      <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>{label}</Text>
      <Ionicons name="arrow-forward" size={13} color={colors.primaryOnWhite} />
    </Pressable>
  );
}

export default function ClientProfile() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [currentBlock, setCurrentBlock] = useState(null);
  const [spcClient, setSpcClient] = useState(null);
  const [nutritionClient, setNutritionClient] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [memberRow, assignmentRow, programRows, spcRow, nutritionRow] = await Promise.all([
        getUser(userId),
        getAssignment(userId),
        listGroupPrograms(),
        getSpcClient(userId),
        getNutritionClient(userId),
      ]);
      setMember(memberRow);
      setAssignment(assignmentRow);
      setPrograms(programRows);
      setSpcClient(spcRow);
      setNutritionClient(nutritionRow);
      setCurrentBlock(assignmentRow?.group_program_id ? await getCurrentBlock(assignmentRow.group_program_id) : null);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const flagshipProgram = useMemo(() => programs.find((p) => p.name === "Flagship"), [programs]);
  const bwaProgram = useMemo(() => programs.find((p) => p.name === "Better With Age"), [programs]);

  const activeGroupKey = !assignment
    ? "none"
    : assignment.group_program_id === flagshipProgram?.id
      ? "flagship"
      : assignment.group_program_id === bwaProgram?.id
        ? "bwa"
        : "none";

  const handleGroupSelect = async (key) => {
    const groupProgramId = key === "flagship" ? flagshipProgram?.id : key === "bwa" ? bwaProgram?.id : null;
    try {
      await assignProgram(userId, groupProgramId ?? null);
      await load();
    } catch (err) {
      Alert.alert("Failed to update group program", err.message ?? String(err));
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

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 640 }}>
        <Link href="/(coach)/clients" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 20 }}>
          ‹ Back to clients
        </Link>

        <View className="mb-8 flex-row items-center gap-4">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 56, height: 56, backgroundColor: "#fdf6f2" }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 17, color: colors.primaryOnWhite }}>
              {initials(member.name)}
            </Text>
          </View>
          <View>
            <Text className="text-2xl text-primary" style={{ fontFamily: fonts.display }}>
              {member.name}
            </Text>
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
              {member.email}
              {member.phone ? ` · ${member.phone}` : ""}
            </Text>
          </View>
        </View>

        <SettingsCard icon="barbell-outline" title="Group program">
          <SegmentedControl
            segments={[
              { key: "none", label: "None" },
              { key: "flagship", label: "Flagship" },
              { key: "bwa", label: "BWA" },
            ]}
            activeKey={activeGroupKey}
            onSelect={handleGroupSelect}
          />
          {activeGroupKey !== "none" ? (
            currentBlock ? (
              <ViewLink label="View current block →" onPress={() => router.push(`/(coach)/blocks/${currentBlock.id}`)} />
            ) : (
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                No active block right now.
              </Text>
            )
          ) : null}
        </SettingsCard>

        <SettingsCard icon="clipboard-outline" title="SPC">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Switch
                value={spcActive}
                onValueChange={handleSpcToggle}
                trackColor={{ false: "#e7e5e4", true: colors.accent }}
                thumbColor="#ffffff"
              />
              <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                {spcClient ? "Enrolled" : "Not enrolled"}
              </Text>
            </View>
            {spcClient ? <StatusBadge tone={STATUS_TONES[spcClient.status]} label={STATUS_LABELS[spcClient.status]} /> : null}
          </View>
          {spcClient ? <ViewLink label="View SPC program →" onPress={() => router.push(`/(coach)/spc/${userId}`)} /> : null}
        </SettingsCard>

        <SettingsCard icon="restaurant-outline" title="Nutrition">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Switch
                value={nutritionActive}
                onValueChange={handleNutritionToggle}
                trackColor={{ false: "#e7e5e4", true: colors.accent }}
                thumbColor="#ffffff"
              />
              <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                {nutritionClient ? "Enrolled" : "Not enrolled"}
              </Text>
            </View>
            {nutritionClient ? (
              <StatusBadge tone={NUTRITION_TONES[nutritionClient.status] ?? "paused"} label={nutritionActive ? "Active" : "Paused"} />
            ) : null}
          </View>
          {nutritionClient ? (
            <ViewLink label="View nutrition dashboard →" onPress={() => router.push(`/(coach)/nutrition/clients/${userId}`)} />
          ) : null}
        </SettingsCard>
      </ScrollView>
    </CoachShell>
  );
}
