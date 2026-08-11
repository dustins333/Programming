import { useCallback, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
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

function SectionLabel({ children }) {
  return (
    <Text className="mb-2.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
      {children}
    </Text>
  );
}

function StatTile({ value, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="items-start rounded-[10px] px-3.5 py-3"
      style={{ backgroundColor: "#faf7f4", minWidth: "30%", flexGrow: 1 }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 20 }} className="text-stone-700">
        {value}
      </Text>
      <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 11.5 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Each row deep-links to its own roster, already filtered to the same
// people it just counted (shared with the web dashboard via
// lib/programming/dashboardStatusTiles.js).
function StatusRow({ label, value, tone, onPress }) {
  const toneColors = tone ? statusColors[tone] : null;
  return (
    <Pressable onPress={onPress} className="flex-row items-center justify-between py-2.5" style={{ borderTopWidth: 1, borderTopColor: "#f0ede8" }}>
      <Text className="text-stone-700" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
        {label}
      </Text>
      <View
        className="items-center justify-center rounded-full"
        style={{ minWidth: 22, height: 22, paddingHorizontal: 7, backgroundColor: toneColors ? toneColors.bg : "#f1efed" }}
      >
        <Text style={{ fontFamily: fonts.sansBold, color: toneColors ? toneColors.text : "#a8a29e", fontSize: 11.5 }}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

function Card({ children, onPress }) {
  const content = (
    <View className="rounded-2xl border bg-white px-5 py-[18px]" style={[{ borderColor: "#ece7e1" }, CARD_SHADOW]}>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

function CardHeader({ title, onPress }) {
  return (
    <Pressable onPress={onPress} className="mb-3 flex-row items-center justify-between">
      <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.6, fontSize: 11 }}>
        {title}
      </Text>
      <Text style={{ color: "#c9c4bd", fontSize: 14 }}>›</Text>
    </Pressable>
  );
}

export default function CoachHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    // migration for this table shouldn't take down the whole dashboard, it
    // should just leave every attention item un-dismissable for now.
    try {
      setDismissals(await listDismissals());
    } catch {
      setDismissals({});
    }
  }, []);

  // Native's Tabs navigator keeps this dashboard mounted across tab
  // switches — a plain mount-only effect would only ever fetch once per
  // session, so stat counts and "needs attention" rows would go stale the
  // moment anything changed elsewhere in the app. useFocusEffect re-runs
  // load() every time this tab is focused (a no-op extra fetch on web,
  // where <Slot/> remounts on navigation anyway).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your dashboard: {loadError}
        </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
      </View>
    );
  }

  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

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

  const goToClients = (programParam) => router.push(programParam ? `/(coach)/clients?program=${programParam}` : "/(coach)/clients");

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-6 py-8"
      contentContainerStyle={{ paddingTop: insets.top + 20 }}
    >
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }} numberOfLines={1}>
          Welcome, {profile?.name}
        </Text>
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
      </View>
      <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
        {profile?.role === "admin" ? "Admin" : "Coach"} · {formatToday()}
      </Text>

      <ActivityFeed />

      <View className="mb-6">
        <AttentionTile count={attentionItems.length} onPress={() => setAttentionOpen(true)} style={CARD_SHADOW} />
      </View>

      <View className="mb-6">
        <SectionLabel>Roster</SectionLabel>
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
      </View>

      <View className="mb-4">
        <Card>
          <CardHeader title="Nutrition" onPress={() => router.push("/(coach)/nutrition")} />
          <Text className="mb-1 text-stone-700" style={{ fontFamily: fonts.sansBold, fontSize: 24 }}>
            {stats.nutritionBreakdown.active}
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
              {" "}
              active
            </Text>
          </Text>
          {NUTRITION_STATUS_ORDER.map((key) => (
            <StatusRow
              key={key}
              label={NUTRITION_STATUS_META[key].label}
              value={stats.nutritionBreakdown[key]}
              tone={NUTRITION_STATUS_META[key].tone}
              onPress={() => router.push(nutritionRosterRoute(key))}
            />
          ))}
        </Card>
      </View>

      <View className="mb-4">
        <Card>
          <CardHeader title="SPC" onPress={() => router.push("/(coach)/spc")} />
          <Text className="mb-1 text-stone-700" style={{ fontFamily: fonts.sansBold, fontSize: 24 }}>
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
        </Card>
      </View>

      <View className="mb-2">
        <Card>
          <CardHeader title="Group programs" onPress={() => router.push("/(coach)/blocks")} />
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
        </Card>
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
  );
}
