import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { getSpcRoster, checkAndAutoDraft } from "../../../lib/programming/spcDashboard";
import { StatusBadge } from "../../../components/StatusBadge";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";
import { STATUS_LABELS, STATUS_TONES, STATUS_ORDER } from "../../../lib/programming/spcStatus";
import { formatDateMDY } from "../../../lib/formatDate";

export default function SpcDashboard() {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filterCoach, setFilterCoach] = useState(null);
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
      if (filterDueSoon && !c.dueSoon) return false;
      return true;
    });
  }, [roster, filterCoach, filterDueSoon]);

  // Status is the primary grouping (coach is just a filter chip row above) —
  // a coach scanning the roster cares more about "who needs a program
  // printed today" than "which of my clients are which."
  const grouped = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      clients: filtered.filter((c) => c.status === status),
    })).filter((g) => g.clients.length > 0);
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
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32 }}>
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            SPC
          </Text>
          <Link href="/(coach)/spc/templates" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
            Templates →
          </Link>
        </View>

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
              onPress={() => setFilterDueSoon((v) => !v)}
              className={`rounded-full border px-3.5 py-2.5 ${filterDueSoon ? "border-primary bg-primary" : "border-stone-300"}`}
            >
              <Text className={filterDueSoon ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                Due soon
              </Text>
            </Pressable>
          </View>
        )}

        {grouped.map(({ status, clients }) => (
          <View key={status} className="mb-6">
            <View className="mb-2 flex-row items-center gap-2">
              <StatusBadge tone={STATUS_TONES[status]} label={STATUS_LABELS[status]} />
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                {clients.length}
              </Text>
            </View>
            {clients.map((c) => {
              const urgent = c.dueSoon || c.status === "new_program_asap";
              return (
                <Link key={c.userId} href={`/(coach)/spc/${c.userId}`} asChild>
                  <Pressable
                    className="mb-2 rounded-xl px-4 py-3.5"
                    style={
                      urgent
                        ? { borderWidth: 1, borderColor: "#e9d3c6", borderLeftWidth: 3, borderLeftColor: "#c2543a" }
                        : { borderWidth: 1, borderColor: "#e7e5e4" }
                    }
                  >
                    <View className="flex-row items-center justify-between">
                      <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                        {c.name}
                      </Text>
                      <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                        {c.coachName}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      {c.sessionsPerWeek}x/week
                      {c.currentBlock
                        ? ` · block ends ${formatDateMDY(c.currentBlock.block_end_date)}${c.dueSoon ? " · due soon" : ""}`
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
        ))}
      </ScrollView>
    </CoachShell>
  );
}
