import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import { getClient } from "../../../../../../lib/nutrition/clients";
import { computeBaseline, addTrackingDate, removeTrackingDate } from "../../../../../../lib/nutrition/onboarding";
import { supabase } from "../../../../../../lib/supabase/client";
import { BaselineSummary } from "../../../../../../components/nutrition/BaselineSummary";
import { PrepNotes } from "../../../../../../components/nutrition/PrepNotes";
import { DateCalendarPicker } from "../../../../../../components/nutrition/DateCalendarPicker";
import { CoachShell } from "../../../../../../components/CoachShell";
import { formatDateMDY } from "../../../../../../lib/formatDate";
import { fonts, colors } from "../../../../../../lib/theme";

export default function OnboardingTracking() {
  const { userId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState(null);
  const [dates, setDates] = useState(null);
  const [logsByDate, setLogsByDate] = useState({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [clientRow, { data: dateRows }, { data: logRows }] = await Promise.all([
        getClient(userId),
        supabase.from("objective_tracking_dates").select("id, date").eq("client_id", userId).order("date"),
        supabase.from("objective_tracking_logs").select("date, protein_g, carb_g, fat_g, fiber_g").eq("client_id", userId),
      ]);
      setClient(clientRow);
      setDates(dateRows ?? []);
      setLogsByDate(Object.fromEntries((logRows ?? []).map((l) => [l.date, l])));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Bulk-assign from the calendar picker — sequential inserts (typical batch
  // is a handful of dates, not worth a dedicated bulk-insert RPC).
  const handleAssignDates = async (newDates) => {
    for (const date of newDates) {
      await addTrackingDate(userId, date);
    }
    await load();
  };

  const handleRemoveDate = async (dateId) => {
    try {
      await removeTrackingDate(dateId);
      await load();
    } catch (err) {
      Alert.alert("Failed to remove date", err.message ?? String(err));
    }
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
          <View className="mb-3 flex-row items-center justify-between">
            <Text style={{ fontFamily: fonts.sansBold }}>Tracking dates</Text>
            <Pressable onPress={() => setPickerVisible(true)} className="rounded px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
              <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                + Assign dates
              </Text>
            </Pressable>
          </View>
          {dates.length === 0 ? (
            <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              No dates assigned yet.
            </Text>
          ) : (
            dates.map((d) => {
              const log = logsByDate[d.date];
              return (
                <View key={d.id} className="mb-1.5 flex-row items-center justify-between border-b border-stone-100 py-2">
                  <Text style={{ fontFamily: fonts.sansMedium }}>{formatDateMDY(d.date)}</Text>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                      {log ? `P${log.protein_g} C${log.carb_g} F${log.fat_g} Fiber${log.fiber_g}` : "Not logged yet"}
                    </Text>
                    <Pressable onPress={() => handleRemoveDate(d.id)} hitSlop={8}>
                      <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
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

      <DateCalendarPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        alreadyAssigned={new Set(dates.map((d) => d.date))}
        onConfirm={handleAssignDates}
      />
    </CoachShell>
  );
}
