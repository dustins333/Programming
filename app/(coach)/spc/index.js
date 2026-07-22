import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { getSpcRoster, checkAndAutoDraft } from "../../../lib/programming/spcDashboard";
import { fonts, colors } from "../../../lib/theme";

export const STATUS_LABELS = {
  printed_ready: "Printed & Ready ✅",
  needs_printed: "Needs Printed 🖨️",
  new_program_asap: "New Program ASAP 🚨",
  coming_up_next_week: "Coming Up Next Week 🔔",
  paused: "Paused ⏸️",
};
const STATUS_ORDER = ["new_program_asap", "needs_printed", "coming_up_next_week", "printed_ready", "paused"];

export default function SpcDashboard() {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filterCoach, setFilterCoach] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterDueSoon, setFilterDueSoon] = useState(false);

  const load = useCallback(async () => {
    try {
      await checkAndAutoDraft();
      setRoster(await getSpcRoster());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const coaches = useMemo(() => {
    if (!roster) return [];
    return [...new Set(roster.map((c) => c.coachName))].sort();
  }, [roster]);

  const filtered = useMemo(() => {
    if (!roster) return [];
    return roster.filter((c) => {
      if (filterCoach && c.coachName !== filterCoach) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterDueSoon && !c.dueSoon) return false;
      return true;
    });
  }, [roster, filterCoach, filterStatus, filterDueSoon]);

  const grouped = useMemo(() => {
    const byCoach = {};
    filtered.forEach((c) => {
      byCoach[c.coachName] = byCoach[c.coachName] ?? [];
      byCoach[c.coachName].push(c);
    });
    return Object.entries(byCoach).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading the SPC roster: {loadError}
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
      <Text className="mb-6 text-2xl text-primary" style={{ fontFamily: fonts.display }}>
        SPC
      </Text>

      {roster.length === 0 && (
        <Text className="text-neutral-500" style={{ fontFamily: fonts.sans }}>
          No SPC clients yet — assign one from the Clients page.
        </Text>
      )}

      {roster.length > 0 && (
        <View className="mb-6 flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={() => setFilterCoach(null)}
            className={`rounded-full border px-3 py-1.5 ${!filterCoach ? "border-primary bg-primary" : "border-neutral-300"}`}
          >
            <Text className={!filterCoach ? "text-white" : "text-neutral-700"} style={{ fontFamily: fonts.sans }}>
              All coaches
            </Text>
          </Pressable>
          {coaches.map((name) => (
            <Pressable
              key={name}
              onPress={() => setFilterCoach(name)}
              className={`rounded-full border px-3 py-1.5 ${filterCoach === name ? "border-primary bg-primary" : "border-neutral-300"}`}
            >
              <Text className={filterCoach === name ? "text-white" : "text-neutral-700"} style={{ fontFamily: fonts.sans }}>
                {name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setFilterStatus(null)}
            className={`rounded-full border px-3 py-1.5 ${!filterStatus ? "border-primary bg-primary" : "border-neutral-300"}`}
          >
            <Text className={!filterStatus ? "text-white" : "text-neutral-700"} style={{ fontFamily: fonts.sans }}>
              All statuses
            </Text>
          </Pressable>
          {STATUS_ORDER.map((status) => (
            <Pressable
              key={status}
              onPress={() => setFilterStatus(status)}
              className={`rounded-full border px-3 py-1.5 ${filterStatus === status ? "border-primary bg-primary" : "border-neutral-300"}`}
            >
              <Text className={filterStatus === status ? "text-white" : "text-neutral-700"} style={{ fontFamily: fonts.sans }}>
                {STATUS_LABELS[status]}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setFilterDueSoon((v) => !v)}
            className={`rounded-full border px-3 py-1.5 ${filterDueSoon ? "border-primary bg-primary" : "border-neutral-300"}`}
          >
            <Text className={filterDueSoon ? "text-white" : "text-neutral-700"} style={{ fontFamily: fonts.sans }}>
              Due soon
            </Text>
          </Pressable>
        </View>
      )}

      {grouped.map(([coachName, clients]) => (
        <View key={coachName} className="mb-6">
          <Text className="mb-2 text-sm text-neutral-500" style={{ fontFamily: fonts.sansSemiBold }}>
            {coachName} ({clients.length})
          </Text>
          {clients.map((c) => (
            <Link key={c.userId} href={`/(coach)/spc/${c.userId}`} asChild>
              <Pressable className="mb-2 rounded-lg border border-neutral-200 px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <Text style={{ fontFamily: fonts.sansMedium }}>{c.name}</Text>
                  <Text style={{ fontFamily: fonts.sans }} className="text-neutral-500">
                    {STATUS_LABELS[c.status]}
                  </Text>
                </View>
                <Text className="text-xs text-neutral-500" style={{ fontFamily: fonts.sans }}>
                  {c.sessionsPerWeek}x/week
                  {c.currentBlock
                    ? ` · block ends ${c.currentBlock.block_end_date}${c.dueSoon ? " · due soon" : ""}`
                    : " · no block yet"}
                </Text>
                {c.notesGoalsFeedback ? (
                  <Text numberOfLines={1} className="mt-1 text-xs text-neutral-400" style={{ fontFamily: fonts.sans }}>
                    {c.notesGoalsFeedback}
                  </Text>
                ) : null}
              </Pressable>
            </Link>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
