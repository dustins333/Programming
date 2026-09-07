import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCoachDashboard } from "../../lib/programming/useCoachDashboard";
import { usePendingDocuments } from "../../lib/programming/usePendingDocuments";
import { usePendingExerciseReviews } from "../../lib/programming/usePendingExerciseReviews";
import { useOpenHubSession } from "./LiveSessionStrip";
import { FinalizePrompt } from "../payroll/FinalizePrompt";
import { listMembers } from "../../lib/programming/clients";
import { CoachShell } from "../CoachShell";
import { PressFade } from "../PressFade";
import { GymWeekModal } from "./GymWeekModal";
import { QuickPickBar } from "./QuickPickBar";
import { GymBand } from "./dashboard/GymBand";
import { SpcActionRow } from "./dashboard/SpcActionRow";
import { DashboardSheet, SheetRow, SheetEmpty } from "./dashboard/DashboardSheet";
import { NutritionTodayList } from "./dashboard/NutritionTodayList";
import {
  ModuleCard,
  ModuleHeader,
  SubTileRow,
  GroupProgramRow,
  CountRow,
  CARD_BORDER,
  CARD_SHADOW,
  CHEVRON,
  DASHBOARD_CANVAS,
} from "./dashboard/DashboardParts";
import {
  buildGroupRows,
  buildNutritionTiles,
  buildQuickPickTiles,
  buildSpcTiles,
  groupSubline,
  nutritionSubline,
  spcSubline,
} from "../../lib/programming/dashboardModel";
import { useKeyboardInset } from "../../lib/useKeyboardInset";
import { fonts, colors } from "../../lib/theme";

// Coach home on a phone — the mobile web (PWA) build and the native app both
// land here (design_handoff_coach_dashboard, 4a).
//
// A coach opens this between clients, on the gym floor, standing up. So it
// answers "what needs me today", puts the four places they go constantly one
// tap away in the app bar, and then gives every module's real numbers without
// a tap.
//
// The four tap-through module CARDS this replaces were summary tiles that
// opened a detail sheet — you had to open SPC to find out four people were
// behind. Every module is an always-expanded section now, modelled on the
// gym band, which is the one block Terra asked to leave alone. There is no
// collapse state and nothing to persist: that was an explicit decision.
//
// Deliberately NOT here, and both are on the desktop instead: the Needs You
// task list, and the roster count chips. This screen's sections carry the
// same facts as tiles ("4 Due now", "Flagship · this week is still drafts"),
// and a phone has no room to say each of them twice.

const CANVAS = DASHBOARD_CANVAS;
const LOOKUP_LIMIT = 25;

function greeting() {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Boise", hour: "2-digit", hour12: false }));
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function formatToday() {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/Boise", weekday: "long", month: "short", day: "numeric" });
}

/* ----------------------------------------------------------- client lookup */

// The phone-only affordance the desktop answers with a header search field,
// and the reason it sits directly under the payroll prompt rather than among
// the modules: looking someone up is the single most common thing to want on
// a gym floor, and it used to be buried below them.
function ClientLookupSheet({ visible, onClose, router }) {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const { keyboardInset, visibleHeight } = useKeyboardInset();

  // Fetch as soon as the sheet is asked for, NOT on the Modal's onShow —
  // onShow fires when the slide animation finishes, so anyone who started
  // typing during the slide hit `members === null` and got a spinner instead
  // of matches. It read as "the filter doesn't work"; the filter was fine,
  // there was just nothing to filter yet.
  useEffect(() => {
    if (!visible || members) return;
    let cancelled = false;
    setLoadError(null);
    listMembers()
      .then((rows) => !cancelled && setMembers(rows))
      .catch((err) => !cancelled && setLoadError(err.message ?? String(err)));
    return () => {
      cancelled = true;
    };
  }, [visible, members]);

  // Clear the query on close so reopening starts fresh rather than showing
  // whoever you looked up last. `members` is deliberately kept — it's the
  // expensive half and the roster doesn't change between two taps.
  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const { rows, total } = useMemo(() => {
    if (!members) return { rows: [], total: 0 };
    const q = query.trim().toLowerCase();
    const matched = q
      ? members.filter((m) => (m.name ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q))
      : members;
    return { rows: matched.slice(0, LOOKUP_LIMIT), total: matched.length };
  }, [members, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, justifyContent: "flex-end", paddingBottom: keyboardInset, backgroundColor: "rgba(68,64,60,0.35)" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            backgroundColor: CANVAS,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 26,
            maxHeight: visibleHeight ? Math.round(visibleHeight * 0.85) : "85%",
          }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 99, backgroundColor: "#dcd6ce", marginBottom: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.primary }}>Find a client</Text>
            {members ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
                {total > LOOKUP_LIMIT ? `first ${LOOKUP_LIMIT} of ${total}` : `${total} ${total === 1 ? "match" : "matches"}`}
              </Text>
            ) : null}
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name or email"
            placeholderTextColor="#a8a29e"
            autoCorrect={false}
            autoCapitalize="none"
            style={{
              fontFamily: fonts.sans,
              // 16, not 15. iOS Safari auto-zooms any field under 16px on
              // focus, and a zoom that fails to unwind in a standalone PWA
              // leaves the app askew with no browser chrome to reset from.
              fontSize: 16,
              backgroundColor: "white",
              borderWidth: 1,
              borderColor: "#ece7e1",
              borderRadius: 12,
              paddingHorizontal: 13,
              paddingVertical: 11,
              color: colors.text,
            }}
          />
          <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled">
            {loadError ? (
              <Text style={{ fontFamily: fonts.sans, color: "#b23a22", paddingVertical: 10 }}>Couldn't load clients: {loadError}</Text>
            ) : !members ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 14 }} />
            ) : rows.length === 0 ? (
              <SheetEmpty>No clients match "{query.trim()}".</SheetEmpty>
            ) : (
              rows.map((m) => (
                <SheetRow
                  key={m.id}
                  title={m.name ?? "Unnamed"}
                  detail={m.email}
                  onPress={() => {
                    onClose();
                    router.push(`/(coach)/clients/${m.id}`);
                  }}
                />
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* --------------------------------------------------------------------- page */

export function CoachHomeMobile() {
  const router = useRouter();
  const [lookupOpen, setLookupOpen] = useState(false);
  // Which gym-band tile is open, or null. One piece of state rather than
  // four booleans — they're mutually exclusive by definition.
  const [gymView, setGymView] = useState(null);
  const [sheet, setSheet] = useState(null); // "nutritionToday" | "notSeen"
  const { profile, stats, extras, nutritionToday, loadError, reload: load } = useCoachDashboard();
  // Hooks, so they sit above the loading/error returns below.
  const canSeeHub = profile?.role === "admin" || Boolean(profile?.can_view_spc);
  const openHub = useOpenHubSession(canSeeHub);
  const { count: pendingDocuments, pending: pendingDocumentRows } = usePendingDocuments();
  const { count: pendingReviews } = usePendingExerciseReviews();

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: CANVAS }}>
          <Text className="text-center" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
            Something went wrong loading your dashboard: {loadError}
          </Text>
          <Pressable onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  if (!stats) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  const safeExtras = extras ?? { gym: {}, stagedCount: null, payroll: null, finalizePrompt: null };
  const isAdmin = profile?.role === "admin";
  const canSpc = isAdmin || Boolean(profile?.can_view_spc);
  const canNutrition = isAdmin || Boolean(profile?.can_view_nutrition);

  const spcTiles = buildSpcTiles(stats);
  const nutritionTiles = buildNutritionTiles(stats, nutritionToday);
  const groupRows = buildGroupRows(stats);
  const quickPick = buildQuickPickTiles({
    profile,
    stats,
    liveSession: openHub,
    finalizePrompt: safeExtras.finalizePrompt,
  });
  const notSeen = stats.nutritionNotSeen ?? [];

  // A sub-tile either navigates or opens its list. Both are "get behind this
  // number", which is the promise every figure on this page makes.
  const openTile = (tile) => {
    if (tile.route) router.push(tile.route);
    else if (tile.sheet) setSheet(tile.sheet);
  };

  const go = (route) => {
    setSheet(null);
    router.push(route);
  };

  return (
    <CoachShell headerAccessory={<QuickPickBar tiles={quickPick} onPress={(tile) => router.push(tile.route)} />}>
      <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerStyle={{ padding: 13, paddingBottom: 34, gap: 11 }}>
        <View>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a8a29e" }}>
            {formatToday().toUpperCase()}
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 25, color: colors.primary, lineHeight: 29, marginTop: 3 }}>
            {greeting()}, {profile?.name?.split(" ")[0] ?? "coach"}
          </Text>
        </View>

        {/* The one thing on this screen with a deadline attached to it. */}
        <FinalizePrompt prompt={safeExtras.finalizePrompt} />

        <PressFade
          onPress={() => setLookupOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderRadius: 14,
            paddingVertical: 13,
            paddingHorizontal: 13,
            ...CARD_SHADOW,
          }}
        >
          <Ionicons name="search-outline" size={19} color={colors.primary} />
          <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.text }}>Find a client</Text>
          <Ionicons name="chevron-forward" size={16} color={CHEVRON} />
        </PressFade>

        <GymBand gym={safeExtras.gym} onOpen={setGymView} />

        {canSpc ? (
          <ModuleCard>
            <ModuleHeader
              icon="clipboard"
              title="SPC"
              subline={spcSubline(stats)}
              linkLabel="Open SPC ›"
              onLink={() => router.push("/(coach)/spc")}
            />
            <SpcActionRow
              session={openHub}
              stagedCount={safeExtras.stagedCount}
              onPress={() => router.push(openHub ? "/(coach)/spc/live" : "/(coach)/spc/live?tab=start")}
            />
            <SubTileRow tiles={spcTiles} onOpen={openTile} />
          </ModuleCard>
        ) : null}

        {canNutrition ? (
          <ModuleCard>
            <ModuleHeader
              icon="restaurant"
              title="Nutrition"
              subline={nutritionSubline(stats)}
              linkLabel="Open Nutrition ›"
              onLink={() => router.push("/(coach)/nutrition")}
            />
            <SubTileRow tiles={nutritionTiles} onOpen={openTile} />
          </ModuleCard>
        ) : null}

        {/* No gate — there is no group permission flag in the codebase. */}
        <ModuleCard>
          <ModuleHeader
            icon="barbell"
            title="Group"
            subline={groupSubline(groupRows)}
            linkLabel="Open grid ›"
            onLink={() => router.push("/(coach)/blocks")}
            divider={false}
          />
          {groupRows.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, paddingTop: 8 }}>No group programs yet.</Text>
          ) : (
            groupRows.map((row, i) => (
              <GroupProgramRow
                key={row.key}
                row={row}
                first={i === 0}
                last={i === groupRows.length - 1}
                onPress={() => router.push(row.route)}
              />
            ))
          )}
        </ModuleCard>

        {/* Notifications, not modules — these two disappear entirely at zero
            rather than rendering an empty section. */}
        {pendingReviews > 0 ? (
          <CountRow
            count={pendingReviews}
            title={`${pendingReviews} exercise${pendingReviews === 1 ? "" : "s"} waiting on you`}
            subtitle="Library review"
            onPress={() => router.push("/(coach)/exercises/review")}
          />
        ) : null}

        {pendingDocuments > 0 ? (
          <CountRow
            count={pendingDocuments}
            title={`${pendingDocuments} document${pendingDocuments === 1 ? "" : "s"} to read & sign`}
            subtitle={pendingDocumentRows.slice(0, 2).map((d) => d.title).join(" · ")}
            onPress={() => router.push("/(coach)/documents")}
          />
        ) : null}
      </ScrollView>

      <ClientLookupSheet visible={lookupOpen} onClose={() => setLookupOpen(false)} router={router} />
      <GymWeekModal visible={gymView !== null} view={gymView} week={safeExtras.gym?.week ?? null} onClose={() => setGymView(null)} />

      <DashboardSheet
        visible={sheet === "nutritionToday"}
        onClose={() => setSheet(null)}
        title="Logged today"
        subtitle={
          nutritionToday
            ? `${nutritionToday.loggedCount} of ${nutritionToday.totalCount} active clients · ${nutritionToday.finalizedCount} finalized`
            : null
        }
        footerLabel="Open Nutrition"
        onFooterPress={() => go("/(coach)/nutrition")}
      >
        <NutritionTodayList nutritionToday={nutritionToday} onOpenClient={(id) => go(`/(coach)/nutrition/clients/${id}`)} />
      </DashboardSheet>

      <DashboardSheet
        visible={sheet === "notSeen"}
        onClose={() => setSheet(null)}
        title="Not seen in 7 days"
        subtitle="No log and no weigh-in since this day last week"
        footerLabel="Open Nutrition"
        onFooterPress={() => go("/(coach)/nutrition")}
      >
        {notSeen.length === 0 ? (
          <SheetEmpty>Everyone's put something in this week.</SheetEmpty>
        ) : (
          notSeen.map((c) => (
            <SheetRow
              key={c.userId}
              tone="warn"
              title={c.name}
              detail={c.coachName}
              onPress={() => go(`/(coach)/nutrition/clients/${c.userId}`)}
            />
          ))
        )}
      </DashboardSheet>
    </CoachShell>
  );
}
