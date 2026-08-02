import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { getCoachDashboardStats } from "../../lib/programming/coachDashboard";
import { STATUS_LABELS as SPC_STATUS_LABELS, STATUS_TONES as SPC_STATUS_TONES, STATUS_ORDER as SPC_STATUS_ORDER } from "../../lib/programming/spcStatus";
import { CoachShell } from "../../components/CoachShell";
import { fonts, colors, statusColors } from "../../lib/theme";

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };

const NUTRITION_STATUS_META = {
  notSetUp: { label: "Not set up yet", tone: "needsAction" },
  pendingCheckin: { label: "Pending check-in", tone: "needsAction" },
  readyForCheckin: { label: "Ready for check-in", tone: "needsAction" },
  checkinCompleted: { label: "Check-in completed", tone: "onTrack" },
};
const NUTRITION_STATUS_ORDER = ["notSetUp", "pendingCheckin", "readyForCheckin", "checkinCompleted"];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

function Panel({ title, children, style }) {
  return (
    <View className="flex-1 rounded-2xl border bg-white p-5" style={[{ borderColor: "#ece7e1" }, CARD_SHADOW, style]}>
      <Text
        className="mb-3.5 text-xs uppercase text-stone-400"
        style={{ fontFamily: fonts.sansBold, letterSpacing: 0.6, fontSize: 11 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function AttentionRow({ title, subtitle, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center justify-between rounded-xl px-4 py-3.5"
      style={{ backgroundColor: "#fdece5", borderWidth: 1, borderColor: "#f0d4c9" }}
    >
      <View className="flex-1 pr-2">
        <Text style={{ fontFamily: fonts.sansBold, color: "#8a3a24", fontSize: 13.5 }}>{title}</Text>
        <Text className="mt-0.5" style={{ fontFamily: fonts.sans, color: "#a8574a", fontSize: 12 }}>
          {subtitle}
        </Text>
      </View>
      <Text style={{ color: "#c2543a", fontSize: 15 }}>›</Text>
    </Pressable>
  );
}

function StatTile({ value, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="items-start rounded-[10px] px-3.5 py-3"
      style={{ backgroundColor: "#faf7f4", minWidth: 130, flexGrow: 1 }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 22 }} className="text-stone-700">
        {value}
      </Text>
      <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ClickableTile({ title, onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-2xl border bg-white px-5 py-[18px]"
      style={[{ borderColor: "#ece7e1", minWidth: 260 }, CARD_SHADOW]}
    >
      <View className="mb-3.5 flex-row items-center justify-between">
        <Text
          className="text-xs uppercase text-stone-400"
          style={{ fontFamily: fonts.sansBold, letterSpacing: 0.6, fontSize: 11 }}
        >
          {title}
        </Text>
        <Text style={{ color: "#c9c4bd", fontSize: 14 }}>›</Text>
      </View>
      {children}
    </Pressable>
  );
}

// Non-pressable version of the same card, for GroupTile — its rows each
// need their own navigation target (deep-linking to that specific
// program), so the outer card can't also be one big Pressable the way
// Nutrition/SPC's tiles are.
function TileCard({ children }) {
  return (
    <View className="flex-1 rounded-2xl border bg-white px-5 py-[18px]" style={[{ borderColor: "#ece7e1", minWidth: 260 }, CARD_SHADOW]}>
      {children}
    </View>
  );
}

function TileHeader({ title, onPress }) {
  return (
    <Pressable onPress={onPress} className="mb-3.5 flex-row items-center justify-between">
      <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.6, fontSize: 11 }}>
        {title}
      </Text>
      <Text style={{ color: "#c9c4bd", fontSize: 14 }}>›</Text>
    </Pressable>
  );
}

function StatusRow({ label, value, tone }) {
  const toneColors = tone ? statusColors[tone] : null;
  return (
    <View
      className="flex-row items-center justify-between py-2.5"
      style={{ borderTopWidth: 1, borderTopColor: "#f0ede8" }}
    >
      <Text className="text-stone-700" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
        {label}
      </Text>
      <View
        className="items-center justify-center rounded-full"
        style={{
          minWidth: 22,
          height: 22,
          paddingHorizontal: 7,
          backgroundColor: toneColors ? toneColors.bg : "#f1efed",
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, color: toneColors ? toneColors.text : "#a8a29e", fontSize: 11.5 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function NutritionTile({ stats, router }) {
  const b = stats.nutritionBreakdown;
  return (
    <ClickableTile title="Nutrition" onPress={() => router.push("/(coach)/nutrition")}>
      <Text className="mb-1 text-stone-700" style={{ fontFamily: fonts.sansBold, fontSize: 26 }}>
        {b.active}
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          {" "}
          active
        </Text>
      </Text>
      {NUTRITION_STATUS_ORDER.map((key) => (
        <StatusRow key={key} label={NUTRITION_STATUS_META[key].label} value={b[key]} tone={NUTRITION_STATUS_META[key].tone} />
      ))}
    </ClickableTile>
  );
}

function SpcTile({ stats, router }) {
  return (
    <ClickableTile title="SPC" onPress={() => router.push("/(coach)/spc")}>
      <Text className="mb-1 text-stone-700" style={{ fontFamily: fonts.sansBold, fontSize: 26 }}>
        {stats.spcCount}
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          {" "}
          clients
        </Text>
      </Text>
      {SPC_STATUS_ORDER.map((key) => (
        <StatusRow
          key={key}
          label={SPC_STATUS_LABELS[key]}
          value={stats.spcByStatus[key] ?? 0}
          tone={SPC_STATUS_TONES[key]}
        />
      ))}
    </ClickableTile>
  );
}

function GroupTile({ stats, router }) {
  return (
    <TileCard>
      <TileHeader title="Group programs" onPress={() => router.push("/(coach)/blocks")} />
      {stats.groupDashboard.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          No group programs yet
        </Text>
      ) : (
        stats.groupDashboard.map((p) => (
          <Pressable
            key={p.programId}
            onPress={() => router.push(`/(coach)/blocks?program=${p.programId}`)}
            className="py-2.5"
            style={{ borderTopWidth: 1, borderTopColor: "#f0ede8" }}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-stone-700" style={{ fontFamily: fonts.sansBold, fontSize: 14 }}>
                {p.name}
              </Text>
              <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 11.5 }}>
                {p.hasActiveBlock ? `${p.daysUntilEnd} day${p.daysUntilEnd === 1 ? "" : "s"} left` : "No active block"}
              </Text>
            </View>
            {p.unpublishedThisWeek && (
              <Text className="mt-1" style={{ fontFamily: fonts.sansBold, color: "#b23a22", fontSize: 12 }}>
                This week isn't published
              </Text>
            )}
            {p.unpublishedNextWeek && (
              <Text className="mt-0.5" style={{ fontFamily: fonts.sans, color: "#a8907f", fontSize: 12 }}>
                Next week isn't published yet
              </Text>
            )}
            {p.hasActiveBlock && p.daysUntilEnd <= 7 && !p.hasNextWeekBlock && (
              <Text className="mt-0.5" style={{ fontFamily: fonts.sansBold, color: "#b23a22", fontSize: 12 }}>
                Nothing queued after this block
              </Text>
            )}
          </Pressable>
        ))
      )}
    </TileCard>
  );
}

export default function CoachHomeWeb() {
  const { profile } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setStats(await getCoachDashboardStats());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "#faf8f6" }}>
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your dashboard: {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!stats) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#faf8f6" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  // A rollup of the Nutrition/SPC/Group tiles below — every item here reads
  // from the exact same computed stats those tiles render, rather than
  // being a separately hand-maintained list. SPC's due-soon/overdue counts
  // are deliberately not surfaced here: checkAndAutoDraft() (run just
  // before these stats are computed) already converts them into "New
  // Program ASAP" status, so that status count is the accurate version of
  // "needs a new program built."
  const spcNewProgramCount = stats.spcByStatus.new_program_asap ?? 0;
  const attentionItems = [
    spcNewProgramCount > 0 && {
      key: "spc-new-program",
      title: `${spcNewProgramCount} SPC client${spcNewProgramCount === 1 ? "" : "s"} need a new program`,
      subtitle: "Blank draft auto-created — ready to fill in",
      onPress: () => router.push("/(coach)/spc"),
    },
    stats.nutritionBreakdown.readyForCheckin > 0 && {
      key: "checkins",
      title: `${stats.nutritionBreakdown.readyForCheckin} check-in${stats.nutritionBreakdown.readyForCheckin === 1 ? "" : "s"} to review`,
      subtitle: "Submitted this week, awaiting your notes",
      onPress: () => router.push("/(coach)/nutrition"),
    },
    stats.nutritionAtRisk > 0 && {
      key: "nutrition-risk",
      title: `${stats.nutritionAtRisk} nutrition client${stats.nutritionAtRisk === 1 ? "" : "s"} at risk`,
      subtitle: "Missed logging days this week",
      onPress: () => router.push("/(coach)/nutrition"),
    },
    ...stats.groupDashboard
      .filter((p) => p.unpublishedThisWeek)
      .map((p) => ({
        key: `group-unpub-${p.programId}`,
        title: `${p.name}: this week isn't published`,
        subtitle: "Sessions are still drafts",
        onPress: () => router.push(`/(coach)/blocks?program=${p.programId}`),
      })),
    ...stats.groupDashboard
      .filter((p) => p.hasActiveBlock && p.daysUntilEnd <= 7 && !p.hasNextWeekBlock)
      .map((p) => ({
        key: `group-gap-${p.programId}`,
        title: `${p.name}: block ends in ${p.daysUntilEnd} day${p.daysUntilEnd === 1 ? "" : "s"}`,
        subtitle: "Nothing queued to start after it",
        onPress: () => router.push(`/(coach)/blocks?program=${p.programId}`),
      })),
    stats.unassignedCount > 0 && {
      key: "unassigned",
      title: `${stats.unassignedCount} client${stats.unassignedCount === 1 ? "" : "s"} not enrolled in anything`,
      subtitle: "Linked but not assigned to a program or nutrition",
      onPress: () => router.push("/(coach)/clients?program=unassigned"),
    },
  ].filter(Boolean);

  const goToClients = (programParam) => {
    router.push(programParam ? `/(coach)/clients?program=${programParam}` : "/(coach)/clients");
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerClassName="px-10 py-10">
        <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 27 }}>Welcome, {profile?.name}</Text>
        <Text className="mb-7 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 14 }}>
          {profile?.role === "admin" ? "Admin" : "Coach"} · {formatToday()}
        </Text>

        <View className="flex-row gap-4" style={{ maxWidth: 1180 }}>
          <Panel title="Needs your attention" style={{ flex: 1.1 }}>
            {attentionItems.length === 0 ? (
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                Nothing needs attention right now — you're all caught up.
              </Text>
            ) : (
              attentionItems.map((item) => (
                <AttentionRow key={item.key} title={item.title} subtitle={item.subtitle} onPress={item.onPress} />
              ))
            )}
          </Panel>

          <Panel title="Roster" style={{ flex: 1.4 }}>
            <View className="flex-row flex-wrap gap-2.5">
              <StatTile value={stats.totalMembers} label="Total clients" onPress={() => goToClients(null)} />
              <StatTile
                value={stats.flagshipCount}
                label="Flagship"
                onPress={() => stats.flagshipProgramId && goToClients(stats.flagshipProgramId)}
              />
              <StatTile
                value={stats.bwaCount}
                label="Better With Age"
                onPress={() => stats.bwaProgramId && goToClients(stats.bwaProgramId)}
              />
              <StatTile value={stats.spcCount} label="SPC" onPress={() => goToClients("spc")} />
              <StatTile value={stats.nutritionCount} label="Nutrition" onPress={() => goToClients("nutrition")} />
              <StatTile value={stats.unassignedCount} label="Unassigned" onPress={() => goToClients("unassigned")} />
            </View>
          </Panel>
        </View>

        <View className="mt-4 flex-row flex-wrap gap-4" style={{ maxWidth: 1180 }}>
          <NutritionTile stats={stats} router={router} />
          <SpcTile stats={stats} router={router} />
          <GroupTile stats={stats} router={router} />
        </View>
      </ScrollView>
    </CoachShell>
  );
}
