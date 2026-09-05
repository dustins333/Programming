import { useMemo, useState } from "react";
import { View, Text, TextInput, ActivityIndicator, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listLogsForExercise } from "../../../lib/programming/memberPlan";
import { LiftProgressSection } from "../../LiftProgress";
import { PressFade } from "../../PressFade";
import { formatDateMDY } from "../../../lib/formatDate";
import { formatCount } from "../../../lib/programming/repUnit";
import { isRampUpSet } from "../../../lib/programming/setLabels";
import { fonts, colors } from "../../../lib/theme";

// Per-lift history on the SPC client page, reported as the gap it fills:
// the History tab only ever listed FINISHED programs, so a coach standing
// with a client had no way to answer "what has her bench actually done" —
// the one question the tab's name promises. Programs move to their own
// segment; lifts lead, because that is what gets looked up mid-session.
//
// Built off the same getExerciseStats the member's own My History uses (the
// page already loads it for the Overview's PR strip, so this costs no extra
// query), and the per-session detail off listLogsForExercise, which is the
// same read the member's history screen does. Nothing here is SPC-scoped:
// programming.logs carries no program reference, and a coach asking how a
// lift has moved wants every rep of it, not the slice that happened to fall
// inside one program.
const CARD_BORDER = "#ece7e1";
const ROW_BORDER = "#f5f2ee";
const PEACH_BG = "#fdf6f2";
const PEACH_BORDER = "#f0ddd2";
const NUM_COL = 96;

// A set she typed into and then cleared leaves a real row behind with both
// reps and weight null — logResult updates an existing row even to null on
// purpose. Those husks are not history; a date left with nothing real in it
// drops out entirely rather than rendering as a session of dashes. Same
// guard ExerciseHistoryModal and My History already apply.
const isRealSet = (row) => row.reps !== null || row.weight !== null;

function groupByDate(logs) {
  const groups = [];
  const byDate = new Map();
  for (const row of (logs ?? []).filter(isRealSet)) {
    if (!byDate.has(row.date_performed)) {
      const group = { date: row.date_performed, sets: [], notes: null };
      byDate.set(row.date_performed, group);
      groups.push(group);
    }
    const group = byDate.get(row.date_performed);
    group.sets.push(row);
    if (!group.notes && row.notes) group.notes = row.notes;
  }
  return groups;
}

function SetPill({ set, exercise, tracksWeight }) {
  const count = formatCount(set.reps, exercise);
  // Shown, and shown as not one of her sets (0116). A coach reading a lift's
  // history wants to see that she warmed into it; what she must not do is
  // count it as a working set she has to explain.
  const rampUp = isRampUpSet(set);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: rampUp ? "#e4e0da" : CARD_BORDER,
        borderStyle: rampUp ? "dashed" : "solid",
        backgroundColor: rampUp ? "#faf9f7" : "#fff",
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 9,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
      }}
    >
      {rampUp ? (
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 0.5, color: colors.muted }}>RAMP</Text>
      ) : null}
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: rampUp ? colors.muted : "#44403c" }}>
        {count ?? "–"}
        {tracksWeight ? (
          <Text style={{ fontFamily: fonts.sans, color: rampUp ? colors.muted : set.weight != null ? "#78716c" : colors.hint }}>
            {set.weight != null ? ` @ ${set.weight} lb` : " @ –"}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

// The expanded panel: the trend and the best set up top (the "is she getting
// stronger" answer), then every session set by set underneath — because the
// summary hides exactly the case a coach is looking for, where the last set
// dropped off.
const SESSIONS_SHOWN = 8;

function LiftDetail({ row, logs, error, onRetry }) {
  const [showAll, setShowAll] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  // The chart is sized to this panel, not to the window — it sits inside a
  // card inside a column, and the window-derived default overflowed it. The
  // fallback (before onLayout lands, and it is the only value a preview
  // browser ever sees, since react-native-web implements onLayout with a
  // ResizeObserver) is the narrowest real container: phone width less the
  // page's 18px padding and the panel's 16px, both sides.
  const [panelWidth, setPanelWidth] = useState(null);
  const chartWidth = Math.max(Math.min(panelWidth ?? windowWidth - 70, 560), 220);

  if (error) {
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#b23a22" }}>Couldn't load this lift: {error}</Text>
        <PressFade onPress={onRetry} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 6 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Retry</Text>
        </PressFade>
      </View>
    );
  }
  if (logs == null) {
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const sessions = groupByDate(logs);
  const shown = showAll ? sessions : sessions.slice(0, SESSIONS_SHOWN);
  const tracksWeight = row.exercise.tracks_weight !== false;

  return (
    <View
      onLayout={(e) => setPanelWidth(Math.round(e.nativeEvent.layout.width) - 32)}
      style={{ paddingHorizontal: 16, paddingBottom: 14, backgroundColor: PEACH_BG }}
    >
      <LiftProgressSection logs={logs} width={chartWidth} />
      {sessions.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>No sets recorded on this lift.</Text>
      ) : null}
      {shown.map((session) => (
        <View key={session.date} style={{ flexDirection: "row", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: PEACH_BORDER }}>
          <Text style={{ width: 88, fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c", paddingTop: 4 }}>
            {formatDateMDY(session.date)}
          </Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {session.sets.map((set) => (
                <SetPill key={set.id ?? `${set.set_number}`} set={set} exercise={row.exercise} tracksWeight={tracksWeight} />
              ))}
            </View>
            {session.notes ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 5, fontStyle: "italic" }}>
                {session.notes}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
      {sessions.length > SESSIONS_SHOWN ? (
        <PressFade onPress={() => setShowAll((v) => !v)} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            {showAll ? "Show fewer" : `Show all ${sessions.length} sessions`}
          </Text>
        </PressFade>
      ) : null}
    </View>
  );
}

export function LiftHistory({ userId, stats, statsError, onRetry, isDesktop }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  // exerciseId -> { logs } | { error }. Fetched once per lift on first open;
  // collapsing keeps it, so flipping between two lifts doesn't refetch.
  const [detail, setDetail] = useState({});

  const prCountByExercise = useMemo(() => {
    const map = new Map();
    for (const pr of stats?.personalRecords ?? []) map.set(pr.exerciseId, (map.get(pr.exerciseId) ?? 0) + 1);
    return map;
  }, [stats]);

  const rows = useMemo(() => {
    const all = stats?.exercises ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((r) => r.exercise.name.toLowerCase().includes(q)) : all;
  }, [stats, query]);

  async function loadDetail(exerciseId) {
    setDetail((d) => {
      const next = { ...d };
      delete next[exerciseId]; // clears a previous error so the retry shows a spinner
      return next;
    });
    try {
      const logs = await listLogsForExercise(userId, exerciseId);
      setDetail((d) => ({ ...d, [exerciseId]: { logs } }));
    } catch (err) {
      setDetail((d) => ({ ...d, [exerciseId]: { error: err.message ?? String(err) } }));
    }
  }

  function toggle(exerciseId) {
    if (openId === exerciseId) {
      setOpenId(null);
      return;
    }
    setOpenId(exerciseId);
    if (!detail[exerciseId]?.logs) loadDetail(exerciseId);
  }

  if (statsError) {
    return (
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 20 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>Couldn't load lift history: {statsError}</Text>
        <PressFade onPress={onRetry} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>Retry</Text>
        </PressFade>
      </View>
    );
  }
  if (stats == null) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  if (stats.exercises.length === 0) {
    return (
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>
          Nothing logged yet. Every lift she records fills in here, newest first.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search lifts"
        placeholderTextColor="#a8a29e"
        style={{
          borderWidth: 1,
          borderColor: CARD_BORDER,
          backgroundColor: "#fff",
          borderRadius: 10,
          paddingVertical: 9,
          paddingHorizontal: 12,
          fontFamily: fonts.sans,
          fontSize: 13.5,
          color: "#2a211c",
          marginBottom: 10,
        }}
      />
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
        {isDesktop ? (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
            <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.9, color: "#a8a29e" }}>LIFT</Text>
            {["LAST", "BEST", "SESSIONS"].map((h) => (
              <Text key={h} style={{ width: NUM_COL, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.9, color: "#a8a29e" }}>
                {h}
              </Text>
            ))}
            <View style={{ width: 22 }} />
          </View>
        ) : null}

        {rows.length === 0 ? (
          <View style={{ padding: 20 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>No lift matches "{query.trim()}".</Text>
          </View>
        ) : null}

        {rows.map((row, i) => {
          const open = openId === row.exercise.id;
          const prs = prCountByExercise.get(row.exercise.id) ?? 0;
          const tracksWeight = row.exercise.tracks_weight !== false;
          const lastCount = formatCount(row.lastReps, row.exercise);
          return (
            <View key={row.exercise.id} style={{ borderTopWidth: i === 0 && !isDesktop ? 0 : 1, borderTopColor: i === 0 ? CARD_BORDER : ROW_BORDER }}>
              <PressFade onPress={() => toggle(row.exercise.id)} style={{ paddingHorizontal: 16, paddingVertical: 11, backgroundColor: open ? PEACH_BG : "#fff" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c", flexShrink: 1 }}>
                        {row.exercise.name}
                      </Text>
                      {prs > 0 ? (
                        <View style={{ backgroundColor: "#eef1e7", borderRadius: 99, paddingVertical: 2, paddingHorizontal: 7 }}>
                          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#4d6142" }}>
                            {prs} PR{prs === 1 ? "" : "s"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 1 }}>
                      {isDesktop
                        ? `Last logged ${formatDateMDY(row.lastDate)}${row.jump != null && row.jump > 0 ? ` | up ${row.jump} lb recently` : ""}`
                        : `${formatDateMDY(row.lastDate)} | ${row.sessionCount} session${row.sessionCount === 1 ? "" : "s"}${
                            row.best != null ? ` | best ${row.best} lb` : ""
                          }`}
                    </Text>
                  </View>

                  {isDesktop ? (
                    <>
                      <Text style={{ width: NUM_COL, textAlign: "right", fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e" }}>
                        {lastCount ?? "–"}
                        {tracksWeight ? (row.lastWeight != null ? ` @ ${row.lastWeight}` : " @ –") : ""}
                      </Text>
                      <Text style={{ width: NUM_COL, textAlign: "right", fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#2a211c" }}>
                        {row.best != null ? `${row.best} lb` : "–"}
                      </Text>
                      <Text style={{ width: NUM_COL, textAlign: "right", fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                        {row.sessionCount}
                      </Text>
                    </>
                  ) : null}
                  <View style={{ width: 22, alignItems: "flex-end" }}>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#a8a29e" />
                  </View>
                </View>
              </PressFade>
              {open ? (
                <LiftDetail
                  row={row}
                  logs={detail[row.exercise.id]?.logs ?? null}
                  error={detail[row.exercise.id]?.error ?? null}
                  onRetry={() => loadDetail(row.exercise.id)}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
