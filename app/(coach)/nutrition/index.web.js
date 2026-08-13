import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getNutritionRoster } from "../../../lib/nutrition/dashboard";
import { QueuePreview } from "../../../components/nutrition/QueuePreview";
import { StatusGroup } from "../../../components/nutrition/QueueList";
import { EnrollClientModal } from "../../../components/nutrition/EnrollClientModal";
import { CoachShell } from "../../../components/CoachShell";
import { todayInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";

// The Nutrition module home, rebuilt as a QUEUE (coach web v2, screen 17).
//
// The old version was a roster: filter chips over a table of everyone. That
// answers "who do I have", which a coach opening this page already knows.
// What she's actually here to do is work through the check-ins that came in,
// so the group that holds those is open by default with its clients listed,
// and every other group is one collapsed line carrying its count. Same data,
// same statuses, different question.
//
// Below the mobile breakpoint this collapses to the plain grouped list with
// no preview pane — a two-pane layout on a phone gives neither pane room,
// and the client record is one tap away.

const MOBILE_BREAKPOINT = 900;

// Group order IS priority order: what needs her, then what's waiting on the
// client, then what's settled. The first group with anyone in it opens.
const GROUPS = [
  {
    key: "active",
    title: "Active clients",
    statuses: ["readyForCheckin", "checkinPending", "checkinCompleted"],
  },
  {
    key: "new",
    title: "New clients",
    statuses: ["otSetup", "otInProgress", "readyForReview"],
  },
  {
    key: "other",
    title: "Other",
    statuses: ["needsTarget", "paused"],
  },
];

function HeaderButton({ label, onPress, primary }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-lg px-4 py-2.5"
      style={{ borderWidth: primary ? 0 : 1, borderColor: "#ddd6cd", backgroundColor: primary ? colors.primary : "white" }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: primary ? "white" : "#44403c" }}>{label}</Text>
    </Pressable>
  );
}

export default function NutritionQueue() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const today = todayInBoise();

  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  // ?status= opens a specific group. Tolerates the comma-joined form the old
  // roster accepted from dashboard tiles by taking the first entry, so an
  // outdated link opens something sensible rather than nothing.
  const [openStatus, setOpenStatus] = useState(
    typeof params.status === "string" && params.status ? params.status.split(",").filter(Boolean)[0] ?? null : null
  );
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    try {
      // Archived clients are deliberately excluded — they get their own
      // Archived list. Paused ones stay, in their own group: that's still a
      // "temporarily off" state worth seeing.
      setRoster((await getNutritionRoster()).filter((c) => c.status !== "archived"));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = useMemo(() => {
    const map = {};
    (roster ?? []).forEach((client) => {
      if (!map[client.rosterStatus]) map[client.rosterStatus] = [];
      map[client.rosterStatus].push(client);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [roster]);

  // The queue opens on whatever is genuinely waiting on her — the first
  // status in priority order that has anyone in it, unless she arrived here
  // from a dashboard tile naming a specific one.
  const defaultStatus = useMemo(() => {
    for (const group of GROUPS) {
      for (const status of group.statuses) {
        if ((byStatus[status] ?? []).length > 0) return status;
      }
    }
    return null;
  }, [byStatus]);

  const activeStatus = openStatus && (byStatus[openStatus] ?? []).length > 0 ? openStatus : defaultStatus;

  // Selection follows the open group rather than persisting across it —
  // leaving the previous client's week on screen next to a different
  // group's list is how you review the wrong person.
  useEffect(() => {
    if (!activeStatus) return;
    const list = byStatus[activeStatus] ?? [];
    setSelectedUserId((current) => (list.some((c) => c.userId === current) ? current : (list[0]?.userId ?? null)));
  }, [activeStatus, byStatus]);

  const selected = (roster ?? []).find((c) => c.userId === selectedUserId) ?? null;
  const waitingCount = (byStatus.readyForCheckin ?? []).length;
  const existingClientIds = useMemo(() => new Set((roster ?? []).map((c) => c.userId)), [roster]);

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: colors.canvas }}>
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading the nutrition roster: {loadError}
          </Text>
          <Pressable onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  if (!roster) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.canvas }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  const queueList = (
    <View className="rounded-2xl" style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white", overflow: "hidden" }}>
      {GROUPS.map((group) => {
        const statuses = group.statuses.filter((status) => (byStatus[status] ?? []).length > 0);
        if (statuses.length === 0) return null;
        return (
          <View key={group.key}>
            <Text
              style={{
                fontFamily: fonts.sansBold,
                fontSize: 9.5,
                color: "#c3bdb4",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                paddingHorizontal: 14,
                paddingTop: 14,
                paddingBottom: 6,
              }}
            >
              {group.title}
            </Text>
            {statuses.map((status) => (
              <StatusGroup
                key={status}
                status={status}
                clients={byStatus[status] ?? []}
                open={status === activeStatus}
                onToggle={() => setOpenStatus((cur) => (cur === status ? null : status))}
                selectedUserId={selectedUserId}
                onSelect={(client) => (isMobile ? router.push(`/(coach)/nutrition/clients/${client.userId}`) : setSelectedUserId(client.userId))}
                today={today}
              />
            ))}
          </View>
        );
      })}
      {roster.length === 0 ? (
        <Text className="p-6" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
          No nutrition clients yet — enrol one above.
        </Text>
      ) : null}
    </View>
  );

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingHorizontal: isMobile ? 14 : 40, paddingTop: isMobile ? 20 : 36, paddingBottom: 48 }}>
        <View className="mb-6 flex-row flex-wrap items-start justify-between" style={{ gap: 14 }}>
          <View>
            <Text style={{ fontFamily: fonts.display, fontSize: 27, color: colors.primary }}>Nutrition</Text>
            <Text className="mt-1" style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>
              {roster.length} active · {waitingCount} check-in{waitingCount === 1 ? "" : "s"} waiting
            </Text>
          </View>
          <View className="flex-row flex-wrap items-center" style={{ gap: 10 }}>
            <Link href="/(coach)/nutrition/photo-compare" asChild>
              <Pressable className="rounded-lg px-4 py-2.5" style={{ borderWidth: 1, borderColor: "#ddd6cd", backgroundColor: "white" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Photo compare</Text>
              </Pressable>
            </Link>
            <Link href="/(coach)/nutrition/archived" asChild>
              <Pressable className="rounded-lg px-4 py-2.5" style={{ borderWidth: 1, borderColor: "#ddd6cd", backgroundColor: "white" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Archived</Text>
              </Pressable>
            </Link>
            <HeaderButton label="+ Enrol client" primary onPress={() => setEnrolling(true)} />
          </View>
        </View>

        {isMobile ? (
          queueList
        ) : (
          <View className="flex-row" style={{ gap: 18, alignItems: "flex-start" }}>
            <View style={{ width: 340, flexGrow: 0, flexShrink: 0 }}>{queueList}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {selected ? (
                <QueuePreview client={selected} today={today} />
              ) : (
                <View className="items-center justify-center rounded-2xl p-16" style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}>
                  <Ionicons name="nutrition-outline" size={26} color="#d6d3d1" />
                  <Text className="mt-3 text-center" style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#a8a29e" }}>
                    Pick a client on the left to see her week.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <EnrollClientModal
        visible={enrolling}
        existingClientIds={existingClientIds}
        onClose={() => setEnrolling(false)}
        onEnrolled={async (userId) => {
          await load();
          router.push(`/(coach)/nutrition/clients/${userId}`);
        }}
      />
    </CoachShell>
  );
}
