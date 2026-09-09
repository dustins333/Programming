import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Modal, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../../../lib/programming/clients";
import { getSpcClient, updateSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { listBlocksForSpcClient, listSpcWorkoutsForBlock, listSpcWorkoutsForBlocks } from "../../../lib/programming/spcBlocks";
import { listCommentsForBlocks } from "../../../lib/programming/comments";
import { listSpcCompletionDetailsForWorkouts } from "../../../lib/programming/sessionCompletions";
import { getExerciseStats } from "../../../lib/programming/exerciseStats";
import { getClient as getNutritionClient } from "../../../lib/nutrition/clients";
import { getClientGoal } from "../../../lib/programming/clientGoals";
import { deriveSpcState, resolveClientPrograms, monthDay, SPC_ENROLLMENT_LABELS } from "../../../lib/programming/spcState";
import { calendarWeekNumber } from "../../../lib/programming/schedule";
import { listSpcSessionActivity, sessionActivityState, activityKey } from "../../../lib/programming/spcSessionActivity";
import { getSpcBlockDetail } from "../../../lib/programming/spcBlockDetail";
import { finalizeSpcSession, unfinalizeSpcSession } from "../../../lib/programming/sessionCompletions";
import { boiseInstantFrom } from "../../../lib/boiseDate";
import { SpcSessionReadout } from "../../SpcSessionReadout";
import { todayInBoise, daysBetween, dateInBoise, addDays } from "../../../lib/boiseDate";
import { formatDateRange, formatDateMDShort } from "../../../lib/formatDate";
import { CoachShell, MOBILE_BREAKPOINT } from "../../CoachShell";
import { ClientContextBand } from "./ClientContextBand";
import { CoachMessageBubble } from "../../CoachMessageBubble";
import { SegmentedControl } from "../../SegmentedControl";
import { PressFade } from "../../PressFade";
import { SpcSessionsTab } from "./SpcSessionsTab";
import { LiftHistory } from "./LiftHistory";
import { ProgramNotesRow, ProgramNotesPanel } from "./ProgramNotes";
import { statusColors, fonts, colors } from "../../../lib/theme";
import { toastError, toastSuccess } from "../../../lib/toast";
import { confirmTurnSpcOff } from "../../../lib/confirmDialog";

// The SPC client page. Rendered by [userId].web.js for clients on the new
// model (no live weekly-format block); legacy clients keep the old page.
//
// SIMPLIFICATION PASS (design_handoff_spc_client_v2), and the shape of it is
// worth knowing before adding anything back:
//
//   The right rail is gone. It held NOTES and CLIENT SETTINGS beside a main
//   column that then had ~850px to fit two side-by-side Sessions panes in,
//   which is why every lift row in them wrapped. Settings became its own tab;
//   the thread became a fold-away row (see ProgramNotes.js).
//
//   Two different things were both labelled COACH NOTES. The client-row field
//   is KEEP IN MIND now and lives in the goal hero; the block-scoped thread is
//   Notes, and follows its program into History when the program closes.
//
//   Overview is banner / THIS WEEK / CURRENT PROGRAM and nothing else. The
//   banner's title and supporting line went with the RECENT PRS and LAST
//   SESSION cards: all of it was either duplicated by the two cards below it
//   or reachable in one tap on History.
//
// Phone is a compact frame: back link + status pill, name, coach line, tabs.
// Settings is desktop-only, matching the pre-existing precedent (the native
// page deliberately dropped settings; web at phone width never had them).

const CANVAS = colors.coachCanvas;
const CARD_BORDER = colors.coachCardBorder;

function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
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

const TABS = ["Overview", "Sessions", "History", "Settings"];

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekdayOf(iso) {
  // Weekday from a Boise date string — a Thursday noon anchor keeps the
  // arithmetic away from every DST edge.
  return WEEKDAY[new Date(`${iso}T12:00:00`).getDay()];
}

/* ----------------------------------------------------- session pills */

// Until this, these pills were a tally: `target` slots with the first N
// filled, N being how many completions that week had. So pill 1 was not
// Session 1, it was the first of three slots — which is why nothing could be
// clicked (there was no session behind it to open) and why a week where she
// did sessions 2 and 3 drew as though she had done 1 and 2.
//
// Three states, three shapes. Solid means she said she was done. An olive
// outline means the sets are there and the tap never happened. Grey means
// nothing. Deliberately no partial fill: a half-filled pill implies a ratio,
// and the real numbers are one tap away in the expansion.
// "Session 2 · Upper", but a title that only repeats the label reads as
// "Session 2 · Session 2" — coaches do type that — so it is dropped rather
// than echoed.
function sessionTitleFor(workout) {
  const t = (workout?.title ?? "").trim();
  if (!t) return null;
  if (t.toLowerCase() === `session ${workout.session_number}`.toLowerCase()) return null;
  return t;
}

// One entry per real session in a given week, in programmed order. A
// sessions-format run has one workout row spanning every week (0105), so all
// of them apply; a legacy weekly block already has a row per week, so only
// that week's do.
function buildWeekEntries({ block, workouts, completionKeys, activity, week }) {
  const forWeek = block?.format === "weekly" ? workouts.filter((w) => w.week_number === week) : workouts;
  return forWeek.map((workout) => {
    const key = activityKey(workout.id, week);
    const completedAt = completionKeys.get(key) ?? null;
    const act = activity.get(key);
    const loggedSets = act?.loggedSets ?? 0;
    return {
      key,
      week,
      workout,
      completedAt,
      loggedSets,
      lastLoggedDate: act?.lastLoggedDate ?? null,
      state: sessionActivityState({ completedAt, loggedSets }),
    };
  });
}

// "9/5" — the badge form, no leading zeros. formatDateMD gives "09/05",
// which is right in a calendar grid's fixed column and too heavy in a corner.
const badgeDate = formatDateMDShort;

// The day something last happened on this session: when she finished it, or
// when she last logged into it without finishing.
function tileDate(entry) {
  if (entry.state === "finalized" && entry.completedAt) return dateInBoise(new Date(entry.completedAt));
  if (entry.lastLoggedDate) return entry.lastLoggedDate;
  return null;
}

// One session in a week row: a real tile carrying its own name and state, and
// pressable straight through to the session. It used to be a 34x13 marker and
// the WEEK was what you pressed, which meant two taps to reach a session and
// a row of anonymous dashes that told you nothing about which session was
// which. Nobody runs more than about three SPC sessions in a week, so the
// tiles can take the width the row was wasting.
//
// Name on line one with the date as a corner badge, title on line two. A
// sentence ("Finalized Tue Sep 8") needed width the phone does not have, and
// stacking it under a title made every tile three lines deep.
function SessionTile({ entry, future, onPress }) {
  const { state, workout } = entry;
  const finalized = state === "finalized";
  const started = state === "started";
  const title = sessionTitleFor(workout);
  const date = finalized || started ? badgeDate(tileDate(entry)) : "";
  const dim = future && !finalized && !started;
  return (
    <PressFade
      onPress={onPress}
      hitSlop={4}
      style={{
        flex: 1,
        minWidth: 0,
        paddingVertical: 7,
        paddingHorizontal: 9,
        borderRadius: 9,
        backgroundColor: finalized ? "#f3f6ef" : "#fff",
        borderWidth: started ? 2 : 1,
        borderStyle: dim ? "dashed" : "solid",
        borderColor: finalized || started ? "#8fb473" : future ? "#ded8d0" : "#e4ded6",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: dim ? "#8b837a" : "#2a211c" }}
        >
          Session {workout.session_number}
        </Text>
        {date ? (
          // Filled once it is finished, outlined while it is only started, so
          // the two never read as the same thing at a glance.
          <View
            style={{
              paddingHorizontal: 5,
              paddingVertical: 1,
              borderRadius: 5,
              backgroundColor: finalized ? "#dbe8cf" : "transparent",
              borderWidth: finalized ? 0 : 1,
              borderColor: "#a9c48e",
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#3d5036" }}>{date}</Text>
          </View>
        ) : null}
      </View>
      {title ? (
        <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 11.5, marginTop: 1, color: dim ? "#a8a29e" : "#78716c" }}>
          {title}
        </Text>
      ) : null}
    </PressFade>
  );
}

// A tile needs about this much before "Session 1" and its date badge start
// truncating, and the number is the part that has to survive.
const TILE_MIN = 118;

// Everything a week row spends before the tiles get a pixel: the page's fixed
// chrome (sidebar 232, page padding 52, notes rail 280 + its 26 gap), the
// card's padding and the row's own W / date / count columns and gaps.
const ROW_CHROME = 590 + 32 + 16 + 142;

// Window arithmetic rather than onLayout, because the chrome around this
// column does not move and ResizeObserver does not fire where this gets
// verified. A phone is comfortably below it whatever the sums say.
function weekRowStacks(width, tiles) {
  return width - ROW_CHROME < tiles * TILE_MIN + Math.max(0, tiles - 1) * 8;
}

// A week is a row of its sessions, each one pressable straight through. No
// expand step: the tiles carry the name, the title and the state that the
// expanded panel used to, so there is nothing left behind a chevron.
//
// A week she finished turns the whole row green. The tiles keep their own
// lighter tint on top of it, so a finished session still reads as a card
// rather than dissolving into the band.
//
// Narrow, the four columns stop fitting and the row stacks: the label and the
// count on their own line, the tiles across the full width beneath. Shaving
// the tiles instead just puts the session number back under the truncation
// this layout exists to keep it out of.
function WeekRow({ week, weekStart, future, current, entries, onOpenSession }) {
  const { width } = useWindowDimensions();
  const target = entries.length;
  const done = entries.filter((e) => e.state !== "untouched").length;
  const complete = target > 0 && done >= target && !future;
  const stacked = weekRowStacks(width, target);

  const label = (
    <Text style={{ width: 30, fontFamily: fonts.sansBold, fontSize: 12.5, color: current ? colors.primaryOnWhite : "#78716c" }}>
      W{week}
    </Text>
  );
  const date = (
    <Text
      style={{
        width: stacked ? undefined : 52,
        flex: stacked ? 1 : undefined,
        fontFamily: fonts.sans,
        fontSize: 12,
        color: complete ? "#6d7d61" : "#a8a29e",
      }}
    >
      {monthDay(weekStart)}
    </Text>
  );
  const count = (
    <Text
      style={{
        width: 30,
        textAlign: "right",
        fontFamily: fonts.sansSemiBold,
        fontSize: 12,
        color: future ? "#c9c4bd" : complete ? "#4d6142" : "#c58a3a",
      }}
    >
      {future || !target ? "\u2013" : `${done}/${target}`}
    </Text>
  );
  const tiles = target ? (
    entries.map((e) => <SessionTile key={e.key} entry={e} future={future} onPress={() => onOpenSession(e)} />)
  ) : (
    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c9c4bd" }}>Nothing written for this week</Text>
  );

  const shell = {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: complete ? 9 : 0,
    backgroundColor: complete ? "#e3ead9" : "transparent",
    // Two finished weeks in a row would otherwise butt together into one long
    // green block with a notch where the corners meet.
    marginVertical: complete ? 1 : 0,
    // A rounded green band does not want a rule cutting across its top.
    borderTopWidth: week === 1 || complete ? 0 : 1,
    borderTopColor: "#f4f1ec",
  };

  if (stacked) {
    return (
      <View style={shell}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
          {label}
          {date}
          {count}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>{tiles}</View>
      </View>
    );
  }

  return (
    <View style={{ ...shell, flexDirection: "row", alignItems: "center", gap: 10 }}>
      {label}
      {date}
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 8 }}>{tiles}</View>
      {count}
    </View>
  );
}

/* ------------------------------------------------------------- overview */

// Exported for the visual harness — a real component boundary, not a test seam.
export function OverviewTab({ derived, current, notStarted = false, upcoming, weekNumber, spcClient, completionKeys, activity = new Map(), sessionWorkouts, coachId, onOpenSession, onGoSessions }) {
  const target = spcClient?.sessions_per_week ?? 1;
  const tone = statusColors[derived.tone] ?? statusColors.paused;

  // Title and supporting line both dropped in the v2 pass. The label already
  // names the state, and every sentence they carried is on the two cards
  // directly beneath — the week's count, the program's dates, whether
  // anything is queued. What is left is the state, and the one thing to do
  // about it.
  const bannerCta = (() => {
    if (derived.state === "paused") return null;
    if (!current) return "Build her first program";
    if (notStarted) return "See her program";
    if (derived.state === "goodToGo") return upcoming?.status === "active" ? "See what's queued" : null;
    return "Build next program";
  })();

  const weeksToShow = current
    ? current.block_end_date
      ? current.block_length_weeks
      : Math.max(weekNumber ?? 1, 1)
    : 0;

  // Not a tally: each entry carries the session it stands for, which is what
  // makes a pill openable.
  const entriesForWeek = (w) =>
    buildWeekEntries({ block: current, workouts: sessionWorkouts, completionKeys, activity, week: w });

  // Counts a started session as done. The sets are the evidence she trained;
  // Finalize is her confirmation, not the event.
  const countForWeek = (w) => entriesForWeek(w).filter((e) => e.state !== "untouched").length;

  return (
    <View style={{ gap: 16 }}>
      {/* Status banner */}
      <View style={{ backgroundColor: tone.bg, borderRadius: 14, padding: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 11, height: 11, borderRadius: 99, backgroundColor: tone.text }} />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, color: tone.text }}>{derived.label}</Text>
        </View>
        {bannerCta ? (
          <PressFade
            onPress={onGoSessions}
            style={{ backgroundColor: derived.state === "goodToGo" ? "#4d6142" : colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 14 }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#fff" }}>{bannerCta}</Text>
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
            {(weekNumber ? entriesForWeek(weekNumber) : []).map((e) => {
              const done = e.state === "finalized";
              const started = e.state === "started";
              return (
                <PressFade
                  key={e.key}
                  onPress={() => onOpenSession?.(e)}
                  style={{
                    flex: 1,
                    minWidth: 130,
                    borderRadius: 10,
                    padding: 12,
                    backgroundColor: done ? "#dbe8cf" : "#fff",
                    borderWidth: done ? 0 : started ? 2 : 1.5,
                    borderStyle: done || started ? "solid" : "dashed",
                    borderColor: started ? "#8fb473" : "#d9d4cd",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", minWidth: 0, gap: 5 }}>
                    <Text
                      numberOfLines={1}
                      style={{ flexShrink: 0, fontFamily: fonts.sansBold, fontSize: 13, color: done ? "#3d5036" : "#2a211c" }}
                    >
                      Session {e.workout.session_number}
                    </Text>
                    {sessionTitleFor(e.workout) ? (
                      <Text
                        numberOfLines={1}
                        style={{ flexShrink: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}
                      >
                        {sessionTitleFor(e.workout)}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 11.5,
                      marginTop: 2,
                      color: done ? "#4d6142" : started ? "#5c7a4a" : "#78716c",
                    }}
                  >
                    {done && e.completedAt
                      ? `Logged ${weekdayOf(dateInBoise(new Date(e.completedAt)))}`
                      : started
                        ? `${e.loggedSets} sets · not finalized`
                        : notStarted
                          ? "Starts Mon " + monthDay(current.block_start_date)
                          : "Not yet"}
                  </Text>
                </PressFade>
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
          {/* Lived inside an expanded week before the rows stopped expanding.
              Said once, and only when a week actually has one. */}
          {Array.from({ length: weeksToShow }, (_, i) => i + 1).some((w) =>
            entriesForWeek(w).some((e) => e.state === "started"),
          ) ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#7d6a60", marginTop: 8 }}>
              An olive outline means she logged the work and never tapped Finalize. Open it to settle it.
            </Text>
          ) : null}
          <View style={{ marginTop: 10 }}>
            {Array.from({ length: weeksToShow }, (_, i) => i + 1).map((w) => (
              <WeekRow
                key={w}
                week={w}
                weekStart={addDays(current.block_start_date, (w - 1) * 7)}
                future={weekNumber != null && w > weekNumber}
                current={w === weekNumber}
                entries={entriesForWeek(w)}
                onOpenSession={(e) => onOpenSession?.(e)}
              />
            ))}
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

          {/* The block-scoped thread, at the foot of the program it belongs
              to. Second mount is the Sessions tab; both share their open
              state, so it cannot be open in one place and shut in the other. */}
          <ProgramNotesRow spcBlockId={current.id} coachId={coachId} />
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- history */

// Two things a coach means by "history", and only one of them was here.
// Lifts leads because it is the one looked up mid-session ("what did she
// pull last time?"); finished programs are a record you go looking for,
// so they keep their list behind the second segment.
const HISTORY_SEGMENTS = [
  { key: "lifts", label: "Lifts" },
  { key: "programs", label: "Programs" },
];

// Exported for the visual harness, same as OverviewTab.
export function HistoryTab({ userId, blocks, today, stats, statsError, onRetryStats, isDesktop, onOpenSession }) {
  const [view, setView] = useState("lifts");
  return (
    <View>
      <View style={{ maxWidth: 320 }}>
        <SegmentedControl segments={HISTORY_SEGMENTS} activeKey={view} onSelect={setView} dense />
      </View>
      {view === "lifts" ? (
        <LiftHistory userId={userId} stats={stats} statsError={statsError} onRetry={onRetryStats} isDesktop={isDesktop} />
      ) : (
        <ProgramRuns userId={userId} blocks={blocks} today={today} onOpenSession={onOpenSession} />
      )}
    </View>
  );
}

function ProgramRuns({ userId, blocks, today, onOpenSession }) {
  const [runs, setRuns] = useState(null);
  const [openBlock, setOpenBlock] = useState(null);
  // Per-block, fetched the first time a run is opened. A coach opens one run,
  // not fourteen, so pulling every finished block's sessions up front would be
  // most of a page load thrown away.
  const [inner, setInner] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const past = blocks.filter((b) => b.status === "active" && b.block_end_date && b.block_end_date < today);
        if (!past.length) {
          if (!cancelled) setRuns([]);
          return;
        }
        const pastIds = past.map((b) => b.id);
        const workouts = await listSpcWorkoutsForBlocks(pastIds);
        const details = await listSpcCompletionDetailsForWorkouts(userId, workouts.map((w) => w.id)).catch(() => new Map());
        // Batched rather than lazy-per-run like the sessions below: the count
        // sits on every collapsed row's meta line, so fetching on expand would
        // be one query per row to draw a list nobody has opened yet. Its own
        // catch — a notes failure costs the counts, never the runs.
        const notesByBlock = await listCommentsForBlocks({ spcBlockIds: pastIds }).catch(() => new Map());
        const blockByWorkout = new Map(workouts.map((w) => [w.id, w.spc_block_id]));
        const loggedByBlock = new Map();
        for (const key of details.keys()) {
          const workoutId = key.split(":")[0];
          const blockId = blockByWorkout.get(workoutId);
          if (blockId) loggedByBlock.set(blockId, (loggedByBlock.get(blockId) ?? 0) + 1);
        }
        const rows = past
          .sort((a, b) => (a.block_start_date < b.block_start_date ? 1 : -1))
          .map((b) => ({ block: b, logged: loggedByBlock.get(b.id) ?? 0, notes: notesByBlock.get(b.id) ?? [] }));
        if (!cancelled) setRuns(rows);
      } catch {
        if (!cancelled) setRuns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, blocks, today]);

  const toggleBlock = async (block) => {
    if (openBlock === block.id) {
      setOpenBlock(null);
      return;
    }
    setOpenBlock(block.id);
    if (inner[block.id]) return;
    try {
      const workouts = (await listSpcWorkoutsForBlock(block.id)).sort((a, b) => a.session_number - b.session_number);
      const [completions, activity] = await Promise.all([
        listSpcCompletionDetailsForWorkouts(userId, workouts.map((w) => w.id)).catch(() => new Map()),
        listSpcSessionActivity({ userId, block, workouts }).catch(() => new Map()),
      ]);
      setInner((m) => ({ ...m, [block.id]: { workouts, completions, activity } }));
    } catch (err) {
      toastError("Couldn't open that program", err);
      setOpenBlock(null);
    }
  };

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
      {runs.map(({ block, logged, notes }, i) => {
        const expanded = openBlock === block.id;
        const data = inner[block.id];
        return (
          <View key={block.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#f4f1ec" }}>
            <PressFade
              onPress={() => toggleBlock(block)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16 }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c" }}>
                  {formatDateRange(block.block_start_date, block.block_end_date)}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 1 }}>
                  {block.block_length_weeks} week{block.block_length_weeks === 1 ? "" : "s"}
                  {notes.length ? ` · ${notes.length} note${notes.length === 1 ? "" : "s"}` : ""}
                </Text>
              </View>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: logged > 0 ? "#4d6142" : "#a8a29e" }}>
                {logged} session{logged === 1 ? "" : "s"} logged
              </Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={15} color="#a8a29e" />
            </PressFade>

            {expanded ? (
              <>
                <View style={{ paddingHorizontal: 16, paddingBottom: 6, backgroundColor: "#fdfcfa" }}>
                  {!data ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
                  ) : (
                    Array.from({ length: block.block_length_weeks ?? 0 }, (_, k) => k + 1).map((w) => (
                      <WeekRow
                        key={w}
                        week={w}
                        weekStart={addDays(block.block_start_date, (w - 1) * 7)}
                        future={false}
                        current={false}
                        entries={buildWeekEntries({
                          block,
                          workouts: data.workouts,
                          completionKeys: data.completions,
                          activity: data.activity,
                          week: w,
                        })}
                        onOpenSession={(e) => onOpenSession?.(e, block.id)}
                      />
                    ))
                  )}
                </View>
                {/* Read-only: the notes written on this program while it ran,
                    which is the whole point of scoping the thread to a block.
                    Its own ground and padding, so it sits outside the padded
                    sessions container rather than inside it. */}
                <ProgramNotesPanel notes={notes} />
              </>
            ) : null}
          </View>
        );
      })}
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
  // Distinct from stats === null, which also means "still loading" — without
  // it a failed fetch leaves the Lifts tab on a spinner that never resolves.
  const [statsError, setStatsError] = useState(null);
  const [sessionWorkouts, setSessionWorkouts] = useState([]);
  const [completionKeys, setCompletionKeys] = useState(new Map());
  // Map<`${workoutId}:${week}`, {loggedSets, lastLoggedDate}> — what she
  // actually logged, whether or not she ever tapped Finalize.
  const [activity, setActivity] = useState(new Map());
  // getSpcBlockDetail is only fetched when a session is opened, and cached
  // per block: it pulls prescriptions, notes and every log in the run, which
  // is far more than the Overview itself needs.
  const [detail, setDetail] = useState(null);
  const [readoutKey, setReadoutKey] = useState(null);
  const [openingSession, setOpeningSession] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const loadStats = useCallback(() => {
    setStatsError(null);
    // Deliberately does NOT clear stats first: load() re-runs on every focus,
    // and blanking the list to a spinner each time is worse than showing the
    // previous answer for the half second the refetch takes.
    getExerciseStats(userId)
      .then(setStats)
      .catch((err) => setStatsError(err.message ?? String(err)));
  }, [userId]);

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

      loadStats();
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
          const [details, acts] = await Promise.all([
            listSpcCompletionDetailsForWorkouts(userId, sorted.map((w) => w.id)),
            // Isolated from the completions fetch: an activity failure should
            // cost the started state, never the whole card.
            listSpcSessionActivity({ userId, block: cur, workouts: sorted }).catch(() => new Map()),
          ]);
          setCompletionKeys(details);
          setActivity(acts);
        } catch {
          setSessionWorkouts([]);
          setCompletionKeys(new Map());
          setActivity(new Map());
        }
      } else {
        setSessionWorkouts([]);
        setCompletionKeys(new Map());
        setActivity(new Map());
      }
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setReady(true);
    }
  }, [userId, today, loadStats]);

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
  // Counts a session she logged but never finalized. deriveSpcState reads
  // this as finalWeekDone, so without it a client who trained her whole final
  // week and forgot to tap Finalize reads as still working, and the prompt to
  // write her next program never fires.
  const thisWeekCount = useMemo(() => {
    if (!weekNumber) return 0;
    let n = 0;
    for (const w of sessionWorkouts) {
      const key = activityKey(w.id, weekNumber);
      const state = sessionActivityState({
        completedAt: completionKeys.get(key) ?? null,
        loggedSets: activity.get(key)?.loggedSets ?? 0,
      });
      if (state !== "untouched") n += 1;
    }
    return n;
  }, [completionKeys, activity, sessionWorkouts, weekNumber]);

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

  // Opening a session is what pulls the heavy read. Cached per block, so
  // walking a run session by session fetches once.
  // blockId is optional so the Overview can just say "this entry"; History
  // passes the finished run the row belongs to. One read-out, reached from
  // both, so "what did she do in this session" has one answer wherever a coach
  // asks it.
  const openSession = useCallback(
    async (entry, blockId = null) => {
      const targetId = blockId ?? current?.id;
      if (!targetId) return;
      setOpeningSession(true);
      try {
        const d = detail?.block?.id === targetId ? detail : await getSpcBlockDetail(userId, targetId, today);
        setDetail(d);
        setReadoutKey(entry.key);
      } catch (err) {
        toastError("Couldn't open that session", err);
      } finally {
        setOpeningSession(false);
      }
    },
    [current, detail, userId, today]
  );

  const readoutSession = useMemo(
    () => (readoutKey ? (detail?.sessions ?? []).find((x) => x.key === readoutKey) ?? null : null),
    [detail, readoutKey]
  );

  // After settling a session the completion has moved, so everything keyed on
  // it is stale: the pills, the week counts, and deriveSpcState's finalWeekDone.
  // load() re-reads all of it; the block detail is dropped so the read-out
  // re-fetches rather than showing the state it was opened in.
  const afterSettle = useCallback(async () => {
    setDetail(null);
    setReadoutKey(null);
    await load();
  }, [load]);

  const handleFinalize = useCallback(
    async (dateString) => {
      if (!readoutSession) return;
      // Noon Boise on the day she trained, never today — finalizeSpcSession
      // resolves the completion's week from this timestamp, so today's date
      // would file a week-2 session under whatever week today falls in. A bare
      // YYYY-MM-DD would be stored as UTC midnight and read back as the
      // previous evening in Boise, which is the .slice(0,10) bug class.
      await finalizeSpcSession(userId, readoutSession.id, boiseInstantFrom(dateString, "12:00"));
      toastSuccess("Marked finalized");
      await afterSettle();
    },
    [readoutSession, userId, afterSettle]
  );

  const handleUnfinalize = useCallback(async () => {
    if (!readoutSession) return;
    await unfinalizeSpcSession(userId, readoutSession.id, { completedAt: readoutSession.completedAt });
    toastSuccess("Session reopened");
    await afterSettle();
  }, [readoutSession, userId, afterSettle]);

  const patch = async (fields, message) => {
    try {
      await updateSpcClient(userId, fields);
      setSpcClient((c) => ({ ...c, ...fields }));
      if (message) toastSuccess(message);
    } catch (err) {
      toastError("Couldn't save", err);
    }
  };

  // Turning SPC off entirely used to live only on the client detail page,
  // which for a coach account is reachable only through Settings -> Team.
  // It belongs where the client actually lives, so it is here too — as a
  // deliberate action behind a confirm rather than a third option in the
  // Enrollment select, because leaving the roster is a different kind of
  // decision from choosing between active and paused, and a select that
  // archives on change gives no beat to change your mind.
  const setEnrollment = async (status, message) => {
    try {
      await setSpcStatus(userId, status);
      setSpcClient((c) => (c ? { ...c, status } : c));
      toastSuccess(message);
    } catch (err) {
      toastError("Couldn't update status", err);
    }
  };

  const handleTurnSpcOff = async () => {
    if (!(await confirmTurnSpcOff(member?.name ?? "this client"))) return;
    await setEnrollment("inactive", "SPC turned off");
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

  // Was the right rail's card, at 280 wide. Its own tab now, so it can take a
  // readable width and stop competing with the Sessions panes for the page.
  const settingsField = { fontFamily: fonts.sans, fontSize: 13, padding: "9px 10px", borderRadius: 8, border: "1px solid #d9d4cd", background: "#fff", width: "100%", boxSizing: "border-box", color: "#2a211c" };
  const settingsLabel = { fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginTop: 14, marginBottom: 5 };

  const settingsCard = (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 20, maxWidth: 440 }}>
      <Eyebrow>CLIENT SETTINGS</Eyebrow>

      <Text style={settingsLabel}>Enrollment</Text>
      {spcClient?.status === "inactive" ? (
        // Reachable only by a direct link — she is off the SPC roster (0108).
        // The select's two options still don't include this state on purpose:
        // active and paused are a choice between, and off is an action.
        // Turning it back on is offered right here rather than pointing
        // elsewhere, so switching off from this card can be undone from it.
        <View>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#b23a22", marginBottom: 8 }}>
            SPC is switched off for this client. Their programs and history are kept.
          </Text>
          <PressFade onPress={() => setEnrollment("active", "SPC turned back on")}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
              Turn SPC back on
            </Text>
          </PressFade>
        </View>
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
          style={settingsField}
        >
          {Object.entries(SPC_ENROLLMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      )}

      <Text style={settingsLabel}>Assigned coach</Text>
      <select
        value={spcClient?.assigned_coach_id ?? ""}
        onChange={(e) => patch({ assigned_coach_id: e.target.value || null })}
        style={settingsField}
      >
        <option value="">Unassigned</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <Text style={settingsLabel}>Sessions a week</Text>
      <SegmentedControl
        segments={[1, 2, 3, 4].map((n) => ({ key: String(n), label: `${n}×` }))}
        activeKey={String(spcClient?.sessions_per_week ?? 2)}
        onSelect={(key) => patch({ sessions_per_week: Number(key) })}
      />

      {spcClient && spcClient.status !== "inactive" ? (
        <>
          <View style={{ height: 1, backgroundColor: CARD_BORDER, marginTop: 20, marginBottom: 14 }} />
          <PressFade onPress={handleTurnSpcOff} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#b23a22" }}>Turn SPC off</Text>
          </PressFade>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16, color: "#a8a29e", marginTop: 4 }}>
            Comes off the SPC roster and the live board. Programs are kept.
          </Text>
        </>
      ) : null}
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
          completionKeys={completionKeys}
          activity={activity}
          sessionWorkouts={sessionWorkouts}
          coachId={profile?.id}
          onOpenSession={openSession}
          onGoSessions={() => setTab("Sessions")}
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
      {tab === "History" ? (
        <HistoryTab
          userId={userId}
          blocks={blocks}
          today={today}
          stats={stats}
          statsError={statsError}
          onRetryStats={loadStats}
          isDesktop={isDesktop}
          onOpenSession={openSession}
        />
      ) : null}
      {tab === "Settings" ? settingsCard : null}

      {/* Opening a session pulls the whole block, which is not instant. Said
          out loud rather than leaving a tap look like it did nothing. */}
      <Modal visible={openingSession} transparent animationType="none">
        <View style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.2)", alignItems: "center", justifyContent: "center" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 14, paddingVertical: 20, paddingHorizontal: 28, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>Opening session…</Text>
          </View>
        </View>
      </Modal>

      <SpcSessionReadout
        visible={Boolean(readoutSession)}
        session={readoutSession}
        logsByDate={detail?.logsByDate ?? new Map()}
        personalRecords={stats?.personalRecords ?? []}
        memberName={member?.name}
        blockLabel={
          detail?.block?.block_end_date
            ? formatDateRange(detail.block.block_start_date, detail.block.block_end_date)
            : null
        }
        onClose={() => setReadoutKey(null)}
        onFinalize={handleFinalize}
        onUnfinalize={handleUnfinalize}
        onPrev={(() => {
          const all = detail?.sessions ?? [];
          const i = all.findIndex((x) => x.key === readoutKey);
          return i > 0 ? () => setReadoutKey(all[i - 1].key) : null;
        })()}
        onNext={(() => {
          const all = detail?.sessions ?? [];
          const i = all.findIndex((x) => x.key === readoutKey);
          return i >= 0 && i < all.length - 1 ? () => setReadoutKey(all[i + 1].key) : null;
        })()}
      />
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

        {/* Name line: everything that identifies her, on one row. The avatar
            went (initials next to the name they are the initials of), and so
            did the status pill — it repeated the banner a few pixels below. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: "#2a211c" }}>{member.name}</Text>
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
          <PressFade
            onPress={() => router.push("/(coach)/spc/live")}
            style={{ flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: "#fff" }}
          >
            <Ionicons name="radio-outline" size={15} color={colors.primaryOnWhite} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Live session</Text>
          </PressFade>
        </View>

        {/* Meta line. No "Coach:" prefix and no "training" — the two facts
            stand on their own next to her name. */}
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 5 }}>
          {coaches.find((c) => c.id === spcClient?.assigned_coach_id)?.name ?? "Unassigned"} ·{" "}
          {spcClient?.sessions_per_week ?? "—"}× a week
        </Text>

        {/* The goal and KEEP IN MIND are facts about the CLIENT, not about
            this page, so they are one shared component rendered identically
            here and in the session builder — see ClientContextBand. */}
        <ClientContextBand
          userId={userId}
          clientName={member.name}
          editorId={profile?.id}
          goal={goalRow?.goal}
          keepInMind={spcClient?.notes_goals_feedback}
          onGoalSaved={setGoalRow}
          onKeepInMindSaved={(text) => setSpcClient((c) => ({ ...c, notes_goals_feedback: text }))}
          style={{ marginTop: 18 }}
        />

        {/* Full width — the rail that used to sit beside this is gone, which
            is what lets the Sessions tab put its two panes side by side. */}
        <View style={{ marginTop: 20 }}>
          {tabStrip}
          {tabContent}
        </View>
      </ScrollView>
      <CoachMessageBubble userId={userId} clientName={member.name} />
    </CoachShell>
  );
}
