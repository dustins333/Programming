import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../../../lib/auth/AuthProvider";
import { getClient } from "../../../../../../lib/nutrition/clients";
import { computeBaseline } from "../../../../../../lib/nutrition/onboarding";
import { supabase } from "../../../../../../lib/supabase/client";
import { BaselineSummary } from "../../../../../../components/nutrition/BaselineSummary";
import { PrepNotes } from "../../../../../../components/nutrition/PrepNotes";
import { ApproveTargetsForm } from "../../../../../../components/nutrition/ApproveTargetsForm";
import { CoachShell } from "../../../../../../components/CoachShell";
import { fonts, colors } from "../../../../../../lib/theme";

export default function OnboardingApprove() {
  const { userId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [client, setClient] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [clientRow, { data: logs }] = await Promise.all([
        getClient(userId),
        supabase.from("objective_tracking_logs").select("date, protein_g, carb_g, fat_g, fiber_g").eq("client_id", userId),
      ]);
      // Already graduated — nothing left to approve here.
      if (clientRow?.objective_tracking_approved_at) {
        router.replace(`/(coach)/nutrition/clients/${userId}`);
        return;
      }
      setClient(clientRow);
      setBaseline(computeBaseline(logs ?? []));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApproved = async () => {
    router.replace(`/(coach)/nutrition/clients/${userId}`);
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!client) {
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
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 700 }}>
        <Link href={`/(coach)/nutrition/clients/${userId}`} style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ {client.name}
        </Link>
        <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Approve & Set Targets
        </Text>

        <View className="mb-5 rounded-lg border border-stone-200 p-4">
          <Text className="mb-3" style={{ fontFamily: fonts.sansBold }}>
            Objective Tracking Baseline
          </Text>
          <BaselineSummary baseline={baseline} />
          <View className="mt-4">
            <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold }}>
              Prep notes (coach-only)
            </Text>
            <PrepNotes userId={userId} initialNotes={client.objective_tracking_prep_notes} />
          </View>
        </View>

        <ApproveTargetsForm userId={userId} coachId={profile.id} baseline={baseline} onApproved={handleApproved} />
      </ScrollView>
    </CoachShell>
  );
}
