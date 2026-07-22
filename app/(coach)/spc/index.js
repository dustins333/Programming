import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Link } from "expo-router";
import { getSpcRoster, checkAndAutoDraft } from "../../../lib/programming/spcDashboard";
import { StatusBadge } from "../../../components/StatusBadge";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const isWeb = Platform.OS === "web";

export const STATUS_LABELS = {
  printed_ready: "Printed & Ready",
  needs_printed: "Needs Printed",
  new_program_asap: "New Program ASAP",
  coming_up_next_week: "Coming Up Next Week",
  paused: "Paused",
};
// Maps SPC's 5 statuses onto the shared 4-tone badge system (same tones the
// Nutrition dashboard uses) — coming_up_next_week and needs_printed are both
// "actionable soon, not urgent" so they share a tone.
const STATUS_TONES = {
  new_program_asap: "urgent",
  needs_printed: "needsAction",
  coming_up_next_week: "needsAction",
  printed_ready: "onTrack",
  paused: "paused",
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
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading the SPC roster: {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!roster) {
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
    <ScrollView className="flex-1 bg-white" contentContainerStyle={isWeb ? { paddingHorizontal: 40, paddingVertical: 40 } : { paddingHorizontal: 24, paddingVertical: 32 }}>
      <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        SPC
      </Text>

      {roster.length === 0 && (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          No SPC clients yet — assign one from the Clients page.
        </Text>
      )}

      {roster.length > 0 && (
        <View className="mb-6 flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={() => setFilterCoach(null)}
            className={`rounded-full border px-3.5 py-2.5 ${!filterCoach ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={!filterCoach ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              All coaches
            </Text>
          </Pressable>
          {coaches.map((name) => (
            <Pressable
              key={name}
              onPress={() => setFilterCoach(name)}
              className={`rounded-full border px-3.5 py-2.5 ${filterCoach === name ? "border-primary bg-primary" : "border-stone-300"}`}
            >
              <Text className={filterCoach === name ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                {name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setFilterStatus(null)}
            className={`rounded-full border px-3.5 py-2.5 ${!filterStatus ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={!filterStatus ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              All statuses
            </Text>
          </Pressable>
          {STATUS_ORDER.map((status) => (
            <Pressable
              key={status}
              onPress={() => setFilterStatus(status)}
              className={`rounded-full border px-3.5 py-2.5 ${filterStatus === status ? "border-primary bg-primary" : "border-stone-300"}`}
            >
              <Text className={filterStatus === status ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                {STATUS_LABELS[status]}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setFilterDueSoon((v) => !v)}
            className={`rounded-full border px-3.5 py-2.5 ${filterDueSoon ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={filterDueSoon ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              Due soon
            </Text>
          </Pressable>
        </View>
      )}

      {grouped.map(([coachName, clients]) => (
        <View key={coachName} className="mb-6">
          <Text
            className="mb-2 text-xs uppercase text-stone-400"
            style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}
          >
            {coachName} ({clients.length})
          </Text>
          <View style={isWeb ? { flexDirection: "row", flexWrap: "wrap", gap: 12 } : undefined}>
          {clients.map((c) => {
            const urgent = c.dueSoon || c.status === "new_program_asap";
            return (
              <Link key={c.userId} href={`/(coach)/spc/${c.userId}`} asChild>
                <Pressable
                  className="mb-2 rounded-xl px-4 py-3.5"
                  style={{
                    ...(urgent
                      ? { borderWidth: 1, borderColor: "#e9d3c6", borderLeftWidth: 3, borderLeftColor: "#c2543a" }
                      : { borderWidth: 1, borderColor: "#e7e5e4" }),
                    ...(isWeb ? { width: 340 } : {}),
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                      {c.name}
                    </Text>
                    <StatusBadge tone={STATUS_TONES[c.status]} label={STATUS_LABELS[c.status]} />
                  </View>
                  <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {c.sessionsPerWeek}x/week
                    {c.currentBlock
                      ? ` · block ends ${c.currentBlock.block_end_date}${c.dueSoon ? " · due soon" : ""}`
                      : " · no block yet"}
                  </Text>
                  {c.notesGoalsFeedback ? (
                    <Text numberOfLines={1} className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      {c.notesGoalsFeedback}
                    </Text>
                  ) : null}
                </Pressable>
              </Link>
            );
          })}
          </View>
        </View>
      ))}
    </ScrollView>
    </CoachShell>
  );
}
