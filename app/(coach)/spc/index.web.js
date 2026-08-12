import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getSpcRosterDetail, describeLastSession } from "../../../lib/programming/spcRoster";
import { checkAndAutoDraft } from "../../../lib/programming/spcDashboard";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";
import { STATUS_LABELS, STATUS_TONES, STATUS_ORDER } from "../../../lib/programming/spcStatus";
import { formatDateMD } from "../../../lib/formatDate";

// SPC roster, coach web (design_handoff_coach_web_v2, screen 14).
//
// Sorted by time remaining, because that's the only ordering that puts the
// client you have to act on today at the top. The previous version defaulted
// to a flat grid with a sort dropdown and status-tile filters, which meant
// the answer to "who runs out first" was always one interaction away.
//
// The coverage column is the real change: a status pill says what state a
// coach last set by hand, and coverage says what is actually in the block.
// Those disagree often enough — a block marked Printed & Ready with two
// empty sessions in it — that showing only the pill was hiding work.
//
// Coach filter defaults to All for everyone, per the handoff: any coach can
// see the whole roster (covering for someone shouldn't need an admin). It's
// the alerts that stay scoped, not the visibility.

const CARD_BORDER = "#ece7e1";
const CANVAS = "#faf8f6";

const TONE_STYLES = {
  urgent: { bg: "#fdece5", text: "#b23a22", bar: "#b23a22" },
  needsAction: { bg: "#fdf3e3", text: "#8a6320", bar: "#8a6320" },
  onTrack: { bg: "#e3ead9", text: "#4d6142", bar: "#4d6142" },
  paused: { bg: "#f1efec", text: "#78716c", bar: "#c9c4bd" },
};

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

// One stacked bar per client: how much of the current block is actually
// finished. Same mutually-exclusive buckets as the Group Programs block
// band, so the two screens can't disagree about what "covered" means.
function CoverageBar({ coverage, tone }) {
  const total = coverage.total || 1;
  const seg = (n, color) =>
    n > 0 ? <View key={color} style={{ width: `${(n / total) * 100}%`, height: 6, backgroundColor: color }} /> : null;

  if (coverage.total === 0) {
    return <View style={{ height: 6, borderRadius: 99, backgroundColor: "#ece7e1" }} />;
  }
  return (
    <View style={{ flexDirection: "row", height: 6, borderRadius: 99, overflow: "hidden", backgroundColor: "#ece7e1" }}>
      {seg(coverage.published, TONE_STYLES[tone]?.bar ?? "#4d6142")}
      {seg(coverage.draft, "#d8c9a8")}
      {seg(coverage.empty, "#efe9e2")}
    </View>
  );
}

function StatusChip({ label, count, active, tone, onPress }) {
  const style = TONE_STYLES[tone] ?? TONE_STYLES.paused;
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

function HeaderCell({ children, width, flex, align = "left" }) {
  return (
    <View style={{ width, flex, paddingHorizontal: 10 }}>
      <Eyebrow style={{ textAlign: align }}>{children}</Eyebrow>
    </View>
  );
}

function ClientRow({ row, onOpen, onNextStep, last }) {
  const tone = STATUS_TONES[row.status] ?? "paused";
  const toneStyle = TONE_STYLES[tone];
  const step = row.nextStep;

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

      {/* Current block */}
      <View style={{ flex: 1.2, paddingHorizontal: 10, minWidth: 0 }}>
        {row.status === "paused" ? (
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#a8a29e" }}>Paused</Text>
        ) : row.block ? (
          <>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }} numberOfLines={1}>
              {row.blockLabel} · wk {row.weekNumber} of {row.blockLengthWeeks}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
              Ends {formatDateMD(row.block.block_end_date)}
            </Text>
          </>
        ) : (
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>—</Text>
        )}
      </View>

      {/* Coverage */}
      <View style={{ flex: 1.9, paddingHorizontal: 10, minWidth: 0 }}>
        <CoverageBar coverage={row.coverage} tone={tone} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
          <View style={{ backgroundColor: toneStyle.bg, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.6, color: toneStyle.text }}>
              {(STATUS_LABELS[row.status] ?? row.status).toUpperCase()}
            </Text>
          </View>
          <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", minWidth: 0 }} numberOfLines={1}>
            {row.reason}
          </Text>
        </View>
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
      <View style={{ width: 172, paddingHorizontal: 10, alignItems: "flex-end" }}>
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
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#d6d1ca" }}>—</Text>
        )}
      </View>
    </PressFade>
  );
}

export default function SpcRosterWeb() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState(params.status ?? null);
  const [coachFilter, setCoachFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      // Same client-side stand-in for the nightly scan as before — harmless
      // if it fails, so it must not take the roster down with it.
      await checkAndAutoDraft().catch(() => {});
      setRows(await getSpcRosterDetail());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setReady(true);
    }
  }, []);

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

  const byCoach = useMemo(
    () => (coachFilter === "all" ? rows : rows.filter((r) => r.coachId === coachFilter)),
    [rows, coachFilter]
  );

  // Counts are of the coach-filtered set, so the chips always describe what
  // you're actually looking at rather than the whole gym.
  const counts = useMemo(() => {
    const c = {};
    for (const r of byCoach) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [byCoach]);

  const visible = useMemo(
    () => (statusFilter ? byCoach.filter((r) => r.status === statusFilter) : byCoach),
    [byCoach, statusFilter]
  );

  const runningOutThisWeek = useMemo(
    () => byCoach.filter((r) => r.status !== "paused" && r.daysLeft != null && r.daysLeft <= 7).length,
    [byCoach]
  );

  const handleNextStep = (row) => {
    // Every next step lands on the client's own block page — that's where
    // building, finishing a draft and resuming all actually happen. The
    // button names the job; the page is where it gets done.
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
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 26, paddingBottom: 60 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primaryOnWhite }}>SPC</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 2 }}>
              {byCoach.length} client{byCoach.length === 1 ? "" : "s"}
              {runningOutThisWeek > 0 ? ` · ${runningOutThisWeek} run out this week` : ""}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PressFade
              onPress={() => router.push("/(coach)/spc/templates")}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Templates</Text>
            </PressFade>
          </View>
        </View>

        {/* Status chips — All first, then the five real statuses in urgency
            order. Clicking the active one clears the filter. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <StatusChip
            label="All"
            count={byCoach.length}
            active={statusFilter === null}
            tone="paused"
            onPress={() => setStatusFilter(null)}
          />
          {STATUS_ORDER.map((status) => (
            <StatusChip
              key={status}
              label={STATUS_LABELS[status]}
              count={counts[status] ?? 0}
              active={statusFilter === status}
              tone={STATUS_TONES[status]}
              onPress={() => setStatusFilter(statusFilter === status ? null : status)}
            />
          ))}

          <View style={{ width: 1, height: 26, backgroundColor: "#e7e2db", marginHorizontal: 4 }} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#78716c" }}>Coach:</Text>
            <select
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
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
              {coaches.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
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
            <HeaderCell flex={1.6}>CLIENT</HeaderCell>
            <HeaderCell flex={1.2}>CURRENT BLOCK</HeaderCell>
            <HeaderCell flex={1.9}>COVERAGE</HeaderCell>
            <HeaderCell width={116}>LAST SESSION</HeaderCell>
            <HeaderCell width={172} align="right">
              NEXT STEP
            </HeaderCell>
          </View>

          {visible.length === 0 ? (
            <View style={{ padding: 34, alignItems: "center" }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#a8a29e", textAlign: "center" }}>
                {rows.length === 0
                  ? "Nobody is on SPC yet. Turn it on from a client's profile to get started."
                  : "No clients match these filters."}
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
      </ScrollView>
    </CoachShell>
  );
}
