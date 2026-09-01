import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../../../lib/programming/clients";
import { getSpcClient, updateSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { listBlocksForSpcClient, listSpcWorkoutsForBlock, listSpcWorkoutsForBlocks } from "../../../lib/programming/spcBlocks";
import { listSpcCompletionDetailsForWorkouts } from "../../../lib/programming/sessionCompletions";
import { getExerciseStats } from "../../../lib/programming/exerciseStats";
import { getClient as getNutritionClient } from "../../../lib/nutrition/clients";
import { getClientGoal } from "../../../lib/programming/clientGoals";
import { deriveSpcState, resolveClientPrograms, monthDay, SPC_ENROLLMENT_LABELS } from "../../../lib/programming/spcState";
import { calendarWeekNumber } from "../../../lib/programming/schedule";
import { describeLastSession } from "../../../lib/programming/spcRoster";
import { todayInBoise, daysBetween, dateInBoise, addDays } from "../../../lib/boiseDate";
import { formatDateRange } from "../../../lib/formatDate";
import { CoachShell, MOBILE_BREAKPOINT } from "../../CoachShell";
import { ClientGoalCard } from "../../ClientGoalCard";
import { CommentThread } from "../../CommentThread";
import { CoachMessageBubble } from "../../CoachMessageBubble";
import { SegmentedControl } from "../../SegmentedControl";
import { PressFade } from "../../PressFade";
import { SpcSessionsTab } from "./SpcSessionsTab";
import { statusColors, fonts, colors } from "../../../lib/theme";
import { toastError, toastSuccess } from "../../../lib/toast";

// The SPC client page under the simplification
// (design_handoff_spc_rework_v1, 1a/1b): the existing frame — identity row,
// goal hero with the private coach notes attached, and a right rail with
// NOTES and CLIENT SETTINGS clearly spaced apart — kept as-is, with the main
// column under it becoming a tab strip: Overview / Sessions / History /
// Print. Rendered by [userId].web.js for clients on the new model (no live
// weekly-format block); legacy clients keep the old page until the cutover.
//
// Phone (mock 1b) is a compact frame: back link + status pill, name, coach
// line, tabs. The rail is desktop-only, matching the pre-existing precedent
// (the native page deliberately dropped settings; web at phone width never
// had them).

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";

function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
}

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function firstNameOf(name) {
  return (name ?? "").trim().split(/\s+/)[0] || "her";
}

function StatusPill({ derived }) {
  const tone = statusColors[derived.tone] ?? statusColors.paused;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: tone.bg, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 12 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.text }} />
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: tone.text }}>{derived.label}</Text>
    </View>
  );
}

const TABS = ["Overview", "Sessions", "History", "Print"];

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekdayOf(iso) {
  // Weekday from a Boise date string — a Thursday noon anchor keeps the
  // arithmetic away from every DST edge.
  return WEEKDAY[new Date(`${iso}T12:00:00`).getDay()];
}

/* ------------------------------------------------------------- overview */

// Exported for the visual harness — a real component boundary, not a test seam.
export function OverviewTab({ derived, current, notStarted = false, upcoming, weekNumber, spcClient, member, completionKeys, sessionWorkouts, stats, lastSessionAt, onGoSessions, onGoPrint }) {
  const router = useRouter();
  const clientFirst = firstNameOf(member?.name);
  const target = spcClient?.sessions_per_week ?? 1;
  const tone = statusColors[derived.tone] ?? statusColors.paused;

  const banner = (() => {
    if (derived.state === "paused") {
      return { title: "Paused", line: derived.reason, cta: null };
    }
    if (!current) {
      return {
        title: `Program ${clientFirst} now`,
        line: "Enrolled, never programmed. Build her first program, or pause her to silence this.",
        cta: "Build her first program",
      };
    }
    // Her program is built and waiting for its Monday. Nothing is due, and the
    // week-N lines below would be counting weeks of a program that hasn't run.
    if (notStarted) {
      return {
        title: `Ready and waiting for Mon ${monthDay(current.block_start_date)}`,
        line: `Her program is published. ${clientFirst} can't see it until it starts, and you can still change the dates or edit it on the Sessions tab.`,
        cta: "See her program",
      };
    }
    if (derived.state === "goodToGo" && upcoming?.status === "active") {
      return {
        title: `Nothing needed until ${monthDay(upcoming.block_start_date)}`,
        line: `Her next program is queued and starts Mon ${monthDay(upcoming.block_start_date)}.${weekNumber ? ` She's on week ${weekNumber}${current.block_length_weeks && current.block_end_date ? ` of ${current.block_length_weeks}` : ""}.` : ""}`,
        cta: "See what's queued",
      };
    }
    if (derived.state === "goodToGo") {
      return {
        title: "Nothing needed right now",
        line: current.block_end_date
          ? `Her program runs through Sun ${monthDay(current.block_end_date)}. She's on week ${weekNumber} of ${current.block_length_weeks}.`
          : `Ongoing program. Week ${weekNumber}, runs until you set an end date.`,
        cta: null,
      };
    }
    return {
      title: "Publish her next program",
      line: `${derived.reason}. Build it on the Sessions tab and publish it with a start Monday.`,
      cta: "Build next program",
    };
  })();

  const weeksToShow = current
    ? current.block_end_date
      ? current.block_length_weeks
      : Math.max(weekNumber ?? 1, 1)
    : 0;

  const countForWeek = (w) => {
    let n = 0;
    // .keys(), not the Map itself — iterating a Map yields [key, value] pairs.
    for (const key of completionKeys.keys()) if (Number(key.split(":")[1]) === w) n += 1;
    return n;
  };

  // personalRecords comes back date-descending already (exerciseStats.js).
  const prs = (stats?.personalRecords ?? []).slice(0, 3);

  return (
    <View style={{ gap: 16 }}>
      {/* Status banner */}
      <View style={{ backgroundColor: tone.bg, borderRadius: 14, padding: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone.text }} />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1, color: tone.text }}>
            {derived.label.toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 19, color: "#2a211c", marginTop: 7 }}>{banner.title}</Text>
        {banner.line ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e", marginTop: 5 }}>{banner.line}</Text>
        ) : null}
        {banner.cta ? (
          <PressFade
            onPress={onGoSessions}
            style={{ backgroundColor: derived.state === "goodToGo" ? "#4d6142" : colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 13 }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#fff" }}>{banner.cta}</Text>
          </PressFade>
        ) : null}
      </View>

      {/* This week */}
      {current ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Eyebrow>THIS WEEK</Eyebrow>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>target {target}</Text>
          </View>
          {/* "0 of 2 logged" under a program that hasn't started reads as a
              miss. Nothing is owed this week — the program begins later. */}
          {notStarted ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: "#57534e", marginTop: 8 }}>
              {`Nothing due yet. Her first week starts Mon ${monthDay(current.block_start_date)}.`}
            </Text>
          ) : (
            <Text style={{ marginTop: 6 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 30, color: "#2a211c" }}>{weekNumber ? countForWeek(weekNumber) : 0}</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: "#57534e" }}> of {target} logged</Text>
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 9, marginTop: 11, flexWrap: "wrap" }}>
            {sessionWorkouts.map((w) => {
              const done = completionKeys.has(`${w.id}:${weekNumber}`);
              const completedAt = done ? completionKeys.get(`${w.id}:${weekNumber}`) : null;
              return (
                <View
                  key={w.id}
                  style={{
                    flex: 1,
                    minWidth: 130,
                    borderRadius: 10,
                    padding: 12,
                    backgroundColor: done ? "#dbe8cf" : "#fff",
                    borderWidth: done ? 0 : 1.5,
                    borderStyle: done ? "solid" : "dashed",
                    borderColor: "#d9d4cd",
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: done ? "#3d5036" : "#2a211c" }}>
                    Session {w.session_number}
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: done ? "#4d6142" : "#78716c", marginTop: 2 }}>
                    {done && completedAt
                      ? `Logged ${weekdayOf(dateInBoise(new Date(completedAt)))}`
                      : notStarted
                        ? "Starts Mon " + monthDay(current.block_start_date)
                        : "Not yet"}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Current program timeline */}
      {current ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 16 }}>
          <Eyebrow>CURRENT PROGRAM</Eyebrow>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c", marginTop: 4 }}>
            {current.block_end_date
              ? `${formatDateRange(current.block_start_date, current.block_end_date)} · ${current.block_length_weeks} weeks`
              : `Since ${monthDay(current.block_start_date)} · ongoing`}
          </Text>
          <View style={{ marginTop: 10 }}>
            {Array.from({ length: weeksToShow }, (_, i) => i + 1).map((w) => {
              const weekStart = addDays(current.block_start_date, (w - 1) * 7);
              const future = weekNumber != null && w > weekNumber;
              const count = countForWeek(w);
              return (
                <View
                  key={w}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: w === 1 ? 0 : 1, borderTopColor: "#f4f1ec" }}
                >
                  <Text style={{ width: 30, fontFamily: fonts.sansBold, fontSize: 12.5, color: w === weekNumber ? colors.primaryOnWhite : "#78716c" }}>
                    W{w}
                  </Text>
                  <Text style={{ width: 56, fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>{monthDay(weekStart)}</Text>
                  <View style={{ flex: 1, flexDirection: "row", gap: 5 }}>
                    {Array.from({ length: target }, (_, i) => i).map((i) => (
                      <View
                        key={i}
                        style={{
                          width: 34,
                          height: 13,
                          borderRadius: 6,
                          backgroundColor: i < count ? "#8fb473" : "transparent",
                          borderWidth: i < count ? 0 : 1,
                          borderStyle: future ? "dashed" : "solid",
                          borderColor: "#d9d4cd",
                        }}
                      />
                    ))}
                  </View>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: future ? "#c9c4bd" : count >= target ? "#4d6142" : "#c58a3a" }}>
                    {future ? "–" : `${count}/${target}`}
                  </Text>
                </View>
              );
            })}
          </View>

          {upcoming ? (
            <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: "#dcc9bf", borderRadius: 10, padding: 12, marginTop: 12 }}>
              <Eyebrow style={{ color: colors.primaryOnWhite }}>
                {upcoming.status === "active" ? "UPCOMING PROGRAM · QUEUED" : "UPCOMING PROGRAM · DRAFT"}
              </Eyebrow>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c", marginTop: 4 }}>
                {upcoming.status === "active"
                  ? `${formatDateRange(upcoming.block_start_date, upcoming.block_end_date)} · ${upcoming.block_length_weeks} weeks`
                  : "Not published yet"}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 2 }}>
                {upcoming.status === "active"
                  ? `She can't see it until ${monthDay(upcoming.block_start_date)}.`
                  : "She can't see any of it until you publish."}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Recent PRs + last session */}
      <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 220, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 16 }}>
          <Eyebrow>RECENT PRS</Eyebrow>
          {prs.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", marginTop: 6 }}>None yet.</Text>
          ) : (
            prs.map((p, i) => (
              <View key={`${p.exerciseId ?? i}-${p.date}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#2a211c" }} numberOfLines={1}>
                  {p.exerciseName ?? "Lift"}
                </Text>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#4d6142" }}>
                  {p.weight != null ? `${p.weight} lb` : `${p.reps} reps`}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{monthDay(p.date)}</Text>
              </View>
            ))
          )}
        </View>
        <View style={{ flex: 1, minWidth: 220, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 16 }}>
          <Eyebrow>LAST SESSION</Eyebrow>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: lastSessionAt ? "#2a211c" : "#a8a29e", marginTop: 6 }}>
            {describeLastSession(lastSessionAt)}
          </Text>
          {lastSessionAt ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 2 }}>
              {weekdayOf(dateInBoise(new Date(lastSessionAt)))} {monthDay(dateInBoise(new Date(lastSessionAt)))}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Quick links */}
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <PressFade
          onPress={onGoPrint}
          style={{ flex: 1, minWidth: 150, borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: "#fff" }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Print sheet</Text>
        </PressFade>
        <PressFade
          onPress={() => router.push("/(coach)/spc/live")}
          style={{ flex: 1, minWidth: 150, borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: "#fff" }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Live session</Text>
        </PressFade>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- history */

function HistoryTab({ userId, blocks, today }) {
  const [runs, setRuns] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const past = blocks.filter((b) => b.status === "active" && b.block_end_date && b.block_end_date < today);
        if (!past.length) {
          if (!cancelled) setRuns([]);
          return;
        }
        const workouts = await listSpcWorkoutsForBlocks(past.map((b) => b.id));
        const details = await listSpcCompletionDetailsForWorkouts(userId, workouts.map((w) => w.id)).catch(() => new Map());
        const blockByWorkout = new Map(workouts.map((w) => [w.id, w.spc_block_id]));
        const loggedByBlock = new Map();
        for (const key of details.keys()) {
          const workoutId = key.split(":")[0];
          const blockId = blockByWorkout.get(workoutId);
          if (blockId) loggedByBlock.set(blockId, (loggedByBlock.get(blockId) ?? 0) + 1);
        }
        const rows = past
          .sort((a, b) => (a.block_start_date < b.block_start_date ? 1 : -1))
          .map((b) => ({ block: b, logged: loggedByBlock.get(b.id) ?? 0 }));
        if (!cancelled) setRuns(rows);
      } catch {
        if (!cancelled) setRuns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, blocks, today]);

  if (runs == null) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  if (runs.length === 0) {
    return (
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>
          No finished programs yet. When one ends, it lands here as a date range with what she logged inside it.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
      {runs.map(({ block, logged }, i) => (
        <View
          key={block.id}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#f4f1ec" }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c" }}>
              {formatDateRange(block.block_start_date, block.block_end_date)}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 1 }}>
              {block.block_length_weeks} week{block.block_length_weeks === 1 ? "" : "s"}
              {block.format === "weekly" ? " · built week by week" : ""}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: logged > 0 ? "#4d6142" : "#a8a29e" }}>
            {logged} session{logged === 1 ? "" : "s"} logged
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- print */

function PrintTab({ current, sessionWorkouts }) {
  if (!current || sessionWorkouts.length === 0) {
    return (
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>
          Nothing to print yet. The sheet comes from her current program's sessions.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
      {sessionWorkouts.map((w, i) => (
        <View
          key={w.id}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#f4f1ec" }}
        >
          <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c" }} numberOfLines={1}>
            Session {w.session_number}
            {w.title ? <Text style={{ fontFamily: fonts.sans, color: "#78716c" }}> · {w.title}</Text> : null}
          </Text>
          <PressFade
            onPress={() => window.open(`/spc/print/${current.id}?session=${w.session_number}`, "_blank")}
            style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: "#fff" }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>Print ›</Text>
          </PressFade>
        </View>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------- page */

export function SpcClientPage({ userId }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= MOBILE_BREAKPOINT;
  const today = todayInBoise();

  const [member, setMember] = useState(null);
  const [spcClient, setSpcClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [goalRow, setGoalRow] = useState(null);
  const [nutritionClient, setNutritionClient] = useState(null);
  const [stats, setStats] = useState(null);
  const [sessionWorkouts, setSessionWorkouts] = useState([]);
  const [completionKeys, setCompletionKeys] = useState(new Map());
  const [lastSessionAt, setLastSessionAt] = useState(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [tab, setTab] = useState("Overview");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [memberRow, clientRow, coachRows, blockRows, goal] = await Promise.all([
        getUser(userId),
        getSpcClient(userId),
        listCoaches(),
        listBlocksForSpcClient(userId),
        getClientGoal(userId).catch(() => null),
      ]);
      setMember(memberRow);
      setSpcClient(clientRow);
      setCoaches(coachRows);
      setBlocks(blockRows);
      setGoalRow(goal);
      setNotesDraft(clientRow?.notes_goals_feedback ?? "");

      getExerciseStats(userId).then(setStats).catch(() => setStats(null));
      getNutritionClient(userId).then(setNutritionClient).catch(() => setNutritionClient(null));

      // The current run's sessions + her completions, for the Overview's
      // this-week card and timeline. Isolated — a failure here degrades to
      // "nothing logged yet", never a blank page.
      // Same resolver the render uses, or the Overview would list one
      // program's sessions under another program's dates.
      const { current: cur } = resolveClientPrograms(blockRows, today);
      if (cur) {
        try {
          const workouts = await listSpcWorkoutsForBlock(cur.id);
          const sorted = workouts.sort((a, b) => a.session_number - b.session_number);
          setSessionWorkouts(sorted);
          const details = await listSpcCompletionDetailsForWorkouts(userId, sorted.map((w) => w.id));
          setCompletionKeys(details);
          let latest = null;
          for (const at of details.values()) if (!latest || at > latest) latest = at;
          setLastSessionAt(latest);
        } catch {
          setSessionWorkouts([]);
          setCompletionKeys(new Map());
        }
      } else {
        setSessionWorkouts([]);
        setCompletionKeys(new Map());
        setLastSessionAt(null);
      }
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setReady(true);
    }
  }, [userId, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Shared with the roster. This page used to answer "which program is she on"
  // on its own and stop at "covering today", so a client whose only program
  // was queued read "No current program · Due now" here while the roster
  // called her Good to go — 33 of 74 clients on the day this was found.
  const { current, queued, draft, notStarted, everScheduled } = useMemo(
    () => resolveClientPrograms(blocks, today),
    [blocks, today]
  );
  const upcoming = queued ?? draft;

  const weekNumber = current ? calendarWeekNumber(current.block_start_date, today) : null;
  const ongoing = Boolean(current && current.block_end_date == null);
  const daysLeft = current?.block_end_date ? daysBetween(current.block_end_date, today) : null;
  const thisWeekCount = useMemo(() => {
    if (!weekNumber) return 0;
    let n = 0;
    for (const key of completionKeys.keys()) if (Number(key.split(":")[1]) === weekNumber) n += 1;
    return n;
  }, [completionKeys, weekNumber]);

  const derived = deriveSpcState({
    status: spcClient?.status,
    current,
    daysLeft,
    ongoing,
    nextQueued: Boolean(queued),
    nextQueuedStart: queued?.block_start_date ?? null,
    finalWeekDone: thisWeekCount >= (spcClient?.sessions_per_week ?? 1),
    everScheduled,
    notStarted,
    notes: spcClient?.notes_goals_feedback,
  });

  const patch = async (fields, message) => {
    try {
      await updateSpcClient(userId, fields);
      setSpcClient((c) => ({ ...c, ...fields }));
      if (message) toastSuccess(message);
    } catch (err) {
      toastError("Couldn't save", err);
    }
  };

  if (!ready) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  if (loadError || !member) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, padding: 24 }}>
          <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
            Couldn't load this client{loadError ? `: ${loadError}` : ""}
          </Text>
          <PressFade onPress={load}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </View>
      </CoachShell>
    );
  }

  const tabStrip = (
    <View style={{ flexDirection: "row", gap: 4, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
      {TABS.map((t) => (
        <PressFade
          key={t}
          onPress={() => setTab(t)}
          style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: tab === t ? colors.primary : "transparent" }}
        >
          <Text style={{ fontFamily: tab === t ? fonts.sansBold : fonts.sansSemiBold, fontSize: 13.5, color: tab === t ? "#2a211c" : "#a8a29e" }}>
            {t}
          </Text>
        </PressFade>
      ))}
    </View>
  );

  const tabContent = (
    <View style={{ marginTop: 18 }}>
      {tab === "Overview" ? (
        <OverviewTab
          derived={derived}
          current={current}
          notStarted={notStarted}
          upcoming={upcoming}
          weekNumber={weekNumber}
          spcClient={spcClient}
          member={member}
          completionKeys={completionKeys}
          sessionWorkouts={sessionWorkouts}
          stats={stats}
          lastSessionAt={lastSessionAt}
          onGoSessions={() => setTab("Sessions")}
          onGoPrint={() => setTab("Print")}
        />
      ) : null}
      {tab === "Sessions" ? (
        <SpcSessionsTab
          userId={userId}
          member={member}
          spcClient={spcClient}
          coachId={profile?.id}
          current={current}
          currentNotStarted={notStarted}
          upcoming={upcoming}
          onChanged={load}
          isDesktop={isDesktop}
        />
      ) : null}
      {tab === "History" ? <HistoryTab userId={userId} blocks={blocks} today={today} /> : null}
      {tab === "Print" ? <PrintTab current={current} sessionWorkouts={sessionWorkouts} /> : null}
    </View>
  );

  /* --------------------------------- phone -------------------------------- */

  if (!isDesktop) {
    return (
      <CoachShell>
        <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <PressFade onPress={() => router.push("/(coach)/spc")} hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ SPC</Text>
            </PressFade>
            <StatusPill derived={derived} />
          </View>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: "#2a211c", marginTop: 10 }}>{member.name}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 2 }}>
            Coach {coaches.find((c) => c.id === spcClient?.assigned_coach_id)?.name?.split(" ")[0] ?? "unassigned"} ·{" "}
            {spcClient?.sessions_per_week ?? "—"}× / week
          </Text>
          <View style={{ marginTop: 12 }}>{tabStrip}</View>
          {tabContent}
        </ScrollView>
        <CoachMessageBubble userId={userId} clientName={member.name} />
      </CoachShell>
    );
  }

  /* -------------------------------- desktop ------------------------------- */

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 26, paddingBottom: 70 }}>
        <PressFade onPress={() => router.push("/(coach)/spc")} style={{ marginBottom: 12, alignSelf: "flex-start" }} hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#a8a29e" }}>‹ SPC</Text>
        </PressFade>

        {/* Identity + goal hero — the kept frame. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <View style={{ width: 46, height: 46, borderRadius: 99, backgroundColor: "#fdece5", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#b23a22" }}>{initials(member.name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 240 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 29, color: "#2a211c" }}>{member.name}</Text>
              <View style={{ backgroundColor: "#33251f", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 10 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.7, color: "#f7f3ee" }}>SPC</Text>
              </View>
              {nutritionClient ? (
                <PressFade
                  onPress={() => router.push(`/(coach)/nutrition/clients/${userId}`)}
                  style={{ backgroundColor: "#e3ead9", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 10 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#4d6142" }}>Nutrition ›</Text>
                </PressFade>
              ) : null}
              <StatusPill derived={derived} />
            </View>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 3 }}>
              Coach: {coaches.find((c) => c.id === spcClient?.assigned_coach_id)?.name ?? "Unassigned"} · training{" "}
              {spcClient?.sessions_per_week ?? "—"}× a week
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <PressFade
                onPress={() => router.push("/(coach)/spc/live")}
                style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: "#fff" }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Live session</Text>
              </PressFade>
            </View>
          </View>

          <ClientGoalCard
            goal={goalRow?.goal}
            userId={userId}
            clientName={member.name}
            editable
            editorId={profile?.id}
            onSaved={setGoalRow}
            style={{ width: 380, flexGrow: 1, flexShrink: 0, minWidth: 300 }}
            notes={
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
                  <Ionicons name="lock-closed" size={11} color="#a8a29e" />
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1, color: "#a8a29e" }}>COACH NOTES</Text>
                </View>
                <TextInput
                  value={notesDraft}
                  onChangeText={setNotesDraft}
                  onBlur={() => {
                    if (notesDraft !== (spcClient?.notes_goals_feedback ?? "")) patch({ notes_goals_feedback: notesDraft }, "Notes saved");
                  }}
                  multiline
                  placeholder="Only you and the other coaches see this…"
                  placeholderTextColor={colors.hint}
                  style={{
                    minHeight: 54,
                    borderWidth: 1,
                    borderColor: CARD_BORDER,
                    borderRadius: 8,
                    padding: 9,
                    fontFamily: fonts.sans,
                    fontSize: 12.5,
                    color: "#2a211c",
                    textAlignVertical: "top",
                  }}
                />
              </>
            }
          />
        </View>

        {/* Main column + right rail */}
        <View style={{ flexDirection: "row", gap: 26, alignItems: "flex-start", marginTop: 20 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {tabStrip}
            {tabContent}
          </View>

          <View style={{ width: 280, flexShrink: 0 }}>
            <Eyebrow style={{ marginBottom: 10 }}>NOTES</Eyebrow>
            {current ? (
              <View style={{ marginBottom: 12 }}>
                <CommentThread spcBlockId={current.id} />
              </View>
            ) : (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginBottom: 12 }}>
                Coach-to-coach notes attach to her program once one exists.
              </Text>
            )}

            {/* 36px of air before settings — Notes and Settings read as two
                sections, not one (Terra's explicit ask). */}
            <View style={{ height: 36 }} />

            <Eyebrow style={{ marginBottom: 10 }}>CLIENT SETTINGS</Eyebrow>
            <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 15 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginBottom: 5 }}>Enrolment</Text>
              {spcClient?.status === "inactive" ? (
                // Reachable only by a direct link — she is off the SPC roster
                // (0108). The select's two options don't include this state on
                // purpose: turning SPC back on happens on her client page,
                // where it was turned off.
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#b23a22", marginBottom: 12 }}>
                  SPC is switched off for this client. Turn it back on from her client page.
                </Text>
              ) : (
              <select
                value={spcClient?.status ?? ""}
                onChange={async (e) => {
                  const status = e.target.value;
                  try {
                    await setSpcStatus(userId, status);
                    setSpcClient((c) => ({ ...c, status }));
                  } catch (err) {
                    toastError("Couldn't update status", err);
                  }
                }}
                style={{ width: "100%", fontFamily: fonts.sans, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #d9d4cd", background: "#fff", marginBottom: 12 }}
              >
                {Object.entries(SPC_ENROLLMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              )}

              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginBottom: 5 }}>Assigned coach</Text>
              <select
                value={spcClient?.assigned_coach_id ?? ""}
                onChange={(e) => patch({ assigned_coach_id: e.target.value || null })}
                style={{ width: "100%", fontFamily: fonts.sans, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #d9d4cd", background: "#fff", marginBottom: 12 }}
              >
                <option value="">Unassigned</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginBottom: 5 }}>Sessions a week</Text>
              <SegmentedControl
                segments={[1, 2, 3, 4].map((n) => ({ key: String(n), label: `${n}×` }))}
                activeKey={String(spcClient?.sessions_per_week ?? 2)}
                onSelect={(key) => patch({ sessions_per_week: Number(key) })}
              />
            </View>
          </View>
        </View>
      </ScrollView>
      <CoachMessageBubble userId={userId} clientName={member.name} />
    </CoachShell>
  );
}
