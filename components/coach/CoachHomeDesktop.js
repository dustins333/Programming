import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { computeAttentionItems, filterDismissedItems } from "../../lib/programming/coachDashboard";
import { decorateAttentionItems, filterAttentionByPermission, weekdayOf, CARD_TONES } from "../../lib/programming/launchpad";
import { dismissAttentionItem } from "../../lib/programming/dashboardDismissals";
import { useCoachDashboard } from "../../lib/programming/useCoachDashboard";
import { usePendingDocuments } from "../../lib/programming/usePendingDocuments";
import { useLibraryReview } from "../../lib/programming/useLibraryReview";
import { useOpenHubSession } from "./LiveSessionStrip";
import { FinalizePrompt } from "../payroll/FinalizePrompt";
import { listMembers } from "../../lib/programming/clients";
import { CoachShell } from "../CoachShell";
import { PressFade } from "../PressFade";
import { GymWeekModal } from "./GymWeekModal";
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
  Eyebrow,
  CARD_BORDER,
  CARD_SHADOW,
  CHEVRON,
  DASHBOARD_CANVAS,
  ROW_DIVIDER,
} from "./dashboard/DashboardParts";
import {
  buildGroupRows,
  buildNutritionTiles,
  buildPayrollRow,
  buildSpcTiles,
  groupSubline,
  nutritionSubline,
  spcSubline,
  TONE_INK,
} from "../../lib/programming/dashboardModel";
import { fonts, colors } from "../../lib/theme";

// Coach home at desk width (design_handoff_coach_dashboard, 2a).
//
// Same job as the phone, plus Needs You — which has the room to be worked
// here and doesn't on a phone.
//
// GONE, and deliberately not ported: the Resume hero, which guessed at
// intent and was usually wrong; the four launch cards, which were a menu
// duplicating the sidebar; and the roster count chips, which were the old
// headline and say nothing the modules don't.
//
// The canvas is darker than the phone's #faf8f6 on purpose. With this much
// white card area a near-white ground made everything float in one plane.

const CANVAS = DASHBOARD_CANVAS;
const MAX_WIDTH = 1240;
const LOOKUP_LIMIT = 12;

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

// Boise-local hour, so the greeting matches the gym's clock rather than
// whatever timezone the coach's laptop is set to.
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Boise", hour: "numeric", hour12: false }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// "Week of Sep 1" — the Monday the gym band's week figures are counted from.
function weekOfLabel(week) {
  if (!week?.weekStart) return null;
  const [, month, day] = week.weekStart.split("-").map(Number);
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Week of ${MONTH_SHORT[month - 1]} ${day}`;
}

/* ---------------------------------------------------------- header search */

// New on desktop: the client lookup used to be phone-only. Inline results
// rather than a modal — there is room for them here, and a dialog to type a
// name into is a step this width doesn't need.
function ClientSearch({ router }) {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState(null);

  useEffect(() => {
    // Only once the coach actually starts typing, so the roster isn't fetched
    // on every dashboard load for a field most visits never touch.
    if (!query.trim() || members) return;
    let cancelled = false;
    listMembers()
      .then((rows) => !cancelled && setMembers(rows))
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [query, members]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !members) return [];
    return members
      .filter((m) => (m.name ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q))
      .slice(0, LOOKUP_LIMIT);
  }, [members, query]);

  const open = query.trim().length > 0;

  return (
    <View style={{ width: 300 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: "white",
          borderWidth: 1,
          borderColor: CARD_BORDER,
          borderRadius: 11,
          paddingVertical: 11,
          paddingHorizontal: 13,
          ...CARD_SHADOW,
        }}
      >
        <Ionicons name="search-outline" size={17} color={colors.primary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find a client"
          placeholderTextColor={colors.hint}
          autoCorrect={false}
          autoCapitalize="none"
          style={{ flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 13.5, color: colors.text, outlineStyle: "none" }}
        />
        {open ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close" size={15} color={CHEVRON} />
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View
          style={{
            // Absolute so the results hang over the page rather than pushing
            // the payroll banner and the gym band down as you type.
            position: "absolute",
            top: 48,
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 4,
            maxHeight: 320,
            ...CARD_SHADOW,
          }}
        >
          {!members ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 14 }} />
          ) : rows.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, paddingVertical: 12 }}>
              No clients match "{query.trim()}".
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 312 }}>
              {rows.map((m) => (
                <SheetRow
                  key={m.id}
                  title={m.name ?? "Unnamed"}
                  detail={m.email}
                  onPress={() => {
                    setQuery("");
                    router.push(`/(coach)/clients/${m.id}`);
                  }}
                />
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- needs you */

// Kept exactly as it behaved before — severity order, verb button, dismiss ×
// — and moved to the right rail where the width suits a task list. The header
// is a dark band so it reads as the tasks rather than a fourth module.
function NeedsYou({ items, router, onDismiss }) {
  return (
    <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 16, overflow: "hidden", ...CARD_SHADOW }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.ink, paddingVertical: 14, paddingHorizontal: 18 }}>
        <Ionicons name="alert-circle" size={19} color="#e8a288" />
        <Text style={{ flex: 1, fontFamily: fonts.display, fontSize: 19, lineHeight: 21, color: "#f7f3ee" }}>Needs you</Text>
        {items.length > 0 ? (
          <View style={{ backgroundColor: "rgba(232,162,136,.18)", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: "#f0b79f" }}>{items.length}</Text>
          </View>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={{ padding: 22 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.text }}>Nothing's on fire.</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
            Every program is published and every check-in is read.
          </Text>
        </View>
      ) : (
        items.map((item, i) => (
          <View
            key={item.key}
            style={{
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: ROW_DIVIDER,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 18,
              paddingVertical: 13,
            }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: CARD_TONES[item.tone] ?? CARD_TONES.ok }} />
            <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => router.push(item.route)}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.text }}>{item.title}</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }}>{item.subtitle}</Text>
            </Pressable>
            <PressFade
              onPress={() => router.push(item.route)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 13 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#44403c" }}>{item.verb}</Text>
            </PressFade>
            <Pressable onPress={() => onDismiss(item)} hitSlop={8} style={{ paddingHorizontal: 2 }} accessibilityLabel="Dismiss">
              <Text style={{ color: CHEVRON, fontSize: 15 }}>×</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- payroll */

function PayrollRow({ row, router }) {
  return (
    <PressFade
      onPress={() => router.push(row.route)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 16,
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow color={colors.primaryOnWhite} style={{ letterSpacing: 1.4 }}>
          PAYROLL
        </Eyebrow>
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.muted, marginTop: 3 }}>{row.detail}</Text>
      </View>
      {row.figure ? (
        <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: TONE_INK[row.tone] ?? colors.text }}>
          {row.figure}
          {row.suffix ? <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>{row.suffix}</Text> : null}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={CHEVRON} />
    </PressFade>
  );
}

/* ------------------------------------------------------------------ page */

export function CoachHomeDesktop() {
  const router = useRouter();
  const [gymView, setGymView] = useState(null);
  const [sheet, setSheet] = useState(null);
  const { profile, stats, extras, dismissals, setDismissals, nutritionToday, loadError, reload: load } = useCoachDashboard();
  // Hooks, so they sit above the early returns.
  const canSpc = profile?.role === "admin" || Boolean(profile?.can_view_spc);
  const openHub = useOpenHubSession(canSpc);
  const { count: pendingDocuments, pending: pendingDocumentRows } = usePendingDocuments();
  const library = useLibraryReview();

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
  const canNutrition = isAdmin || Boolean(profile?.can_view_nutrition);

  const attentionItems = decorateAttentionItems(
    filterAttentionByPermission(filterDismissedItems(computeAttentionItems(stats), dismissals, todayInBoise()), profile)
  );

  const spcTiles = buildSpcTiles(stats);
  const nutritionTiles = buildNutritionTiles(stats, nutritionToday);
  const groupRows = buildGroupRows(stats);
  const payrollRow = buildPayrollRow({
    profile,
    payroll: safeExtras.payroll,
    closesOn: safeExtras.payroll ? weekdayOf(safeExtras.payroll.periodEnd) : null,
  });
  const notSeen = stats.nutritionNotSeen ?? [];

  const handleDismiss = (item) => {
    // Optimistic — the row goes immediately, the write follows. A failed
    // write just means the row is back on the next load, which is better than
    // the UI claiming a dismissal that didn't stick.
    setDismissals((prev) => ({ ...prev, [item.key]: { signature: item.signature, dismissedAt: new Date().toISOString() } }));
    dismissAttentionItem(item.key, item.signature, profile?.id).catch((err) => {
      console.error("Failed to dismiss attention item:", err);
    });
  };

  const openTile = (tile) => {
    if (tile.route) router.push(tile.route);
    else if (tile.sheet) setSheet(tile.sheet);
  };

  const go = (route) => {
    setSheet(null);
    router.push(route);
  };

  return (
    <CoachShell>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: CANVAS }}
        contentContainerStyle={{ paddingHorizontal: 36, paddingTop: 26, paddingBottom: 40 }}
      >
        <View style={{ maxWidth: MAX_WIDTH, width: "100%", gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 24, zIndex: 10 }}>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Eyebrow style={{ letterSpacing: 1.4 }}>{formatToday()}</Eyebrow>
              <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primary, lineHeight: 34, marginTop: 7 }}>
                {greeting()}, {profile?.name?.split(" ")[0] ?? "coach"}
              </Text>
            </View>
            <ClientSearch router={router} />
          </View>

          <FinalizePrompt prompt={safeExtras.finalizePrompt} />

          <GymBand
            gym={safeExtras.gym}
            wide
            note={[weekOfLabel(safeExtras.gym?.week), "every tile opens its list"].filter(Boolean).join(" · ")}
            onOpen={setGymView}
          />

          <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Left: the modules — the same three the phone shows, wider. */}
            <View style={{ flex: 1.55, minWidth: 420, gap: 16 }}>
              {canSpc ? (
                <ModuleCard wide>
                  <ModuleHeader
                    wide
                    icon="clipboard"
                    title="SPC"
                    subline={spcSubline(stats)}
                    linkLabel="Open SPC →"
                    onLink={() => router.push("/(coach)/spc")}
                  />
                  <SpcActionRow
                    wide
                    session={openHub}
                    stagedCount={safeExtras.stagedCount}
                    onPress={() => router.push(openHub ? "/(coach)/spc/live" : "/(coach)/spc/live?tab=start")}
                    onStageAnother={() => router.push("/(coach)/spc/live?staging=new")}
                  />
                  <SubTileRow wide tiles={spcTiles} onOpen={openTile} />
                </ModuleCard>
              ) : null}

              {canNutrition ? (
                <ModuleCard wide>
                  <ModuleHeader
                    wide
                    icon="restaurant"
                    title="Nutrition"
                    subline={nutritionSubline(stats)}
                    linkLabel="Open Nutrition →"
                    onLink={() => router.push("/(coach)/nutrition")}
                  />
                  <SubTileRow wide tiles={nutritionTiles} onOpen={openTile} />
                </ModuleCard>
              ) : null}

              <ModuleCard wide>
                <ModuleHeader
                  wide
                  icon="barbell"
                  title="Group"
                  subline={groupSubline(groupRows)}
                  linkLabel="Open the grid →"
                  onLink={() => router.push("/(coach)/blocks")}
                  divider={false}
                />
                {groupRows.length === 0 ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, paddingTop: 10 }}>
                    No group programs yet.
                  </Text>
                ) : (
                  groupRows.map((row, i) => (
                    <GroupProgramRow
                      key={row.key}
                      wide
                      row={row}
                      first={i === 0}
                      last={i === groupRows.length - 1}
                      onPress={() => router.push(row.route)}
                    />
                  ))
                )}
              </ModuleCard>
            </View>

            {/* Right: what needs doing, then the small stuff. */}
            <View style={{ flex: 1, minWidth: 320, gap: 16 }}>
              <NeedsYou items={attentionItems} router={router} onDismiss={handleDismiss} />

              {library.reviewer ? (
                <ModuleCard wide>
                  <ModuleHeader
                    wide
                    icon="checkmark-done"
                    title="Library review"
                    subline="You're a reviewer"
                    linkLabel="Open queue →"
                    onLink={() => router.push("/(coach)/exercises/review")}
                  />
                  <SubTileRow
                    wide
                    tiles={[
                        {
                          key: "pending",
                          figure: library.pendingCount,
                          label: "New exercises",
                          caption:
                            library.authorCount === null
                              ? ""
                              : `added by ${library.authorCount} coach${library.authorCount === 1 ? "" : "es"}`,
                          tone: library.pendingCount ? "warn" : "plain",
                          route: "/(coach)/exercises/review",
                        },
                        {
                          key: "dupes",
                          figure: library.dupeCount,
                          label: "Likely dupes",
                          caption: "merge or keep both",
                          tone: "plain",
                          route: "/(coach)/exercises/merge",
                        },
                    ]}
                    onOpen={openTile}
                  />
                </ModuleCard>
              ) : null}

              {pendingDocuments > 0 ? (
                <CountRow
                  wide
                  count={pendingDocuments}
                  title={`${pendingDocuments} to read & sign`}
                  subtitle={pendingDocumentRows.slice(0, 2).map((d) => d.title).join(" · ")}
                  onPress={() => router.push("/(coach)/documents")}
                />
              ) : null}

              <PayrollRow row={payrollRow} router={router} />
            </View>
          </View>
        </View>

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
      </ScrollView>
    </CoachShell>
  );
}
