import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { getUser, getAssignment } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { getSpcClient } from "../../../lib/programming/spcClients";
import { getNutritionClient } from "../../../lib/nutrition/clients";
import { StatusBadge } from "../../../components/StatusBadge";
import { CoachShell } from "../../../components/CoachShell";
import { STATUS_LABELS, STATUS_TONES } from "../../../lib/programming/spcStatus";
import { fonts, colors } from "../../../lib/theme";

const NUTRITION_TONES = { active: "onTrack", paused: "paused" };

function Section({ title, children }) {
  return (
    <View className="mb-8">
      <Text
        className="mb-2 text-xs uppercase text-stone-400"
        style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function ClientProfile() {
  const { userId } = useLocalSearchParams();
  const [member, setMember] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [programs, setPrograms] = useState([]);
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
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const groupProgramName = assignment
    ? (programs.find((p) => p.id === assignment.group_program_id)?.name ?? "Unknown program")
    : null;

  const nutritionActive = nutritionClient?.status === "active";

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 640 }}>
        <Link href="/(coach)/clients" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to clients
        </Link>
        <Text className="text-2xl text-primary" style={{ fontFamily: fonts.display }}>
          {member.name}
        </Text>
        <Text className="mb-8 text-stone-500" style={{ fontFamily: fonts.sans }}>
          {member.email}
        </Text>

        <Section title="Group program">
          <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
            {groupProgramName ?? "Not enrolled"}
          </Text>
        </Section>

        <Section title="SPC">
          {spcClient ? (
            <View className="flex-row items-center gap-3">
              <StatusBadge tone={STATUS_TONES[spcClient.status]} label={STATUS_LABELS[spcClient.status]} />
              <Link href={`/(coach)/spc/${userId}`} style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                View SPC detail →
              </Link>
            </View>
          ) : (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
              Not enrolled
            </Text>
          )}
        </Section>

        <Section title="Nutrition">
          {nutritionClient ? (
            <View className="flex-row items-center gap-3">
              <StatusBadge
                tone={NUTRITION_TONES[nutritionClient.status] ?? "paused"}
                label={nutritionActive ? "Active" : "Paused"}
              />
              <Link href={`/(coach)/nutrition/clients/${userId}`} style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                View nutrition detail →
              </Link>
            </View>
          ) : (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
              Not enrolled
            </Text>
          )}
        </Section>
      </ScrollView>
    </CoachShell>
  );
}
