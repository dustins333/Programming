import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getNutritionRoster } from "../../../lib/nutrition/dashboard";
import { STATUS_META, STATUS_ORDER } from "../../../lib/nutrition/rosterStatus";
import { StatusBadge } from "../../../components/StatusBadge";
import { CoachShell } from "../../../components/CoachShell";
import { CheckinCallPill } from "../../../components/nutrition/CheckinCallPill";
import { fonts, colors } from "../../../lib/theme";

const FILTER_ORDER = STATUS_ORDER;

function metaLine(client) {
  if (client.rosterStatus === "paused") return "Paused";
  if (client.rosterStatus === "needsTarget") return "No target set yet";
  if (client.rosterStatus === "otSetup") return "Waiting on you to add tracking days";
  if (client.rosterStatus === "otInProgress") return `${client.trackingLoggedCount} of ${client.trackingDatesCount} tracking days logged`;
  if (client.rosterStatus === "readyForReview") return "Ready for your review";
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
  const insets = useSafeAreaInsets();
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const params = useLocalSearchParams();
  // An array, not one key: the dashboard's "Not set up yet" row counts one
  // bucket this roster splits across four statuses, so it arrives as
  // ?status=a,b,c,d. Empty = no filter.
  const [filter, setFilter] = useState(() =>
    typeof params.status === "string" && params.status ? params.status.split(",").filter(Boolean) : []
  );
  // This screen is a native tab and stays mounted, so the initializer above
  // misses a second arrival from the dashboard with a different status.
  const appliedStatusParamRef = useRef(typeof params.status === "string" ? params.status : "");
  useEffect(() => {
    const raw = typeof params.status === "string" ? params.status : "";
    if (appliedStatusParamRef.current === raw) return;
    appliedStatusParamRef.current = raw;
    setFilter(raw ? raw.split(",").filter(Boolean) : []);
  }, [params.status]);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
    try {
      // Archived clients are deliberately excluded here — they get their
      // own Archived list (still pullable, just not mixed into the roster
      // a coach scans day to day). Paused ones stay visible; that's still
      // a "temporarily off" state worth seeing at a glance.
      setRoster((await getNutritionRoster()).filter((c) => c.status !== "archived"));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  // Tab root, kept mounted across tab switches on native — refetch on
  // every focus so a client's roster status reflects work just done on
  // their detail page.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    if (!roster) return [];
    const scoped = filter.length ? roster.filter((c) => filter.includes(c.rosterStatus)) : roster;
    return [...scoped].sort((a, b) => a.name.localeCompare(b.name));
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
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading the nutrition roster: {loadError}
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
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-6 py-8"
      contentContainerStyle={{ paddingTop: insets.top + 20 }}
    >
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Nutrition
        </Text>
        <View className="flex-row gap-4">
          <Link href="/(coach)/nutrition/archived" style={{ fontFamily: fonts.sansMedium }} className="text-[#8a5140]">
            Archived
          </Link>
          <Link href="/(coach)/nutrition/photo-compare" style={{ fontFamily: fonts.sansMedium }} className="text-[#8a5140]">
            Photo compare
          </Link>
        </View>
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
          <View className="mb-5 flex-row flex-wrap justify-between">
            <Pressable
              onPress={() => setFilter([])}
              className={`mb-2 items-center justify-center rounded-xl border px-2 py-2.5 ${!filter.length ? "border-primary bg-primary" : "border-stone-300"}`}
              style={{ width: "31%" }}
            >
              <Text numberOfLines={2} className={`text-center ${!filter.length ? "text-white" : "text-stone-700"}`} style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                All ({roster.length})
              </Text>
            </Pressable>
            {FILTER_ORDER.filter((key) => counts[key] > 0).map((key) => (
              <Pressable
                key={key}
                onPress={() => setFilter([key])}
                className={`mb-2 items-center justify-center rounded-xl border px-2 py-2.5 ${filter.includes(key) ? "border-primary bg-primary" : "border-stone-300"}`}
                style={{ width: "31%" }}
              >
                <Text
                  numberOfLines={2}
                  className={`text-center ${filter.includes(key) ? "text-white" : "text-stone-700"}`}
                  style={{ fontFamily: fonts.sans, fontSize: 12.5 }}
                >
                  {STATUS_META[key].label} ({counts[key]})
                </Text>
              </Pressable>
            ))}
          </View>

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
                {/* Same reason as the web queue row: a client with a call on
                    the calendar is not a client who has gone quiet. */}
                {c.checkinBooking ? (
                  <View className="mt-1.5">
                    <CheckinCallPill booking={c.checkinBooking} />
                  </View>
                ) : null}
              </Pressable>
            </Link>
          ))}
        </>
      )}
    </ScrollView>
    </CoachShell>
  );
}
