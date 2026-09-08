import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  getSpcRosterDetail,
  describeLastSession,
  defaultCoachFilter,
  matchesCoachFilter,
  COACH_FILTER_MINE,
  COACH_FILTER_UNASSIGNED,
} from "../../../lib/programming/spcRoster";
import { CoachShell, MOBILE_BREAKPOINT } from "../../../components/CoachShell";
import { SpcRosterMobile } from "../../../components/coach/SpcRosterMobile";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors, statusColors } from "../../../lib/theme";
import { SPC_STATES, SPC_STATE_ORDER, monthDay } from "../../../lib/programming/spcState";
import { formatDateRange } from "../../../lib/formatDate";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  readRosterView,
  saveRosterView,
  useRosterScrollRestore,
  SPC_ROSTER_VIEW,
} from "../../../lib/rosterViewState";

// SPC roster, coach web (design_handoff_spc_rework_v1, 1g).
//
// Four derived statuses, A–Z by name by default — replacing the old
// sort-by-time-remaining default, which Terra asked to drop. CLIENT and
// STATUS are the two sortable headers; STATUS sorts by urgency (Due now →
// Due soon → Good to go → Paused, name as the tiebreak) and clicking the
// active header flips direction, same toggle the phone roster uses.
//
// The COVERAGE column is gone: with no per-week authoring there is no draft
// or empty session to count, so the stacked bar had nothing left to measure.
// Status + reason take its place. Colors read from theme.statusColors — the
// drifted local TONE_STYLES copy this file used to carry is deleted.
//
// The coach filter OPENS on "Mine + unassigned" when any of these clients
// are assigned to you, and on All otherwise. Unassigned rides along with
// yours deliberately: nobody owns those, so a strictly-mine default is how
// one of them goes unnoticed by everybody. Nothing is hidden by it either
// way: any coach can still
// see the whole roster (covering for someone shouldn't need an admin), the
// dropdown names who it's filtered to, and All is one click away. Search
// matches on name only, and search + chips + coach compose (search first,
// then filter).

const CARD_BORDER = colors.coachCardBorder;
const CANVAS = colors.coachCanvas;

const NEXT_STEP_STYLES = {
  urgent: { bg: colors.primary, border: colors.primary, text: "#fff" },
  needsAction: { bg: "#fff", border: "#d9d4cd", text: "#44403c" },
  quiet: { bg: "#fff", border: "#d9d4cd", text: "#78716c" },
};

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
}

function StatusChip({ label, count, active, tone, onPress }) {
  const style = statusColors[tone] ?? statusColors.paused;
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 99,
        backgroundColor: active ? "#33251f" : style.bg,
        borderWidth: 1,
        borderColor: active ? "#33251f" : "transparent",
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: active ? "#f7f3ee" : style.text }}>{label}</Text>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: active ? "#f7f3ee" : style.text, opacity: 0.75 }}>
        {count}
      </Text>
    </PressFade>
  );
}

function HeaderCell({ children, width, flex, align = "left", sortable = false, active = false, dir = 1, onPress }) {
  const label = (
    <Eyebrow style={{ textAlign: align, color: active ? "#57534e" : "#a8a29e" }}>
      {children}
      {active ? (dir === 1 ? " ↓" : " ↑") : ""}
    </Eyebrow>
  );
  if (!sortable) return <View style={{ width, flex, paddingHorizontal: 10 }}>{label}</View>;
  return (
    <PressFade onPress={onPress} style={{ width, flex, paddingHorizontal: 10 }}>
      {label}
    </PressFade>
  );
}

// "Aug 3 – Sep 12" over "week 5 of 6" — the CURRENT PROGRAM cell. The
// sub-line names where in the program she is; ends-today and final-week get
// called out in words because that's exactly when a coach is scanning for
// them.
function programCell(row) {
  if (row.status === "paused") return { main: "Paused", sub: null, mainMuted: true };
  if (!row.block) return { main: "None", sub: row.enrolledAt ? `enrolled ${monthDay(row.enrolledAt)}` : null, mainMuted: true };
  if (row.ongoing) return { main: `Since ${monthDay(row.block.block_start_date)}`, sub: "ongoing", mainMuted: false };
  const main = formatDateRange(row.block.block_start_date, row.block.block_end_date);
  let sub;
  if (row.daysLeft != null && row.daysLeft < 0) sub = `ended ${monthDay(row.block.block_end_date)}`;
  else if (row.daysLeft === 0) sub = "ends today";
  else if (row.daysLeft != null && row.daysLeft <= 6) sub = "final week";
  else sub = `week ${row.weekNumber} of ${row.blockLengthWeeks}`;
  return { main, sub, mainMuted: false };
}

function ClientRow({ row, onOpen, onNextStep, last }) {
  const toneStyle = statusColors[row.tone] ?? statusColors.paused;
  const step = row.nextStep;
  const program = programCell(row);

  return (
    <PressFade
      onPress={() => onOpen(row.userId)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: "#f4f1ec",
      }}
    >
      {/* Client */}
      <View style={{ flex: 1.6, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 10, minWidth: 0 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 99,
            backgroundColor: toneStyle.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: toneStyle.text }}>{initials(row.name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#2a211c" }} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }} numberOfLines={1}>
            Coach: {row.coachName} · {row.sessionsPerWeek}× a week
          </Text>
        </View>
      </View>

      {/* Current program */}
      <View style={{ flex: 1.2, paddingHorizontal: 10, minWidth: 0 }}>
        <Text
          style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: program.mainMuted ? "#a8a29e" : "#2a211c" }}
          numberOfLines={1}
        >
          {program.main}
        </Text>
        {program.sub ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }} numberOfLines={1}>
            {program.sub}
          </Text>
        ) : null}
      </View>

      {/* Status: pill + the derived reason */}
      <View style={{ flex: 1.9, paddingHorizontal: 10, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: toneStyle.bg,
            borderRadius: 99,
            paddingVertical: 4,
            paddingHorizontal: 11,
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneStyle.text }} />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: toneStyle.text }}>{row.label}</Text>
        </View>
        <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", minWidth: 0 }} numberOfLines={1}>
          {row.reason}
        </Text>
      </View>

      {/* Last session */}
      <View style={{ width: 116, paddingHorizontal: 10 }}>
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: 12.5,
            color: row.lastSessionAt ? "#57534e" : "#c9c4bd",
          }}
          numberOfLines={1}
        >
          {describeLastSession(row.lastSessionAt)}
        </Text>
      </View>

      {/* Next step */}
      <View style={{ width: 186, paddingHorizontal: 10, alignItems: "flex-end" }}>
        {step ? (
          <PressFade
            onPress={() => onNextStep(row)}
            style={{
              backgroundColor: NEXT_STEP_STYLES[step.tone].bg,
              borderWidth: 1,
              borderColor: NEXT_STEP_STYLES[step.tone].border,
              borderRadius: 9,
              paddingVertical: 8,
              paddingHorizontal: 13,
            }}
          >
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: NEXT_STEP_STYLES[step.tone].text }}>
              {step.label}
            </Text>
          </PressFade>
        ) : (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#c9c4bd" }}>Nothing due</Text>
        )}
      </View>
    </PressFade>
  );
}

function SpcRosterDesktop() {
  const router = useRouter();
  const { profile } = useAuth();
  const params = useLocalSearchParams();
  const rawStatusParam = typeof params.status === "string" ? params.status : "";
  const rawCoachParam = typeof params.coach === "string" ? params.coach : "";
  // Status and coach are ONE deep link from the dashboard, not two
  // independent questions — same joined signature the Clients roster uses.
  // Asking separately is how a link that changes only the coach gets treated
  // as already handled.
  const linkParam = `${rawStatusParam}|${rawCoachParam}`;

  // Where this coach was last time they were on this screen, this session.
  // Web pushes /spc/<userId> as a new screen and unmounts this one, so without
  // this every filter, the search and the scroll position are rebuilt from
  // defaults on the way back — see lib/rosterViewState.js.
  const [savedView] = useState(() => readRosterView(SPC_ROSTER_VIEW));
  // A dashboard link carrying a status this screen hasn't reconciled yet is a
  // deliberate "show me these" and outranks anything remembered. Coming back
  // from a client's page re-enters on the same URL, which is not that.
  const statusParamIsNew = !savedView || savedView.statusParam !== linkParam;
  // Old dashboard links can carry retired state keys — an unknown key would
  // filter everything to zero, so only a current state name is accepted.
  const validStatus = (raw) => (SPC_STATES[raw] ? raw : null);
  // Only the two named filters, never an arbitrary id: matchesCoachFilter
  // treats an unknown coach as matching nobody, so a stale link would render
  // an empty roster with no way to tell that from "you have no SPC clients".
  const validCoach = (raw) => (raw === COACH_FILTER_UNASSIGNED || raw === COACH_FILTER_MINE ? raw : null);

  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState(
    statusParamIsNew ? validStatus(rawStatusParam) : savedView.statusFilter ?? null
  );
  // null means every coach, same as the phone roster — matchesCoachFilter
  // already treats them as one thing, and sharing the shape is what lets both
  // widths remember one view rather than two that drift.
  const [coachFilter, setCoachFilter] = useState(
    statusParamIsNew && rawCoachParam ? validCoach(rawCoachParam) : (savedView?.coachFilter ?? null)
  );
  // Applied once, after the rows land — the default needs to know whether
  // this coach has any SPC clients at all, and both the roster and the
  // profile arrive async. Once it's been applied this session it stays
  // applied, so neither the refocus reload nor the remount on the way back
  // from a client's page can put it back after a coach switched to All.
  // ANY dashboard deep link suppresses load()'s opens-filtered-to-you default.
  // A coach param obviously does — it names the filter. A status param does
  // too, and less obviously: the dashboard's SPC tiles count the whole gym
  // (the roster's own status tiles do as well), so landing "4 Due now" on a
  // list quietly narrowed to this coach's clients would show fewer than the
  // number that was tapped. A tile and the list it opens have to agree.
  const coachDefaultApplied = useRef(
    Boolean(savedView?.coachDefaultApplied) || Boolean(statusParamIsNew && (rawCoachParam || rawStatusParam))
  );
  const [search, setSearch] = useState(statusParamIsNew ? "" : savedView.search ?? "");
  const [sort, setSort] = useState(savedView?.sort ?? "name");
  const [dir, setDir] = useState(savedView?.dir ?? 1);
  const scrollProps = useRosterScrollRestore(SPC_ROSTER_VIEW, { enabled: !statusParamIsNew });

  // A second arrival from the dashboard with a different status, without this
  // screen having unmounted in between. The initializer alone can't see it,
  // and the remembered-view effect below would otherwise record the new param
  // against the old filter — making the next visit treat a genuine deep link
  // as already handled.
  const appliedStatusParamRef = useRef(linkParam);
  useEffect(() => {
    if (appliedStatusParamRef.current === linkParam) return;
    appliedStatusParamRef.current = linkParam;
    setStatusFilter(validStatus(rawStatusParam));
    if (rawCoachParam) setCoachFilter(validCoach(rawCoachParam));
  }, [linkParam, rawStatusParam, rawCoachParam]);

  // Remember the view for the rest of the session. Scroll is written
  // separately, from onScroll, so it isn't tied to a re-render.
  useEffect(() => {
    saveRosterView(SPC_ROSTER_VIEW, {
      search,
      coachFilter,
      statusFilter,
      sort,
      dir,
      statusParam: appliedStatusParamRef.current,
    });
  }, [search, coachFilter, statusFilter, sort, dir, linkParam]);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const loaded = await getSpcRosterDetail();
      setRows(loaded);
      if (!coachDefaultApplied.current) {
        coachDefaultApplied.current = true;
        // Recorded straight away rather than by the effect above: resolving to
        // "no default" changes no state, so the effect wouldn't run and the
        // next mount would think the default had never been applied.
        saveRosterView(SPC_ROSTER_VIEW, { coachDefaultApplied: true });
        const mine = defaultCoachFilter(loaded, profile);
        if (mine) setCoachFilter(mine);
      }
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setReady(true);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const coaches = useMemo(() => {
    const seen = new Map();
    for (const r of rows) if (r.coachId && !seen.has(r.coachId)) seen.set(r.coachId, r.coachName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // A search looks at EVERYONE. Searching inside the filter is the same as
  // not finding her: a coach types a name because she wants that person, and
  // the whole reason to type it is usually that she isn't in whatever slice
  // is on screen. So while there's a search, both the coach filter and the
  // status chips stand down (and say so, and go inert) rather than being
  // cleared — clearing would make her set them up again afterwards.
  const isSearching = search.trim().length > 0;

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return rows.filter((r) => (r.name ?? "").toLowerCase().includes(q));
    return rows.filter((r) => matchesCoachFilter(r, coachFilter, profile?.id));
  }, [rows, coachFilter, search, profile?.id]);

  const counts = useMemo(() => {
    const c = {};
    for (const r of searched) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [searched]);

  const visible = useMemo(() => {
    const filtered = statusFilter && !isSearching ? searched.filter((r) => r.state === statusFilter) : searched;
    const byName = (a, b) => (a.name ?? "").localeCompare(b.name ?? "");
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "name") return byName(a, b);
      const rank = SPC_STATE_ORDER.indexOf(a.state) - SPC_STATE_ORDER.indexOf(b.state);
      if (rank !== 0) return rank;
      return byName(a, b);
    });
    return dir === 1 ? sorted : sorted.reverse();
  }, [searched, statusFilter, isSearching, sort, dir]);

  const runningOutThisWeek = useMemo(
    () => searched.filter((r) => r.status !== "paused" && r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft <= 6 && !r.nextQueued).length,
    [searched]
  );

  const toggleSort = (key) => {
    if (sort === key) setDir((d) => -d);
    else {
      setSort(key);
      setDir(1);
    }
  };

  const handleNextStep = (row) => {
    // Every next step lands on the client's own page — that's where building
    // and resuming actually happen. The button names the job; the page is
    // where it gets done.
    router.push(`/(coach)/spc/${row.userId}`);
  };

  if (!ready) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  if (loadError) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
            Couldn't load the SPC roster: {loadError}
          </Text>
          <Pressable onPress={load}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView
        {...scrollProps}
        style={{ flex: 1, backgroundColor: CANVAS }}
        contentContainerStyle={{ padding: 26, paddingBottom: 60 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primaryOnWhite }}>SPC</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 2 }}>
              {isSearching ? (
                <>
                  {visible.length} match{visible.length === 1 ? "" : "es"} · filters paused while you search
                </>
              ) : (
                <>
                  {searched.length} client{searched.length === 1 ? "" : "s"}
                  {runningOutThisWeek > 0 ? ` · ${runningOutThisWeek} run out this week` : ""}
                </>
              )}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PressFade
              onPress={() => router.push("/(coach)/spc/live")}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Live sessions</Text>
            </PressFade>
            <PressFade
              onPress={() => router.push("/(coach)/spc/sessions")}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Past boards</Text>
            </PressFade>
            <PressFade
              onPress={() => router.push("/(coach)/templates")}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Templates</Text>
            </PressFade>
          </View>
        </View>

        {/* Toolbar: search + state chips + coach dropdown, all narrowing the
            same set. Nothing here is stored — every count is computed from
            the client's own programs (lib/programming/spcState.js). */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search clients"
            placeholderTextColor={colors.hint}
            style={{
              width: 210,
              height: 38,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#e2ddd6",
              borderRadius: 99,
              paddingHorizontal: 15,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: "#2a211c",
            }}
          />
          {/* Dimmed and inert rather than hidden while a search is running:
              hiding them would make the toolbar jump, and leaving them live
              would offer clicks that change nothing on screen. The chosen
              filter is still there when the search clears. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              opacity: isSearching ? 0.4 : 1,
              pointerEvents: isSearching ? "none" : "auto",
            }}
          >
          <StatusChip
            label="All"
            count={searched.length}
            active={statusFilter === null}
            tone="paused"
            onPress={() => setStatusFilter(null)}
          />
          {SPC_STATE_ORDER.map((state) => (
            <StatusChip
              key={state}
              label={SPC_STATES[state].label}
              count={counts[state] ?? 0}
              active={statusFilter === state}
              tone={SPC_STATES[state].tone}
              onPress={() => setStatusFilter(statusFilter === state ? null : state)}
            />
          ))}

          <View style={{ width: 1, height: 26, backgroundColor: "#e7e2db", marginHorizontal: 4 }} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#78716c" }}>Coach:</Text>
            <select
              value={coachFilter ?? "all"}
              disabled={isSearching}
              onChange={(e) => setCoachFilter(e.target.value === "all" ? null : e.target.value)}
              style={{
                fontFamily: fonts.sansSemiBold,
                fontSize: 13,
                color: "#44403c",
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid #d9d4cd",
                background: "#fff",
              }}
            >
              <option value="all">All</option>
              <option value={COACH_FILTER_MINE}>Mine + unassigned</option>
              {coaches.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </View>
          </View>
        </View>

        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 11,
              backgroundColor: "#faf8f6",
              borderBottomWidth: 1,
              borderBottomColor: CARD_BORDER,
            }}
          >
            <HeaderCell flex={1.6} sortable active={sort === "name"} dir={dir} onPress={() => toggleSort("name")}>
              CLIENT
            </HeaderCell>
            <HeaderCell flex={1.2}>CURRENT PROGRAM</HeaderCell>
            <HeaderCell flex={1.9} sortable active={sort === "status"} dir={dir} onPress={() => toggleSort("status")}>
              STATUS
            </HeaderCell>
            <HeaderCell width={116}>LAST SESSION</HeaderCell>
            <HeaderCell width={186} align="right">
              NEXT STEP
            </HeaderCell>
          </View>

          {visible.length === 0 ? (
            <View style={{ padding: 34, alignItems: "center" }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#a8a29e", textAlign: "center" }}>
                {rows.length === 0
                  ? "Nobody is on SPC yet. Turn it on from a client's profile to get started."
                  : isSearching
                    ? "Nobody on SPC matches that search."
                    : "No clients match your filters."}
              </Text>
            </View>
          ) : (
            visible.map((row, i) => (
              <ClientRow
                key={row.userId}
                row={row}
                last={i === visible.length - 1}
                onOpen={(userId) => router.push(`/(coach)/spc/${userId}`)}
                onNextStep={handleNextStep}
              />
            ))
          )}
        </View>

        <Text style={{ marginTop: 12, fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
          Status comes from the current program's end date. No one sets it by hand.
        </Text>
      </ScrollView>
    </CoachShell>
  );
}

// The desktop roster is a fixed-column table, and a .web.js sibling shadows
// its native file on web at ANY width — so on the installed PWA this rendered
// the full table squeezed into a phone, with the column headings breaking one
// letter per line. Below the breakpoint, render the native roster, which is
// the card list built for exactly this width. Same split as blocks/index.web.js
// and spc/[userId].web.js; Coach Home has done it since it was built.
export default function SpcRosterWeb() {
  const { width } = useWindowDimensions();
  return width < MOBILE_BREAKPOINT ? <SpcRosterMobile /> : <SpcRosterDesktop />;
}
