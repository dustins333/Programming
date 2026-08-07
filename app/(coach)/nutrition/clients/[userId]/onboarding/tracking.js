import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import { getClient, updateClient } from "../../../../../../lib/nutrition/clients";
import { computeBaseline, addTrackingDate, removeTrackingDate } from "../../../../../../lib/nutrition/onboarding";
import { listCoaches } from "../../../../../../lib/programming/clients";
import { supabase } from "../../../../../../lib/supabase/client";
import { BaselineSummary } from "../../../../../../components/nutrition/BaselineSummary";
import { PrepNotes } from "../../../../../../components/nutrition/PrepNotes";
import { DateCalendarPicker } from "../../../../../../components/nutrition/DateCalendarPicker";
import { CoachAssignmentField } from "../../../../../../components/nutrition/CoachAssignmentField";
import { CoachShell } from "../../../../../../components/CoachShell";
import { formatDateMDY } from "../../../../../../lib/formatDate";
import { fonts, colors } from "../../../../../../lib/theme";
import { toastError } from "../../../../../../lib/toast";

export default function OnboardingTracking() {
  const { userId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [dates, setDates] = useState(null);
  const [logsByDate, setLogsByDate] = useState({});
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [clientRow, coachRows, { data: dateRows }, { data: logRows }] = await Promise.all([
        getClient(userId),
        listCoaches(),
        supabase.from("objective_tracking_dates").select("id, date").eq("client_id", userId).order("date"),
        supabase.from("objective_tracking_logs").select("date, protein_g, carb_g, fat_g, fiber_g").eq("client_id", userId),
      ]);
      setClient(clientRow);
      setCoaches(coachRows);
      setDates(dateRows ?? []);
      setLogsByDate(Object.fromEntries((logRows ?? []).map((l) => [l.date, l])));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAssignDate = async (date) => {
    try {
      await addTrackingDate(userId, date);
      await load();
    } catch (err) {
      toastError("Failed to assign date", err);
    }
  };

  const handleUnassignDate = async (dateId) => {
    try {
      await removeTrackingDate(dateId);
      await load();
    } catch (err) {
      toastError("Failed to remove date", err);
    }
  };

  const handleCoachChange = async (coachId) => {
    try {
      await updateClient(userId, { coach_id: coachId });
      await load();
    } catch (err) {
      toastError("Failed to assign coach", err);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        </View>
      </CoachShell>
    );
  }

  if (!client || !dates) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  const allLogged = dates.length > 0 && dates.every((d) => logsByDate[d.date]);
  const baseline = allLogged ? computeBaseline(dates.map((d) => logsByDate[d.date])) : null;

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 700 }}>
        <Link href={`/(coach)/nutrition/clients/${userId}`} style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ {client.name}
        </Link>
        <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Objective Tracking
        </Text>

        <View className="mb-5 rounded-lg border border-stone-200 p-4">
          <CoachAssignmentField value={client.coach_id} coaches={coaches} onChange={handleCoachChange} />
        </View>

        <View className="mb-5 rounded-lg border border-stone-200 p-4">
          <Text className="mb-3" style={{ fontFamily: fonts.sansBold }}>
            Tracking dates
          </Text>
          <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Tap a date to assign it, tap again to remove it.
          </Text>

          <DateCalendarPicker assignedDates={dates} onAssign={handleAssignDate} onUnassign={handleUnassignDate} />

          {dates.length > 0 ? (
            <View className="mt-4">
              {dates.map((d) => {
                const log = logsByDate[d.date];
                return (
                  <View key={d.id} className="mb-1.5 flex-row items-center justify-between border-b border-stone-100 py-2">
                    <Text style={{ fontFamily: fonts.sansMedium }}>{formatDateMDY(d.date)}</Text>
                    <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                      {log ? `P${log.protein_g} C${log.carb_g} F${log.fat_g} Fiber${log.fiber_g}` : "Not logged yet"}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View className="rounded-lg border border-stone-200 p-4">
          <Text className="mb-3" style={{ fontFamily: fonts.sansBold }}>
            Baseline
          </Text>
          <BaselineSummary baseline={baseline} />
          <View className="mt-4">
            <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold }}>
              Prep notes (coach-only)
            </Text>
            <PrepNotes userId={userId} initialNotes={client.objective_tracking_prep_notes} />
          </View>
        </View>
      </ScrollView>
    </CoachShell>
  );
}
