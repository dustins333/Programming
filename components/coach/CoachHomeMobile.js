import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { todayInBoise } from "../../lib/boiseDate";
import { computeAttentionItems, filterDismissedItems } from "../../lib/programming/coachDashboard";
import { decorateAttentionItems, filterAttentionByPermission, CARD_TONES } from "../../lib/programming/launchpad";
import { dismissAttentionItem } from "../../lib/programming/dashboardDismissals";
import { useCoachDashboard } from "../../lib/programming/useCoachDashboard";
import { listMembers } from "../../lib/programming/clients";
import { formatDateMDY } from "../../lib/formatDate";
import { CoachShell } from "../CoachShell";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// Coach home on a phone — the mobile web (PWA) build and the native app both
// land here. This is NOT the desktop screen reflowed; it answers a different
// question.
//
// A coach opens this between clients, on the gym floor, standing up. So:
//
//   - The pulse band reads today's gym in three numbers and is deliberately
//     INERT. It's a glance, not a task list.
//   - Then the one thing worth doing from a phone more than anything else:
//     pull up a client.
//   - Then four square cards, one per area of the gym. Each carries a count,
//     and opens a sheet listing the actual people or programs behind that
//     count — every row of which navigates. A number you can't drill into is
//     just decoration.
//   - Resume is deliberately absent. Desktop leads with "get back into the
//     session you were editing"; nobody builds programs on a phone.
//   - So is Quiet 7+ days, and every other watchlist figure. See
//     computeAttentionItems — a rolling number nobody is sitting and
//     watching is noise on a screen this small. It lives on the Clients
//     roster as a filter chip, where you go looking for it.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const BAND_BG = "#33251f";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.045, shadowRadius: 14 };

function greeting() {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Boise", hour: "2-digit", hour12: false }));
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function formatToday() {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/Boise", weekday: "long", month: "short", day: "numeric" });
}

// 47,250 -> "47.3k". Volume runs to six figures on a busy day and the exact
// pound count is not the point — the order of magnitude is.
function compactNumber(n) {
  if (n === null || n === undefined) return null;
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function roundWeight(w) {
  return w === null || w === undefined ? null : Math.round(w * 10) / 10;
}

/* ------------------------------------------------------------- pulse band */

// A figure that failed to load renders as an em-dash, never 0 — a broken
// query must not be able to say "0 sessions logged", which is a number a
// coach would act on. getGymToday returns null for exactly this reason.
function PulseFigure({ value, label }) {
  const missing = value === null || value === undefined;
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 26, color: missing ? "rgba(247,243,238,.35)" : "#f7f3ee", lineHeight: 30 }}>
        {missing ? "—" : value}
      </Text>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "rgba(247,243,238,.62)", textAlign: "center", marginTop: 3, letterSpacing: 0.4 }}
      >
        {label}
      </Text>
    </View>
  );
}

// Nutrition used to hold the middle slot; it earned a card of its own, so
// this is three pure training figures now. Volume is the one that says
// something the other two can't — five sessions is five sessions whether it
// was a deload or a heavy day.
function PulseBand({ gym }) {
  return (
    <View style={{ backgroundColor: BAND_BG, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 12, overflow: "hidden" }}>
      {/* Corner warmth only. The desktop hero uses a 190px blob, but this
          band is ~347 wide — at that size the circle covered the whole third
          column and read as a hard-edged block, not a glow. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", right: -62, top: -74, width: 132, height: 132, borderRadius: 99, backgroundColor: "rgba(190,172,149,.07)" }}
      />
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "rgba(247,243,238,.5)", marginBottom: 11 }}
      >
        TODAY IN THE GYM
      </Text>
      <View style={{ flexDirection: "row" }}>
        <PulseFigure value={gym?.sessions} label="sessions logged" />
        <View style={{ width: 1, backgroundColor: "rgba(247,243,238,.13)" }} />
        <PulseFigure value={compactNumber(gym?.volume)} label="lb lifted" />
        <View style={{ width: 1, backgroundColor: "rgba(247,243,238,.13)" }} />
        <PulseFigure value={gym?.prs} label={gym?.prs === 1 ? "new PR" : "new PRs"} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- stat cards */

// Square, two per row.
//
// `tone` accents the border and icon so a card reads as needing attention
// without being opened — but it only colours the COUNT when `countIsIssue`
// says the number itself is the problem. On SPC, 3 means three clients in
// trouble and red is the truth. On Group, 3 is how many programs exist, and
// on Payroll it's how many people are in; painting those amber said "3 bad
// things" about a number that isn't a count of bad things at all.
//
// `hideCount` drops the number entirely, for a card that is purely a button
// (a non-admin's Payroll card, which deliberately carries no figures — see
// the payroll section of the page below).
function StatCard({ icon, label, count, caption, tone, countIsIssue, hideCount, onPress }) {
  const missing = count === null || count === undefined;
  const accent = tone && tone !== "ok" ? CARD_TONES[tone] : null;
  const countColor = missing ? "#c9c4bd" : countIsIssue && accent ? accent : "#2a211c";
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexGrow: 1,
        flexBasis: "47%",
        minWidth: 150,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: accent ?? CARD_BORDER,
        borderRadius: 16,
        padding: 14,
        minHeight: 132,
        justifyContent: "space-between",
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Ionicons name={icon} size={18} color={accent ?? colors.primary} />
        <Ionicons name="chevron-forward" size={15} color="#c9c4bd" />
      </View>
      <View>
        {hideCount ? null : (
          <Text style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: countColor }}>
            {missing ? "—" : count}
          </Text>
        )}
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c", marginTop: 1 }}>
          {label}
        </Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginTop: 2 }}>
          {caption}
        </Text>
      </View>
    </PressFade>
  );
}

/* ------------------------------------------------------------------ sheets */

// `footerLabel`/`onFooterPress` render a pinned link below the list — the
// "just take me to the whole module" escape hatch, so a sheet is never a
// dead end when the thing you want isn't one of the listed rows. Outside the
// ScrollView so a long list can't push it off the bottom.
function Sheet({ visible, onClose, title, subtitle, footerLabel, onFooterPress, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            backgroundColor: CANVAS,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 26,
            maxHeight: "85%",
          }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 99, backgroundColor: "#dcd6ce", marginBottom: 14 }} />
          <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.primary }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 2 }}>{subtitle}</Text>
          ) : null}
          <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footerLabel ? (
            <PressFade
              onPress={onFooterPress}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: 12,
                paddingVertical: 13,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: "#fdf6f2",
              }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}>{footerLabel}</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.primaryOnWhite} />
            </PressFade>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Every row in every sheet navigates — that's the point of opening one.
function SheetRow({ title, detail, trailing, tone, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}
    >
      {tone ? <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: CARD_TONES[tone] ?? CARD_TONES.ok }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: "#2a211c" }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 1 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>{trailing}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color="#c9c4bd" />
    </PressFade>
  );
}

function SheetEmpty({ children }) {
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#78716c", paddingVertical: 16 }}>{children}</Text>
  );
}

/* ----------------------------------------------------------- client lookup */

// The phone-only affordance the desktop dashboard has no equivalent of, and
// the reason it sits directly under the band rather than among the cards:
// looking someone up is the single most common thing to want on a gym floor.
function ClientLookupSheet({ visible, onClose, router }) {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const open = async () => {
    if (members) return;
    setLoadError(null);
    try {
      setMembers(await listMembers());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  };

  const results = useMemo(() => {
    if (!members) return [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? members.filter((m) => (m.name ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q))
      : members;
    return rows.slice(0, 25);
  }, [members, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} onShow={open}>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{ backgroundColor: CANVAS, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 26, maxHeight: "85%" }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 99, backgroundColor: "#dcd6ce", marginBottom: 14 }} />
          <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.primary, marginBottom: 10 }}>Find a client</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name or email"
            placeholderTextColor="#a8a29e"
            autoCorrect={false}
            style={{
              fontFamily: fonts.sans,
              fontSize: 15,
              backgroundColor: "white",
              borderWidth: 1,
              borderColor: CARD_BORDER,
              borderRadius: 12,
              paddingHorizontal: 13,
              paddingVertical: 11,
              color: "#2a211c",
            }}
          />
          <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled">
            {loadError ? (
              <Text style={{ fontFamily: fonts.sans, color: "#b23a22", paddingVertical: 10 }}>Couldn't load clients: {loadError}</Text>
            ) : !members ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 14 }} />
            ) : results.length === 0 ? (
              <SheetEmpty>No clients match "{query.trim()}".</SheetEmpty>
            ) : (
              results.map((m) => (
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

/* -------------------------------------------------------------- roster strip */

function RosterChip({ label, value, accent, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: accent ? colors.primary : CARD_BORDER,
        backgroundColor: accent ? "#fdf6f2" : "white",
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 13,
      }}
    >
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 12, color: accent ? colors.primaryOnWhite : "#44403c" }}>
        {label} <Text style={{ fontFamily: fonts.sansBold, color: accent ? colors.primaryOnWhite : "#2a211c" }}>{value}</Text>
      </Text>
    </PressFade>
  );
}

/* --------------------------------------------------------------------- page */

export function CoachHomeMobile() {
  const router = useRouter();
  const [lookupOpen, setLookupOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // "nutrition" | "spc" | "group" | "payroll"
  const { profile, stats, extras, dismissals, setDismissals, nutritionToday, loadError, reload: load } = useCoachDashboard();

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

  const safeExtras = extras ?? { blocks: [], resume: null, gym: {}, coachCount: 0, payroll: null };
  const attentionItems = decorateAttentionItems(
    filterAttentionByPermission(filterDismissedItems(computeAttentionItems(stats), dismissals, todayInBoise()), profile)
  );

  const isAdmin = profile?.role === "admin";
  const canSpc = isAdmin || Boolean(profile?.can_view_spc);
  const canNutrition = isAdmin || Boolean(profile?.can_view_nutrition);

  const spcIssues = stats.spcIssues ?? [];
  const groupPrograms = stats.groupDashboard ?? [];
  const groupIssueCount = groupPrograms.filter((p) => p.unpublishedThisWeek || !p.hasActiveBlock).length;
  const payroll = safeExtras.payroll;
  const payrollOutstanding = (payroll?.staffStatus ?? []).filter((s) => !s.submitted);

  const handleDismiss = (item) => {
    // Optimistic — the row goes immediately, the write follows. A failed
    // write just means the row is back on the next load, which is better
    // than the UI claiming a dismissal that didn't stick.
    setDismissals((prev) => ({ ...prev, [item.key]: { signature: item.signature, dismissedAt: new Date().toISOString() } }));
    dismissAttentionItem(item.key, item.signature, profile?.id).catch((err) => {
      console.error("Failed to dismiss attention item:", err);
    });
  };

  const goToClients = (programParam) =>
    router.push(programParam ? `/(coach)/clients?program=${programParam}` : "/(coach)/clients");

  const go = (route) => {
    setSheet(null);
    router.push(route);
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerStyle={{ padding: 14, paddingBottom: 34, gap: 14 }}>
        <View>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a8a29e" }}>
            {formatToday().toUpperCase()}
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 25, color: colors.primary, lineHeight: 29, marginTop: 3 }}>
            {greeting()}, {profile?.name?.split(" ")[0] ?? "coach"}
          </Text>
        </View>

        <PulseBand gym={safeExtras.gym} />

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
            paddingVertical: 14,
            paddingHorizontal: 14,
            ...CARD_SHADOW,
          }}
        >
          <Ionicons name="search-outline" size={19} color={colors.primary} />
          <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: "#2a211c" }}>Find a client</Text>
          <Ionicons name="chevron-forward" size={16} color="#c9c4bd" />
        </PressFade>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 11 }}>
          {canNutrition ? (
            <StatCard
              icon="restaurant-outline"
              label="Nutrition"
              count={nutritionToday ? nutritionToday.loggedCount : null}
              caption={nutritionToday ? `of ${nutritionToday.totalCount} logged today` : "Couldn't load"}
              onPress={() => setSheet("nutrition")}
            />
          ) : null}
          {canSpc ? (
            <StatCard
              icon="barbell-outline"
              label="SPC"
              count={spcIssues.length}
              caption={spcIssues.length === 0 ? "Everyone covered" : "need attention"}
              tone={spcIssues.some((i) => i.severity <= 1) ? "urgent" : spcIssues.length ? "warn" : "ok"}
              countIsIssue
              onPress={() => setSheet("spc")}
            />
          ) : null}
          <StatCard
            icon="calendar-outline"
            label="Group"
            count={groupPrograms.length}
            caption={
              groupPrograms.length === 0
                ? "No programs yet"
                : groupIssueCount === 0
                  ? "All published"
                  : `${groupIssueCount} need${groupIssueCount === 1 ? "s" : ""} attention`
            }
            tone={groupIssueCount ? "warn" : "ok"}
            onPress={() => setSheet("group")}
          />
          {/* Admin gets the team's submission state and a sheet naming who's
              still out. A coach gets a plain button straight to their own
              entry screen and NO figures at all — the whole point of the
              split is that the rest of the team's payroll isn't a coach's
              business, so there's nothing here to open. */}
          {isAdmin ? (
            <StatCard
              icon="cash-outline"
              label="Payroll"
              count={payroll ? payroll.submittedCount : null}
              caption={payroll ? `of ${payroll.staffCount} submitted` : "Couldn't load"}
              tone={payrollOutstanding.length ? "warn" : "ok"}
              onPress={() => setSheet("payroll")}
            />
          ) : (
            <StatCard
              icon="cash-outline"
              label="Log payroll"
              hideCount
              caption="Add your hours for this period"
              onPress={() => router.push("/(coach)/payroll/entries")}
            />
          )}
        </View>

        {attentionItems.length ? (
          <View style={{ gap: 9 }}>
            {attentionItems.map((item) => (
              <View
                key={item.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "white",
                  borderWidth: 1,
                  borderColor: CARD_BORDER,
                  borderRadius: 14,
                  ...CARD_SHADOW,
                }}
              >
                <PressFade
                  onPress={() => router.push(item.route)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13, paddingHorizontal: 14, minHeight: 60 }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: CARD_TONES[item.tone] ?? CARD_TONES.ok }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#2a211c" }}>
                      {item.title}
                    </Text>
                    <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 2 }}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#c9c4bd" />
                </PressFade>
                <Pressable onPress={() => handleDismiss(item)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }} style={{ paddingRight: 12, paddingLeft: 2 }}>
                  <Ionicons name="close" size={16} color="#c9c4bd" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <RosterChip label="Total" value={stats.totalMembers} onPress={() => goToClients(null)} />
          <RosterChip label="Flagship" value={stats.flagshipCount} onPress={() => stats.flagshipProgramId && goToClients(stats.flagshipProgramId)} />
          <RosterChip label="BWA" value={stats.bwaCount} onPress={() => stats.bwaProgramId && goToClients(stats.bwaProgramId)} />
          <RosterChip label="SPC" value={stats.spcCount} onPress={() => goToClients("spc")} />
          <RosterChip label="Nutrition" value={stats.nutritionCount} onPress={() => goToClients("nutrition")} />
          {stats.unassignedCount > 0 ? (
            <RosterChip label="Unassigned" value={stats.unassignedCount} accent onPress={() => goToClients("unassigned")} />
          ) : null}
        </View>
      </ScrollView>

      <ClientLookupSheet visible={lookupOpen} onClose={() => setLookupOpen(false)} router={router} />

      <Sheet
        visible={sheet === "nutrition"}
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
        {!nutritionToday ? (
          <SheetEmpty>Couldn't load today's nutrition.</SheetEmpty>
        ) : nutritionToday.rows.length === 0 ? (
          <SheetEmpty>No one has logged anything yet today.</SheetEmpty>
        ) : (
          nutritionToday.rows.map((r) => {
            // 7-day average sits next to today's number so one weigh-in
            // reads against the trend instead of on its own. "still logging"
            // only shows on open days — it explains why a number might
            // still move, where "finalized" on the rest would just be noise.
            const avg = r.avgWeight !== null ? `7-day avg ${roundWeight(r.avgWeight)} lb` : "No weight logged this week";
            return (
              <SheetRow
                key={r.userId}
                title={r.name}
                detail={r.finalized ? avg : `${avg} · still logging`}
                trailing={r.weightToday !== null ? `${roundWeight(r.weightToday)} lb` : "—"}
                onPress={() => go(`/(coach)/nutrition/clients/${r.userId}`)}
              />
            );
          })
        )}
      </Sheet>

      <Sheet
        visible={sheet === "spc"}
        onClose={() => setSheet(null)}
        title="SPC attention"
        subtitle={spcIssues.length ? "Worst first" : null}
        footerLabel="Open SPC"
        onFooterPress={() => go("/(coach)/spc")}
      >
        {spcIssues.length === 0 ? (
          <SheetEmpty>Every SPC client has a current block. Nothing to do.</SheetEmpty>
        ) : (
          spcIssues.map((c) => (
            <SheetRow
              key={c.userId}
              tone={c.severity <= 1 ? "urgent" : "warn"}
              title={c.name}
              detail={c.coachName ? `${c.reason} · ${c.coachName}` : c.reason}
              onPress={() => go(`/(coach)/spc/${c.userId}`)}
            />
          ))
        )}
      </Sheet>

      <Sheet
        visible={sheet === "group"}
        onClose={() => setSheet(null)}
        title="Group programs"
        footerLabel="Open Group Programs"
        onFooterPress={() => go("/(coach)/blocks")}
      >
        {groupPrograms.length === 0 ? (
          <SheetEmpty>No group programs yet.</SheetEmpty>
        ) : (
          groupPrograms.map((p) => {
            const bits = [];
            if (!p.hasActiveBlock) bits.push("No active block");
            else if (p.daysUntilEnd !== null)
              bits.push(`${p.daysUntilEnd} day${p.daysUntilEnd === 1 ? "" : "s"} left in block`);
            if (p.unpublishedThisWeek) bits.push("this week unpublished");
            else if (p.unpublishedNextWeek) bits.push("next week unpublished");
            if (p.hasActiveBlock && !p.hasNextWeekBlock) bits.push("nothing queued after");
            return (
              <SheetRow
                key={p.programId}
                tone={p.unpublishedThisWeek || !p.hasActiveBlock ? "urgent" : p.unpublishedNextWeek ? "warn" : "ok"}
                title={p.name}
                detail={bits.join(" · ")}
                onPress={() => go(`/(coach)/blocks?program=${p.programId}`)}
              />
            );
          })
        )}
      </Sheet>

      {/* Admin-only. A coach's Payroll card navigates directly and never
          opens this. */}
      <Sheet
        visible={sheet === "payroll"}
        onClose={() => setSheet(null)}
        title="Payroll"
        subtitle={payroll ? `Period ends ${formatDateMDY(payroll.periodEnd)}` : null}
        footerLabel="Review this period"
        // Report, not the This-period review table. Report computes totals
        // live off the entries (computeTotalsByStaff), so it answers "how
        // much has been keyed so far" — which is the number worth glancing
        // at mid-period. The review table leads with approval state, and an
        // approved total says nothing about what's still coming in.
        onFooterPress={() => go("/(coach)/payroll/admin/report")}
      >
        {!payroll ? (
          <SheetEmpty>Couldn't load this pay period.</SheetEmpty>
        ) : (payroll.staffStatus ?? []).length === 0 ? (
          <SheetEmpty>No staff to review.</SheetEmpty>
        ) : (
          // Every row goes to the review table, not to an entry screen — an
          // admin looking at who's outstanding wants to approve or chase,
          // not to log hours.
          payroll.staffStatus.map((s) => (
            <SheetRow
              key={s.id}
              tone={s.submitted ? "ok" : "warn"}
              title={s.name}
              detail={s.submitted ? "Submitted" : "Not submitted yet"}
              onPress={() => go("/(coach)/payroll/admin/periods")}
            />
          ))
        )}
      </Sheet>
    </CoachShell>
  );
}
