import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { getCoachDashboardStats, computeAttentionItems, filterDismissedItems } from "../../lib/programming/coachDashboard";
import { listDismissals, dismissAttentionItem } from "../../lib/programming/dashboardDismissals";
import { STATUS_LABELS as SPC_STATUS_LABELS, STATUS_TONES as SPC_STATUS_TONES, STATUS_ORDER as SPC_STATUS_ORDER } from "../../lib/programming/spcStatus";
import {
  NUTRITION_STATUS_META,
  NUTRITION_STATUS_ORDER,
  nutritionRosterRoute,
  spcRosterRoute,
} from "../../lib/programming/dashboardStatusTiles";
import { AttentionTile, AttentionModal } from "../../components/AttentionAlerts";
import { CoachShell } from "../../components/CoachShell";
import { fonts, colors, statusColors } from "../../lib/theme";
import { ActivityFeed } from "../../components/ActivityFeed";

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };

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

// Every summary tile's rows now carry their own navigation target (a
// specific program, or a roster filtered to that status), so the card
// itself is never one big Pressable — a Pressable row nested inside a
// Pressable card double-fires on web, where the click bubbles, and the
// outer plain-page navigation would win over the row's filtered one.
// TileHeader is what still navigates to the unfiltered page.
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

// Each row deep-links to its own roster, already filtered to the same
// people it just counted — a count you can't act on is a dead end.
function StatusRow({ label, value, tone, onPress }) {
  const toneColors = tone ? statusColors[tone] : null;
  return (
    <Pressable
      onPress={onPress}
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
    </Pressable>
  );
}

function NutritionTile({ stats, router }) {
  const b = stats.nutritionBreakdown;
  return (
    <TileCard>
      <TileHeader title="Nutrition" onPress={() => router.push("/(coach)/nutrition")} />
      <Text className="mb-1 text-stone-700" style={{ fontFamily: fonts.sansBold, fontSize: 26 }}>
        {b.active}
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          {" "}
          active
        </Text>
      </Text>
      {NUTRITION_STATUS_ORDER.map((key) => (
        <StatusRow
          key={key}
          label={NUTRITION_STATUS_META[key].label}
          value={b[key]}
          tone={NUTRITION_STATUS_META[key].tone}
          onPress={() => router.push(nutritionRosterRoute(key))}
        />
      ))}
    </TileCard>
  );
}

function SpcTile({ stats, router }) {
  return (
    <TileCard>
      <TileHeader title="SPC" onPress={() => router.push("/(coach)/spc")} />
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
          onPress={() => router.push(spcRosterRoute(key))}
        />
      ))}
    </TileCard>
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
  const [dismissals, setDismissals] = useState({});
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setStats(await getCoachDashboardStats());
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    // Isolated from the stats fetch on purpose — same pattern as the
    // SPC/nutrition rosters inside getCoachDashboardStats: a not-yet-run
    // migration for this table shouldn't take down the whole dashboard,
    // it should just leave every attention item un-dismissable for now.
    try {
      setDismissals(await listDismissals());
    } catch {
      setDismissals({});
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "#faf8f6" }}>
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your dashboard: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
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

  // Shared with the native dashboard (lib/programming/coachDashboard.js) so
  // the two can't drift on what counts as "needs attention" — this used to
  // be computed inline here only.
  const allAttentionItems = computeAttentionItems(stats);
  const attentionItems = filterDismissedItems(allAttentionItems, dismissals, todayInBoise()).map((item) => ({
    ...item,
    onPress: () => router.push(item.route),
  }));

  const handleDismiss = (item) => {
    // Optimistic — the row disappears immediately, the write happens in
    // the background. If it fails, the next load() will bring the row
    // back rather than leaving the UI lying about what's dismissed.
    setDismissals((prev) => ({ ...prev, [item.key]: { signature: item.signature, dismissedAt: new Date().toISOString() } }));
    dismissAttentionItem(item.key, item.signature, profile?.id).catch((err) => {
      console.error("Failed to dismiss attention item:", err);
    });
  };

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

        <View style={{ maxWidth: 1180 }}>
          <ActivityFeed />
        </View>

        <View className="flex-row flex-wrap gap-4" style={{ maxWidth: 1180 }}>
          <AttentionTile
            count={attentionItems.length}
            onPress={() => setAttentionOpen(true)}
            style={{ minWidth: 240, flexGrow: 1, flexBasis: 240, ...CARD_SHADOW }}
          />

          <Panel title="Roster" style={{ flex: 3, minWidth: 320 }}>
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

        <AttentionModal
          visible={attentionOpen}
          items={attentionItems}
          onClose={() => setAttentionOpen(false)}
          onDismiss={handleDismiss}
          onSelect={(item) => {
            setAttentionOpen(false);
            item.onPress();
          }}
        />
      </ScrollView>
    </CoachShell>
  );
}
