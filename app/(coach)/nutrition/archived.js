import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { toastError } from "../../../lib/toast";
import { Link, useRouter } from "expo-router";
import { getNutritionRoster } from "../../../lib/nutrition/dashboard";
import { setClientStatus } from "../../../lib/nutrition/clients";
import { formatDateMDY } from "../../../lib/formatDate";
import { StatusBadge } from "../../../components/StatusBadge";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

// Where a client lands after the coach toggles nutrition off on their
// client-detail page — still pullable (view history, reactivate), just off
// the main roster a coach scans day to day. See app/(coach)/clients/[userId].js.
export default function ArchivedNutritionClients() {
  const router = useRouter();
  const [clients, setClients] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
    try {
      setClients((await getNutritionRoster()).filter((c) => c.status === "archived").sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReactivate = async (client) => {
    setReactivatingId(client.userId);
    try {
      await setClientStatus(client.userId, "active");
      await load();
    } catch (err) {
      toastError("Failed to reactivate", err);
    } finally {
      setReactivatingId(null);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading archived clients: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        </View>
      </CoachShell>
    );
  }

  if (!clients) {
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
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ maxWidth: 700 }}>
        <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Archived nutrition clients
        </Text>
        <Text className="mb-5 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Turned off from their client page — still here if you need to pull them back up.
        </Text>

        {clients.length === 0 ? (
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No archived clients.
          </Text>
        ) : (
          clients.map((c) => (
            <View key={c.userId} className="mb-2 flex-row items-center justify-between rounded-2xl border border-stone-200 px-4 py-3.5">
              <Pressable className="flex-1 pr-3" onPress={() => router.push(`/(coach)/nutrition/clients/${c.userId}`)}>
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                    {c.name}
                  </Text>
                  <StatusBadge tone="paused" label="Archived" />
                </View>
                <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {c.coachName} · started {formatDateMDY(c.startDate)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleReactivate(c)}
                disabled={reactivatingId === c.userId}
                className="rounded-full border border-stone-300 px-3.5 py-2"
              >
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5 }} className="text-stone-700">
                  {reactivatingId === c.userId ? "…" : "Reactivate"}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </CoachShell>
  );
}
