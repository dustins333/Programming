import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, ActivityIndicator, Modal, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  getSpcRosterDetail,
  defaultCoachFilter,
  matchesCoachFilter,
  COACH_FILTER_MINE,
  COACH_FILTER_UNASSIGNED,
} from "../../lib/programming/spcRoster";
import { SPC_STATES, SPC_STATE_ORDER } from "../../lib/programming/spcState";
import { SpcSessionPreview } from "./SpcSessionPreview";
import { CoachShell } from "../CoachShell";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { fonts, colors, statusColors, type } from "../../lib/theme";
import { useAuth } from "../../lib/auth/AuthProvider";

// The coach's SPC page on a phone (design_handoff_spc_roster_v1).
//
// It answers two questions and nothing else: what state is everyone's
// program in, and what does this client's session actually say. The version
// before it grouped clients under status headings with a row of coach
// filter chips above, which meant finding one person by name was a scan of
// five groups, and the way into the live session was a text link sitting
// beside "Templates →".
//
// So: one flat list sorted by name (status moves inline, to the right of
// each row where it can be scanned down a column), filters move into a
// sheet where they can carry counts, and the live session gets the button
// it deserves.
//
// Lives here rather than in app/(coach)/spc/index.js so that index.web.js
// can render it below the mobile breakpoint. It CANNOT be imported from the
// route file: Metro applies platform-extension resolution to plain imports,
// not just routes, so `import … from "./index"` inside index.web.js
// resolves straight back to index.web.js — a self-import that silently
// keeps the desktop table on a phone. A component with no .web.js sibling
// has no such ambiguity.

const CANVAS = colors.canvas;
const CARD_BORDER = "#ece7e1";
const ROW_DIVIDER = "#f4f1ec";
const INPUT_BORDER = "#e2ddd6";
const ESPRESSO = "#33251f";
const ESPRESSO_TEXT = "#f7f3ee";
const ESPRESSO_SUB = "#a89a92";
const INK = "#2a211c";

function initials(name) {
  return (
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function firstNameOf(name) {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

function toneOf(state) {
  return statusColors[SPC_STATES[state]?.tone] ?? statusColors.paused;
}

/* ------------------------------------------------------------ live button */

// A slow ring breathing out from the dot. It rests as a ring exactly the
// size of the dot it sits behind, so if the animation never runs (a
// backgrounded tab, a headless render) the button still looks right rather
// than showing a stranded circle.
function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: "rgba(143,180,115,0.6)",
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
        }}
      />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#8fb473" }} />
    </View>
  );
}

// Reaching past boards must not depend on the live screen's own state. Only
// one board can be open gym-wide (0071), so a coach writing up the session she
// just ended is otherwise locked out the moment the next one starts.
function PastBoardsLink({ onPress }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel="Past boards"
      style={{ alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 }}
    >
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
        Past boards ›
      </Text>
    </PressFade>
  );
}

function LiveSessionsButton({ onPress }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel="SPC live sessions"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: ESPRESSO,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <LiveDot />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: ESPRESSO_TEXT }}>
          SPC Live Sessions
        </Text>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: ESPRESSO_SUB }}>
          Stage one, or start the board
        </Text>
      </View>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 18, color: ESPRESSO_SUB }}>
        ›
      </Text>
    </PressFade>
  );
}

/* ------------------------------------------------------------ filter sheet */

function FilterOption({ label, count, selected, tone, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 11,
        borderTopWidth: 1,
        borderTopColor: ROW_DIVIDER,
      }}
    >
      {tone ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} /> : null}
      <Text
        maxFontSizeMultiplier={1.2}
        style={{ flex: 1, fontFamily: selected ? fonts.sansBold : fonts.sansMedium, fontSize: 13.5, color: INK }}
      >
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
        {count}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ width: 14, fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>
        {selected ? "✓" : ""}
      </Text>
    </PressFade>
  );
}

function FilterSheet({ visible, onClose, searched, statusFilter, coachFilter, profileId, onStatus, onCoach, onClearAll, shownCount }) {
  // Counts are computed against the SEARCHED set, not the whole roster —
  // otherwise a sheet opened after typing a name offers "Ready 6" and then
  // shows one client.
  const statusCounts = useMemo(() => {
    const counts = {};
    for (const row of searched) counts[row.state] = (counts[row.state] ?? 0) + 1;
    return counts;
  }, [searched]);

  const coaches = useMemo(() => {
    const counts = new Map();
    for (const row of searched) {
      const key = row.coachId ?? COACH_FILTER_UNASSIGNED;
      if (!counts.has(key)) counts.set(key, { id: row.coachId ?? null, name: row.coachName, count: 0 });
      counts.get(key).count += 1;
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [searched]);

  // Offered only to someone who actually has clients here — for anyone else
  // it would just be a second, worse-named Unassigned.
  const mineCount = useMemo(
    () => (profileId ? searched.filter((r) => matchesCoachFilter(r, COACH_FILTER_MINE, profileId)).length : 0),
    [searched, profileId]
  );
  const offerMine = Boolean(profileId) && searched.some((r) => r.coachId === profileId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <PressFade
        onPress={onClose}
        pressedOpacity={1}
        accessibilityLabel="Close filters"
        style={{ flex: 1, backgroundColor: "rgba(42,33,28,0.4)", justifyContent: "flex-end" }}
      >
        {/* An inner non-closing press target: without it, a tap anywhere on
            the sheet bubbles to the backdrop and shuts it. */}
        <PressFade
          onPress={() => {}}
          pressedOpacity={1}
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: 26,
            maxHeight: "70%",
          }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#e0dbd4" }} />

          <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Eyebrow>Status</Eyebrow>
              <PressFade onPress={onClearAll} hitSlop={8}>
                <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>
                  Clear all
                </Text>
              </PressFade>
            </View>

            <FilterOption
              label="All statuses"
              count={searched.length}
              selected={!statusFilter}
              tone="#d6d1ca"
              onPress={() => onStatus(null)}
            />
            {SPC_STATE_ORDER.map((state) => (
              <FilterOption
                key={state}
                label={SPC_STATES[state].label}
                count={statusCounts[state] ?? 0}
                selected={statusFilter === state}
                tone={toneOf(state).text}
                onPress={() => onStatus(state)}
              />
            ))}

            <View style={{ marginTop: 18 }}>
              <Eyebrow>Coach</Eyebrow>
            </View>
            {offerMine ? (
              <FilterOption
                label="Mine + unassigned"
                count={mineCount}
                selected={coachFilter === COACH_FILTER_MINE}
                onPress={() => onCoach(COACH_FILTER_MINE)}
              />
            ) : null}
            <FilterOption label="All coaches" count={searched.length} selected={!coachFilter} onPress={() => onCoach(null)} />
            {coaches.map((c) => (
              <FilterOption
                key={c.id ?? COACH_FILTER_UNASSIGNED}
                label={c.name}
                count={c.count}
                selected={coachFilter === (c.id ?? COACH_FILTER_UNASSIGNED)}
                onPress={() => onCoach(c.id ?? COACH_FILTER_UNASSIGNED)}
              />
            ))}
          </ScrollView>

          <PressFade
            onPress={onClose}
            style={{ backgroundColor: ESPRESSO, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 6 }}
          >
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: ESPRESSO_TEXT }}>
              Show {shownCount} client{shownCount === 1 ? "" : "s"}
            </Text>
          </PressFade>
        </PressFade>
      </PressFade>
    </Modal>
  );
}

/* -------------------------------------------------------------------- row */

// Row anatomy from design_handoff_spc_rework_v1 (1e): tone-tinted initials,
// name with the full status pill beside it, a meta line
// "Terra · 2×/wk · 13d left" (the clock is date-derived and independent of
// queue state — see spcState.js), and the reason sentence under it. The meta
// line goes red on Due now so the urgent rows read down the list at a glance.
export function ClientRow({ row, first, onPress }) {
  const tone = toneOf(row.state);
  const meta = [firstNameOf(row.coachName) || row.coachName, `${row.sessionsPerWeek}×/wk`, row.clock]
    .filter(Boolean)
    .join(" · ");
  const urgent = row.state === "dueNow";

  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel={`${row.name}, ${SPC_STATES[row.state]?.label ?? row.state}`}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 11,
        paddingVertical: 13,
        paddingHorizontal: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: ROW_DIVIDER,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tone.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: tone.text }}>
          {initials(row.name)}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: INK }}>
            {row.name}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: tone.bg,
              borderRadius: 99,
              paddingVertical: 2.5,
              paddingHorizontal: 9,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.text }} />
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: tone.text }}>
              {SPC_STATES[row.state]?.label ?? row.state}
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}
          style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: 12, color: urgent ? tone.text : colors.muted }}
        >
          {meta}
        </Text>
        {row.reason ? (
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.1}
            style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}
          >
            {row.reason}
          </Text>
        ) : null}
      </View>

      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 16, color: colors.hint, marginTop: 4 }}>
        ›
      </Text>
    </PressFade>
  );
}

/* ------------------------------------------------------------------ screen */

export function SpcRosterMobile() {
  const router = useRouter();
  const { profile } = useAuth();
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [coachFilter, setCoachFilter] = useState(null);
  // Opens filtered to you when any of these clients are yours (the token
  // above the list says so, and clearing it is one tap). Applied once, after
  // the roster lands — this screen refetches on every focus, and without the
  // ref a coach who switched to All would have it put back on their way
  // back from a client's page.
  const coachDefaultApplied = useRef(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState(1);
  const [preview, setPreview] = useState(null);

  // The dashboard's SPC rows link here with ?status= ("Needs Printed" →
  // this page showing only those). This screen is a native tab and stays
  // mounted, so the initializer alone would miss a second arrival with a
  // different status.
  const params = useLocalSearchParams();
  // Old dashboard links can carry retired state keys (the pre-simplification
  // taxonomy) — an unknown key would filter everything to zero rows, so only
  // a current state name is accepted.
  const validStatus = (raw) => (typeof raw === "string" && SPC_STATES[raw] ? raw : null);
  const [statusFilter, setStatusFilter] = useState(validStatus(params.status));
  const appliedStatusParamRef = useRef(typeof params.status === "string" ? params.status : "");
  useEffect(() => {
    const raw = typeof params.status === "string" ? params.status : "";
    if (appliedStatusParamRef.current === raw) return;
    appliedStatusParamRef.current = raw;
    setStatusFilter(validStatus(raw));
  }, [params.status]);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful Retry
    // loaded the data but left the error screen up until the app restarted,
    // since the render branches on loadError alone.
    setLoadError(null);
    try {
      const loaded = await getSpcRosterDetail();
      setRoster(loaded);
      if (!coachDefaultApplied.current) {
        coachDefaultApplied.current = true;
        const mine = defaultCoachFilter(loaded, profile);
        if (mine) setCoachFilter(mine);
      }
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [profile]);

  // SPC tab's root screen — stays mounted on native while a coach drills
  // into a client and back (see spc/_layout.js's Stack comment), so this
  // needs to refetch on every focus, not just once at mount.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Search narrows first; both the count line and the sheet's counts are
  // computed against what's left, so the numbers always describe what a
  // coach is actually looking at.
  const searched = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => (r.name ?? "").toLowerCase().includes(q));
  }, [roster, search]);

  const filtered = useMemo(() => {
    const rows = searched.filter((r) => {
      if (statusFilter && r.state !== statusFilter) return false;
      if (!matchesCoachFilter(r, coachFilter, profile?.id)) return false;
      return true;
    });
    const byName = (a, b) => (a.name ?? "").localeCompare(b.name ?? "");
    const sorted = [...rows].sort((a, b) => {
      if (sort === "name") return byName(a, b);
      const rank = SPC_STATE_ORDER.indexOf(a.state) - SPC_STATE_ORDER.indexOf(b.state);
      if (rank !== 0) return rank;
      // Whoever runs out first inside a status. A row with no clock sorts
      // after the ones that have one rather than ahead of everything.
      const ad = a.daysLeft ?? Number.POSITIVE_INFINITY;
      const bd = b.daysLeft ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return byName(a, b);
    });
    return dir === 1 ? sorted : sorted.reverse();
  }, [searched, statusFilter, coachFilter, sort, dir, profile?.id]);

  // "2 need programming" counts clients whose PROGRAM is running out (due
  // soon/now with something currently running) — deliberately not the
  // never-programmed, who would otherwise make this read "53 need
  // programming" for as long as the migration-onto-the-app cohort lasts.
  // They're still red in the list itself.
  const needProgramming = useMemo(
    () => searched.filter((r) => (r.state === "dueSoon" || r.state === "dueNow") && r.block).length,
    [searched]
  );

  const activeFilterCount = (statusFilter ? 1 : 0) + (coachFilter ? 1 : 0);
  const coachFilterName = useMemo(() => {
    if (!coachFilter) return null;
    if (coachFilter === COACH_FILTER_MINE) return "Mine + unassigned";
    return roster?.find((r) => (r.coachId ?? COACH_FILTER_UNASSIGNED) === coachFilter)?.coachName ?? "Coach";
  }, [coachFilter, roster]);

  const toggleSort = (key) => {
    if (sort === key) setDir((d) => -d);
    else {
      setSort(key);
      setDir(1);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center" }}>
            Something went wrong loading the SPC roster: {loadError}
          </Text>
          <PressFade onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </View>
      </CoachShell>
    );
  }

  if (!roster) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView
        style={{ flex: 1, backgroundColor: CANVAS }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 20, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 27, color: colors.primary }}>
            SPC
          </Text>
          <PressFade onPress={() => router.push("/(coach)/templates")} hitSlop={8}>
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
              Templates ›
            </Text>
          </PressFade>
        </View>

        <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
          {searched.length} client{searched.length === 1 ? "" : "s"}
          {needProgramming > 0 ? ` · ${needProgramming} need programming` : ""}
        </Text>

        <View style={{ marginTop: 14 }}>
          <LiveSessionsButton onPress={() => router.push("/(coach)/spc/live")} />
          <PastBoardsLink onPress={() => router.push("/(coach)/spc/sessions")} />
        </View>

        {roster.length === 0 ? (
          <Text style={{ marginTop: 20, fontFamily: fonts.sans, fontSize: 13.5, color: colors.muted }}>
            No SPC clients yet. Assign one from the Clients page.
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search clients"
                placeholderTextColor={colors.hint}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 40,
                  backgroundColor: "#fff",
                  borderWidth: 1,
                  borderColor: INPUT_BORDER,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: INK,
                }}
              />
              <PressFade
                onPress={() => setSheetOpen(true)}
                accessibilityLabel="Filter clients"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  height: 40,
                  paddingHorizontal: 13,
                  backgroundColor: "#fff",
                  borderWidth: 1,
                  borderColor: INPUT_BORDER,
                  borderRadius: 10,
                }}
              >
                <Ionicons name="filter-outline" size={14} color="#57534e" />
                <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>
                  Filter
                </Text>
                {activeFilterCount > 0 ? (
                  <View
                    style={{
                      minWidth: 17,
                      height: 17,
                      borderRadius: 9,
                      paddingHorizontal: 4,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#fff" }}>
                      {activeFilterCount}
                    </Text>
                  </View>
                ) : null}
              </PressFade>
            </View>

            {activeFilterCount > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                {statusFilter ? (
                  <FilterToken label={SPC_STATES[statusFilter]?.label ?? statusFilter} onClear={() => setStatusFilter(null)} />
                ) : null}
                {coachFilter ? <FilterToken label={coachFilterName} onClear={() => setCoachFilter(null)} /> : null}
              </View>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingTop: 14, paddingBottom: 8 }}>
              <Eyebrow>Sort</Eyebrow>
              <SortLink label="Name" active={sort === "name"} dir={dir} onPress={() => toggleSort("name")} />
              <View style={{ flex: 1 }} />
              <SortLink label="Status" active={sort === "status"} dir={dir} onPress={() => toggleSort("status")} />
            </View>

            <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
              {filtered.length === 0 ? (
                <Text style={{ padding: 16, fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
                  No clients match your search or filters.
                </Text>
              ) : (
                filtered.map((row, i) => (
                  <ClientRow key={row.userId} row={row} first={i === 0} onPress={() => setPreview(row)} />
                ))
              )}
            </View>

            <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 12, fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
              Status comes from the current program's end date. No one sets it by hand.
            </Text>
          </>
        )}
      </ScrollView>

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        searched={searched}
        statusFilter={statusFilter}
        coachFilter={coachFilter}
        profileId={profile?.id}
        shownCount={filtered.length}
        onStatus={(s) => setStatusFilter((cur) => (cur === s ? null : s))}
        onCoach={(c) => setCoachFilter((cur) => (cur === c ? null : c))}
        onClearAll={() => {
          setStatusFilter(null);
          setCoachFilter(null);
        }}
      />

      <SpcSessionPreview client={preview} visible={Boolean(preview)} onClose={() => setPreview(null)} />
    </CoachShell>
  );
}

function FilterToken({ label, onClear }) {
  return (
    <PressFade
      onPress={onClear}
      accessibilityLabel={`Clear filter ${label}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: ESPRESSO,
        borderRadius: 99,
        paddingVertical: 5,
        paddingHorizontal: 11,
      }}
    >
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: ESPRESSO_TEXT }}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: ESPRESSO_SUB }}>
        ×
      </Text>
    </PressFade>
  );
}

function SortLink({ label, active, dir, onPress }) {
  return (
    <PressFade onPress={onPress} hitSlop={8}>
      <Text
        maxFontSizeMultiplier={1.15}
        style={{
          fontFamily: active ? fonts.sansBold : fonts.sansSemiBold,
          fontSize: 12.5,
          color: active ? INK : colors.muted,
        }}
      >
        {label}
        {active ? (dir === 1 ? " ↓" : " ↑") : ""}
      </Text>
    </PressFade>
  );
}
