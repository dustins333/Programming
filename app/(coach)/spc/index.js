import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
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
  // The dashboard's SPC rows link here with ?status= ("Needs Printed" →
  // this page showing only those). This screen is a native tab and stays
  // mounted, so the initializer alone would miss a second arrival with a
  // different status.
  const params = useLocalSearchParams();
  const [statusFilter, setStatusFilter] = useState(typeof params.status === "string" && params.status ? params.status : null);
  const appliedStatusParamRef = useRef(typeof params.status === "string" ? params.status : "");
  useEffect(() => {
    const raw = typeof params.status === "string" ? params.status : "";
    if (appliedStatusParamRef.current === raw) return;
    appliedStatusParamRef.current = raw;
    setStatusFilter(raw || null);
  }, [params.status]);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
    try {
      // .catch, matching the web sibling: auto-drafting is a background
      // convenience and a failed write (RLS, an unrun migration) must not
      // take the whole roster down with it.
      await checkAndAutoDraft().catch(() => {});
      setRoster(await getSpcRoster());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  // SPC tab's root screen — stays mounted on native while a coach drills
  // into a client and back (see spc/_layout.js's Stack comment), so this
  // needs to refetch on every focus, not just once at mount.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
    return STATUS_ORDER.filter((status) => !statusFilter || status === statusFilter)
      .map((status) => ({
        status,
        clients: filtered.filter((c) => c.status === status),
      }))
      .filter((g) => g.clients.length > 0);
  }, [filtered, statusFilter]);

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading the SPC roster: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
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

        {statusFilter ? (
          <View className="mb-4 flex-row flex-wrap items-center gap-2">
            <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              Filtered: <Text style={{ fontFamily: fonts.sansSemiBold, color: "#4d6142" }}>{STATUS_LABELS[statusFilter]}</Text>
            </Text>
            <Text style={{ color: "#d6d3d1" }}>·</Text>
            <Pressable onPress={() => setStatusFilter(null)} hitSlop={8}>
              <Text className="text-sm" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                Clear filter
              </Text>
            </Pressable>
          </View>
        ) : null}

        {grouped.length === 0 ? (
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No clients match your filters.
          </Text>
        ) : null}

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
