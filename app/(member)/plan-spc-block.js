import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, calendarWeekNumber } from "../../lib/programming/schedule";
import { weekWindow } from "../../lib/programming/spcBlockDetail";
import { getSpcClient, isSpcActive } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";
import { listSpcCompletionDetailsForWorkouts, finalizeSpcSession } from "../../lib/programming/sessionCompletions";
import { listLogsForSession } from "../../lib/programming/memberPlan";
import { listBlocksForSpcClient, labelBlocks } from "../../lib/programming/spcBlocks";
import { retryOnce } from "../../lib/retry";
import { formatDateMDY } from "../../lib/formatDate";
import { SessionSheet } from "../../components/SessionSheet";
import { BlockProgressHero } from "../../components/BlockProgressHero";
import { BlockWeekCard } from "../../components/BlockWeekCard";
import { PressFade } from "../../components/PressFade";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

const CANVAS = "#faf8f6";

// Same prescription/logged-set shaping the group block page uses — see
// plan-block.js for the reasoning behind each.
// Sets × reps only. Rest is deliberately NOT shown here — it isn't set on
// every lift, so it made the overview read as though some prescriptions were
// incomplete. It belongs on the logging screen, where she's actually timing
// against it (the logging card shows it under the rest stopwatch).
function prescriptionLine(ex) {
  const reps = Array.isArray(ex.rep_scheme) && new Set(ex.rep_scheme).size > 1 ? ex.rep_scheme.join(", ") : ex.reps;
  return `${ex.sets ?? "–"} × ${reps ?? "–"}`;
}

function groupLogsByExercise(logs, exerciseRows) {
  const byExercise = new Map();
  if (!logs) return byExercise;
  for (const ex of exerciseRows) {
    const exerciseId = ex.exercises?.id ?? ex.exercise_id;
    const rows = logs.filter((l) => l.exercise_id === exerciseId);
    if (rows.length === 0) {
      byExercise.set(exerciseId, []);
      continue;
    }
    const highest = Math.max(ex.sets ?? 0, ...rows.map((r) => r.set_number ?? 1));
    byExercise.set(
      exerciseId,
      Array.from({ length: highest }, (_, i) => {
        const row = rows.find((r) => (r.set_number ?? 1) === i + 1);
        if (!row || (row.reps == null && row.weight == null)) return null;
        return { reps: row.reps, weight: row.weight };
      })
    );
  }
  return byExercise;
}

// Full multi-week view of a member's SPC block — one tap away from My
// Fitness's "View full SPC block" link. Every week is laid out at once
// (mirrors the coach's block-sessions grid: weeks as row labels, sessions
// laid out beside each) rather than the old pill-select-one-week pattern.
// Completion status for the whole block is fetched up front
// (listSpcCompletionDetailsForWorkouts) so a completed session's bubble is
// immediately green with its date — no need to tap a session just to find
// out whether it happened. Tapping a session opens a popup: a completed one
// shows the real SessionLogger accordion (view + edit whatever was
// logged — no video links, those stay My Fitness-only, and no Finalize
// button, this is for correcting history not first-time logging); one that
// hasn't happened yet shows its plain prescription.
//
// A sessions-format run (0105) has ONE row per session for the whole program,
// every row authored week 1, so the rows alone can't draw weeks: each
// calendar week repeats every session, and everything week-specific
// (completion, logged sets, the week handed to My Fitness) is keyed on
// (workout, week), never the workout alone. Reading the authored week here
// drew a single "Week 1" row and hid every week she'd already trained. Same
// expansion the coach's client page does in spcBlockDetail.js.
const tileKey = (workoutId, week) => `${workoutId}:${week}`;

export default function PlanSpcBlock() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ status: "loading" });
  const [currentWeek, setCurrentWeek] = useState(null);
  const [sessionContent, setSessionContent] = useState({}); // tileKey -> { warmups, exerciseRows, loggedSets }
  // { workoutId, week } — the week is the tile's, not the row's authored one.
  const [modalTarget, setModalTarget] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [savingSession, setSavingSession] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setSessionContent({});
    try {
      // Wrapped in retryOnce: a transient failure on the first request
      // batch right after navigating here (cold connections, several
      // sequential Supabase calls firing right after a reload) used to
      // surface as a permanent "not showing completed sessions" state with
      // no obvious way to recover short of leaving and coming back.
      const result = await retryOnce(async () => {
        const spcClient = await getSpcClient(profile.id);
        if (!isSpcActive(spcClient)) return { status: "unassigned" };

        const today = todayInBoise();
        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) return { status: "no_block" };

        const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
        if (workouts.length === 0) return { status: "not_published" };

        // Sessions format counts weeks uncapped off the start date, the same
        // as plan.js and every completion it files. The page runs to the end
        // date, or to this week for an ongoing or lapsed run, so a week she
        // trained past a planned end still shows.
        const sessionsFormat = block.format === "sessions";
        const week = sessionsFormat
          ? calendarWeekNumber(block.block_start_date, today)
          : currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
        const weekCount = sessionsFormat
          ? Math.max(week, block.block_end_date ? calendarWeekNumber(block.block_start_date, block.block_end_date) : week)
          : block.block_length_weeks;
        const completions = await listSpcCompletionDetailsForWorkouts(profile.id, workouts.map((w) => w.id));

        // "Block 4" — SPC blocks already have a canonical numbering
        // (labelBlocks, chronological by start date). Isolated: it's a label,
        // so a failure just drops the hero to "Week 3 of 6".
        let blockLabel = null;
        try {
          const all = await listBlocksForSpcClient(profile.id);
          blockLabel = labelBlocks(all).find((b) => b.id === block.id)?.label ?? null;
        } catch (err) {
          console.error("Plan SPC block: couldn't number the block", err);
        }

        return { status: "ready", spcClient, block, blockLabel, workouts, completions, week, weekCount, sessionsFormat };
      });
      if (result.status === "ready") setCurrentWeek(result.week);
      setState(result);
    } catch (err) {
      console.error("Plan SPC block: failed to load", err);
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [profile.id]);

  // load() only refetches on focus, not just mount — same staleness class
  // already fixed on My Week/My Fitness and on plan-block.js's group
  // sibling; see that file's comment for the full reasoning.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const weeksInBlock = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.from({ length: state.weekCount }, (_, i) => i + 1);
  }, [state]);

  // Same week model as the group block page. SPC has no day-of-week routing,
  // so there's no "today's session" tile — a week is simply done, short,
  // current or ahead, and the client's own sessions_per_week is what a week
  // is measured against.
  const blockView = useMemo(() => {
    if (state.status !== "ready") return null;
    const { workouts, completions, spcClient, sessionsFormat } = state;
    const slots = Math.max(1, ...workouts.map((w) => w.session_number));
    const target = Math.min(spcClient?.sessions_per_week ?? slots, slots);

    const weeks = weeksInBlock
      .map((week) => {
        const sessions = workouts
          .filter((w) => sessionsFormat || w.week_number === week)
          .sort((a, b) => a.session_number - b.session_number);
        if (sessions.length === 0) return null;
        const doneCount = sessions.filter((w) => completions.has(tileKey(w.id, week))).length;
        const isCurrent = week === currentWeek;
        const isPast = week < currentWeek;
        const missed = Math.max(0, target - doneCount);
        return {
          week,
          status: isCurrent ? "current" : isPast ? (missed === 0 ? "complete" : "short") : "upcoming",
          missed,
          doneCount,
          // SPC has no day-of-week routing, so nothing here is literally
          // "today" — the clay tile marks the next one she hasn't done in the
          // current week, and only that one, or every current-week tile would
          // light up at once.
          sessions: (() => {
            const nextUp = isCurrent ? sessions.find((w) => !completions.has(tileKey(w.id, week))) : null;
            return sessions.map((workout) => ({
              workout,
              state: completions.has(tileKey(workout.id, week))
                ? "done"
                : isPast
                  ? "missed"
                  : workout.id === nextUp?.id
                    ? "today"
                    : "upcoming",
            }));
          })(),
        };
      })
      .filter(Boolean);

    return { weeks, slots, totalDone: weeks.reduce((sum, w) => sum + w.doneCount, 0), totalTarget: weeksInBlock.length * target };
  }, [state, weeksInBlock, currentWeek]);

  const openSession = async (workout, week) => {
    const key = tileKey(workout.id, week);
    setModalTarget({ workoutId: workout.id, week });
    if (sessionContent[key]) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const completedAt = state.status === "ready" ? state.completions.get(key) : null;
      const [warmups, exerciseRows, allLogs] = await Promise.all([
        listSpcWarmups(workout.id),
        listSpcWorkoutExercises(workout.id),
        completedAt ? listLogsForSession(profile.id, { spcWorkoutId: workout.id, weekNumber: week }) : Promise.resolve(null),
      ]);
      // listLogsForSession doesn't filter on week (it predates one row
      // spanning every week), so a sessions run gets every week's sets for
      // this session. Keep the ones dated inside this tile's week.
      let logs = allLogs;
      if (logs && state.sessionsFormat) {
        const { start, end } = weekWindow(state.block, week);
        logs = logs.filter((l) => l.date_performed >= start && l.date_performed <= end);
      }
      setSessionContent((prev) => ({
        ...prev,
        [key]: {
          warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
          exerciseRows,
          loggedSets: groupLogsByExercise(logs, exerciseRows),
        },
      }));
    } catch (err) {
      // See plan-block.js — same permanent-spinner failure otherwise.
      setModalError(err.message ?? String(err));
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => setModalTarget(null);

  // Same split as the group block page: log/update hand off to My Fitness,
  // a back-log finishes here because its sets are already in the sheet.
  const handleSessionCta = async (logDate) => {
    const workout = modalWorkout;
    if (!workout) return;
    if (modalState === "backlog") {
      setSavingSession(true);
      try {
        await handleFinalizeMissedSession(workout, modalTarget.week, logDate);
        closeModal();
        toastSuccess("Session saved.");
      } catch (err) {
        toastError("Couldn't save this session", err);
      } finally {
        setSavingSession(false);
      }
      return;
    }
    closeModal();
    router.push({
      pathname: "/(member)/plan",
      // exactWeek: this screen means the week it names, unlike My Week's
      // bubbles, which are always about the current one. See plan.js.
      params: {
        session: "spc",
        weekNumber: String(modalTarget.week),
        sessionNumber: String(workout.session_number),
        exactWeek: "1",
      },
    });
  };

  // Logging a missed past session — see plan-block.js's
  // handleFinalizeMissedSession for the full reasoning (same pattern here).
  const handleFinalizeMissedSession = async (workout, week, logDate) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      throw new Error("Enter the date as YYYY-MM-DD.");
    }
    // 18:00Z, not device-local noon: parsing without a zone used the
    // member's own timezone, so from UTC+7 or later a back-logged
    // session was stored (and read back) on the wrong Boise day.
    // 18:00Z is 12:00 MDT / 11:00 MST — mid-day in Boise either way.
    const completedAt = new Date(`${logDate}T18:00:00Z`).toISOString();
    await finalizeSpcSession(profile.id, workout.id, completedAt);
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = new Map(prev.completions);
      // A sessions run files the completion under the week of the date she
      // picked (spcCompletionWeek), which can be a later week than the tile.
      const filedWeek = prev.sessionsFormat ? calendarWeekNumber(prev.block.block_start_date, logDate) : week;
      next.set(tileKey(workout.id, filedWeek), completedAt);
      return { ...prev, completions: next };
    });
  };

  // Reachable from more than one place now (My Fitness's own "View full SPC
  // block" link, and My Week's) — see plan-block.js's identical goBack for
  // the full reasoning. Falls back to a real push only when there's no
  // history to pop (a direct deep-link with nothing behind it).
  const goBack = () => (router.canGoBack() ? router.back() : router.push({ pathname: "/(member)/plan", params: { program: "spc" } }));

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const modalWorkout = modalTarget && state.status === "ready" ? state.workouts.find((w) => w.id === modalTarget.workoutId) : null;
  const modalWeek = modalTarget?.week ?? null;
  const modalKey = modalTarget ? tileKey(modalTarget.workoutId, modalTarget.week) : null;
  const modalRaw = modalKey ? sessionContent[modalKey] : null;
  const modalCompletedAt = modalWorkout ? state.completions?.get(modalKey) : null;
  const modalTitle = modalWorkout ? modalWorkout.title || `Session ${modalWorkout.session_number}` : "";
  const modalExercises = modalRaw
    ? modalRaw.exerciseRows.map((ex) => ({
        id: ex.id,
        exerciseId: ex.exercises?.id ?? ex.exercise_id,
        name: ex.exercises?.name ?? "Exercise",
        detail: prescriptionLine(ex),
        supersetGroupId: ex.superset_group_id,
        targetSets: ex.sets,
      }))
    : [];

  // Which of the sheet's four states — by week and completion row, never a
  // single boolean. A session in a week that hasn't started gets no button.
  const modalState = !modalWorkout
    ? "future"
    : modalCompletedAt
      ? "logged"
      : modalWeek > currentWeek
        ? "future"
        : modalWeek < currentWeek
          ? "backlog"
          : "today";

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-5 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      <View className="mb-2.5 flex-row items-center justify-between gap-3">
        <PressFade onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{}}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>‹ My Fitness</Text>
        </PressFade>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.muted }}>
          SPC
        </Text>
      </View>

      {state.status !== "ready" ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          {state.status === "unassigned"
            ? "You're not enrolled in SPC."
            : state.status === "error"
              ? `Something went wrong: ${state.message}`
              : state.status === "not_published"
                ? "Your SPC coach hasn't published this block yet — check back soon."
                : "No active SPC block right now."}
        </Text>
      ) : (
        <>
          <BlockProgressHero
            // An ongoing program has no length, so "of N" would invent one.
            title={`${state.blockLabel ? `${state.blockLabel} | ` : ""}Week ${currentWeek}${
              state.sessionsFormat && !state.block.block_end_date ? "" : ` of ${weeksInBlock.length}`
            }`}
            done={blockView.totalDone}
            total={blockView.totalTarget}
          />

          {blockView.weeks.map((week) => (
            <BlockWeekCard
              key={week.week}
              weekNumber={week.week}
              status={week.status}
              missed={week.missed}
              slots={blockView.slots}
              sessions={week.sessions.map((s) => ({
                key: tileKey(s.workout.id, week.week),
                label: `Session ${s.workout.session_number}`,
                state: s.state,
                onPress: () => openSession(s.workout, week.week),
              }))}
            />
          ))}

          {blockView.weeks.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted }}>
              Your coach hasn&apos;t published this block yet.
            </Text>
          ) : null}
        </>
      )}

      <SessionSheet
        key={modalKey ?? "none"}
        visible={!!modalTarget}
        onClose={closeModal}
        eyebrow={modalWorkout ? `Week ${modalWeek} | Session ${modalWorkout.session_number}` : ""}
        title={modalTitle}
        state={modalState}
        // SPC has no day-of-week routing, so a current-week session is open
        // rather than "today's".
        pillLabel={modalState === "today" ? "THIS WEEK" : undefined}
        completedDateLabel={modalCompletedAt ? formatDateMDY(dateInBoise(new Date(modalCompletedAt))) : null}
        futureLabel={modalWorkout ? (modalWeek === currentWeek + 1 ? "Next week" : `Week ${modalWeek}`) : null}
        loading={modalLoading || (!modalError && !modalRaw)}
        error={modalError}
        onRetry={() => modalWorkout && openSession(modalWorkout, modalWeek)}
        exercises={modalExercises}
        loggedSets={modalRaw?.loggedSets}
        userId={profile.id}
        source="spc"
        session={modalWorkout ? { spcWorkoutId: modalWorkout.id, weekNumber: modalWeek } : undefined}
        ctaBusy={savingSession}
        onCta={handleSessionCta}
      />
    </ScrollView>
  );
}
