import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { getNutritionRoster } from "../../../lib/nutrition/dashboard";
import { StatusBadge } from "../../../components/StatusBadge";
import { fonts, colors } from "../../../lib/theme";

// rosterStatus (see lib/nutrition/dashboard.js's deriveRosterStatus) -> the
// shared 5-tone badge system, plus display copy. "Check-in due" and
// "Awaiting review" are both check-in-adjacent but distinct states (hasn't
// submitted vs. submitted-and-needs-your-notes), so this dashboard keeps
// them as separate filters rather than collapsing to match the mockup's
// exact chip count.
const STATUS_META = {
  checkinDue: { label: "Check-in due", tone: "urgent" },
  needsTarget: { label: "Needs target", tone: "needsAction" },
  awaitingReview: { label: "Awaiting review", tone: "needsAction" },
  onTrack: { label: "On track", tone: "onTrack" },
  paused: { label: "Paused", tone: "paused" },
};
const FILTER_ORDER = ["checkinDue", "needsTarget", "awaitingReview", "onTrack", "paused"];

function metaLine(client) {
  if (client.rosterStatus === "paused") return "Paused";
  if (client.rosterStatus === "needsTarget") return "No target set yet";
  const logLine = client.loggedToday
    ? "Logged today"
    : client.missedDays > 0
      ? `Missed ${client.missedDays} day${client.missedDays === 1 ? "" : "s"} this week`
      : "Logged this week";
  const weightLine =
    client.weightDelta !== null
      ? ` · ${client.weightDelta > 0 ? "▲" : client.weightDelta < 0 ? "▼" : "±"} ${Math.abs(client.weightDelta).toFixed(1)} lb`
      : "";
  return `${logLine}${weightLine}`;
}

export default function NutritionDashboard() {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState(null);

  const load = useCallback(async () => {
    try {
      setRoster(await getNutritionRoster());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!roster) return [];
    if (!filter) return roster;
    return roster.filter((c) => c.rosterStatus === filter);
  }, [roster, filter]);

  const counts = useMemo(() => {
    if (!roster) return {};
    return FILTER_ORDER.reduce((acc, key) => {
      acc[key] = roster.filter((c) => c.rosterStatus === key).length;
      return acc;
    }, {});
  }, [roster]);

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading the nutrition roster: {loadError}
        </Text>
      </View>
    );
  }

  if (!roster) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Nutrition
        </Text>
        <Link href="/(coach)/nutrition/questions" style={{ fontFamily: fonts.sansMedium }} className="text-[#8a5140]">
          Check-in questions
        </Link>
      </View>
      <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
        {roster.length} client{roster.length === 1 ? "" : "s"}
      </Text>

      {roster.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          No nutrition clients yet — assign one from the Clients page.
        </Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 mb-5 px-6">
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setFilter(null)}
                className={`rounded-full border px-3.5 py-2.5 ${!filter ? "border-primary bg-primary" : "border-stone-300"}`}
              >
                <Text className={!filter ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                  All ({roster.length})
                </Text>
              </Pressable>
              {FILTER_ORDER.filter((key) => counts[key] > 0).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  className={`rounded-full border px-3.5 py-2.5 ${filter === key ? "border-primary bg-primary" : "border-stone-300"}`}
                >
                  <Text className={filter === key ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                    {STATUS_META[key].label} ({counts[key]})
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {filtered.map((c) => (
            <Link key={c.userId} href={`/(coach)/nutrition/clients/${c.userId}`} asChild>
              <Pressable className="mb-2 rounded-2xl border border-stone-200 px-4 py-3.5">
                <View className="flex-row items-center justify-between">
                  <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                    {c.name}
                  </Text>
                  <StatusBadge tone={STATUS_META[c.rosterStatus].tone} label={STATUS_META[c.rosterStatus].label} />
                </View>
                <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {metaLine(c)}
                </Text>
              </Pressable>
            </Link>
          ))}
        </>
      )}
    </ScrollView>
  );
}
