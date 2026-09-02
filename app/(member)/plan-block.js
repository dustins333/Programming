import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise, addDays } from "../../lib/boiseDate";
import { currentWeekNumber, blockLengthWeeks, sessionNumberForDate, DEFAULT_SESSION_DAYS } from "../../lib/programming/schedule";
import {
  listMyAssignments,
  getCurrentBlock,
  listPublishedWorkoutsForBlock,
} from "../../lib/programming/memberPlan";
import { listBlocksForProgram } from "../../lib/programming/blocks";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { listLogsForSession } from "../../lib/programming/memberPlan";
import { listGroupCompletionDetailsForWorkouts, finalizeGroupSession } from "../../lib/programming/sessionCompletions";
import { retryOnce } from "../../lib/retry";
import { formatDateMDY } from "../../lib/formatDate";
import { SessionSheet } from "../../components/SessionSheet";
import { BlockProgressHero } from "../../components/BlockProgressHero";
import { BlockWeekCard } from "../../components/BlockWeekCard";
import { listAlternateProgramsForUser, programEndDate } from "../../lib/programming/alternatePrograms";
import { PressFade } from "../../components/PressFade";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

const CANVAS = "#faf8f6";

// "4 × 8 | rest 2:00" — the prescription as the sheet's rows want it. Rest is
// a free-text column, so whatever the coach typed is passed through rather
// than reformatted; "|" is the house separator.
// Sets × reps only. Rest is deliberately NOT shown here — it isn't set on
// every lift, so it made the overview read as though some prescriptions were
// incomplete. It belongs on the logging screen, where she's actually timing
// against it (the logging card shows it under the rest stopwatch).
function prescriptionLine(ex) {
  const reps = Array.isArray(ex.rep_scheme) && new Set(ex.rep_scheme).size > 1 ? ex.rep_scheme.join(", ") : ex.reps;
  return `${ex.sets ?? "–"} × ${reps ?? "–"}`;
}

// logs → exerciseId → [{ reps, weight }] indexed by set number, padded out to
// the prescribed set count so a set she never did renders as the "missed" box
// rather than silently shortening the row.
function groupLogsByExercise(logs, exercises) {
  const byExercise = new Map();
  if (!logs) return byExercise;
  for (const ex of exercises) {
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

// Full multi-week view of a member's group program block — one tap away
// from My Fitness's "View full block" link. Every week is laid out at once
// (mirrors the coach's block-sessions grid, app/(coach)/blocks/[blockId].js:
// week as a row label, sessions laid out beside it) rather than the old
// pill-select-one-week pattern. Completion status is fetched for the whole
// block up front (listGroupCompletionDetailsForWorkouts) so a completed
// session's bubble is immediately green with its date — no need to tap a
// session just to find out whether it happened. Tapping a session opens a
// popup: a completed one shows the real SessionLogger accordion (view +
// edit whatever was logged — no video links, those stay My Fitness-only,
// and no Finalize button, this is for correcting history not first-time
// logging); one that hasn't happened yet shows its plain prescription.
export default function PlanBlock() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { programId } = useLocalSearchParams();
  const [state, setState] = useState({ status: "loading" });
  const [currentWeek, setCurrentWeek] = useState(null);
  const [sessionContent, setSessionContent] = useState({}); // workoutId -> { warmups, exercises }
  const [modalWorkoutId, setModalWorkoutId] = useState(null);
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
        const assignments = await listMyAssignments(profile.id);
        if (assignments.length === 0) return { status: "unassigned" };

        // Which membership's block to show — passed by whichever "View full
        // block" link sent the member here (a client can hold more than one
        // group program now), falling back to the first membership for
        // direct navigation with no param.
        const assignment = assignments.find((a) => a.group_program_id === programId) ?? assignments[0];
        const program = assignment.group_programs;
        const block = await getCurrentBlock(program.id, todayInBoise());
        if (!block) return { status: "no_block" };

        const workouts = await listPublishedWorkoutsForBlock(block.id);
        const completions = await listGroupCompletionDetailsForWorkouts(profile.id, workouts.map((w) => w.id));
        const week = currentWeekNumber(block.block_start_date, blockLengthWeeks(block, program), todayInBoise());
        // logs.source only ever special-cased BWA by name — everything else
        // tags with the generic 'group' value, same rule plan.js's load() uses.
        const source = program.name === "Better With Age" ? "bwa" : "group";

        // "Block 12" — group blocks carry no name or number of their own, so
        // it's derived the same way SPC's labelBlocks() does it: chronological
        // position in the program's own block list. Isolated from the batch
        // above because it's a label, not content — if it fails, the hero just
        // reads "Week 3 of 6" rather than taking the page down with it.
        let blockNumber = null;
        try {
          const blocks = await listBlocksForProgram(program.id);
          const index = blocks.findIndex((b) => b.id === block.id);
          if (index >= 0) blockNumber = index + 1;
        } catch (err) {
          console.error("Plan block: couldn't number the block", err);
        }

        // Weeks she was away for (0110). Isolated like the block number
        // above and for the same reason: it changes a label, so a failure
        // must not take the page down. Only runs with the pause ticked
        // count — a deload assigned while she was still in the gym is not
        // a reason to stop reporting a missed session.
        let awayRuns = [];
        try {
          awayRuns = (await listAlternateProgramsForUser(profile.id))
            .filter((run) => run.pause_missed_flags)
            .map((run) => ({ name: run.name, start: run.start_date, end: programEndDate(run) }));
        } catch (err) {
          console.error("Plan block: couldn't load away runs", err);
        }

        return {
          status: "ready",
          program,
          assignment,
          assignments,
          block,
          blockNumber,
          workouts,
          completions,
          source,
          week,
          awayRuns,
        };
      });
      if (result.status === "ready") setCurrentWeek(result.week);
      setState(result);
    } catch (err) {
      console.error("Plan block: failed to load", err);
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [profile.id, programId]);

  // load() only refetches on focus, not just mount — expo-router's Stack
  // can keep this screen mounted when you navigate back to it (same class
  // of staleness bug already fixed on My Week/My Fitness, see their own
  // useFocusEffect calls), so without this a coach's unpublish/content edit
  // wouldn't show up here until a hard reload.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const weeksInBlock = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.from({ length: blockLengthWeeks(state.block, state.program) }, (_, i) => i + 1);
  }, [state]);

  // Everything the 13a layout needs, derived once: how many sessions a week
  // of this program holds, what this member actually owes per week, which
  // session today maps to, and a per-week status.
  const blockView = useMemo(() => {
    if (state.status !== "ready") return null;
    const { program, assignment, workouts, completions, block, awayRuns } = state;
    const slots = program.sessions_per_week ?? 3;
    // The member's own weekly commitment, not the program's default — a 2×
    // member's week is complete at two even though three are published.
    const target = Math.min(assignment.sessions_per_week ?? slots, slots);
    const today = todayInBoise();
    const todaySession = sessionNumberForDate(today, program.session_days ?? DEFAULT_SESSION_DAYS);

    const weeks = weeksInBlock
      .map((week) => {
        const sessions = workouts
          .filter((w) => w.week_number === week)
          .sort((a, b) => a.session_number - b.session_number);
        // Rule 2: an unpublished week isn't drawn at all — the page ends
        // where the program currently ends.
        if (sessions.length === 0) return null;

        const doneCount = sessions.filter((w) => completions.has(w.id)).length;
        const isCurrent = week === currentWeek;
        const isPast = week < currentWeek;
        const missed = Math.max(0, target - doneCount);

        // Blocks always start on a Monday (0063), so week N is exactly the
        // seven days from start + (N-1)*7 — the same calendar week an
        // alternate run is measured in.
        const weekStart = addDays(block.block_start_date, (week - 1) * 7);
        const weekEnd = addDays(weekStart, 6);
        const awayRun = (awayRuns ?? []).find((run) => run.start <= weekEnd && weekStart <= run.end);

        // A week she was away for is never a shortfall. It is NOT relabelled
        // "Complete" either — she genuinely didn't do these — it gets its own
        // quiet state naming the run, so the page stays honest in both
        // directions. A week she completed anyway keeps its Complete.
        const isAwayWeek = !!awayRun && missed > 0;
        const status = isCurrent
          ? "current"
          : isPast
            ? missed === 0
              ? "complete"
              : isAwayWeek
                ? "away"
                : "short"
            : "upcoming";

        return {
          week,
          status,
          missed,
          doneCount,
          awayLabel: isAwayWeek ? awayRun.name : null,
          sessions: sessions.map((workout) => {
            const done = completions.has(workout.id);
            const isToday = isCurrent && workout.session_number === todaySession;
            return {
              workout,
              // A logged session reads as plain white inside its week's tint
              // rather than shouting — the week container is already carrying
              // that story. Only "today" and "missed" get their own fill.
              // An away week's untouched tiles read as plain, not as the
              // dashed red "missed" box — nothing was owed.
              state: done ? "done" : isToday ? "today" : isPast && !isAwayWeek ? "missed" : "upcoming",
            };
          }),
        };
      })
      .filter(Boolean);

    const totalDone = weeks.reduce((sum, w) => sum + w.doneCount, 0);
    // Counted against the commitment for the whole block, so the denominator
    // doesn't move as the coach publishes more.
    const totalTarget = weeksInBlock.length * target;
    return { weeks, slots, totalDone, totalTarget };
  }, [state, weeksInBlock, currentWeek]);

  const openSession = async (workout) => {
    setModalWorkoutId(workout.id);
    if (sessionContent[workout.id]) return;
    setModalLoading(true);
    setModalError(null);
    try {
    const completedAt = state.status === "ready" ? state.completions.get(workout.id) : null;
    // Only a session that was actually logged needs its sets — the other
    // three states have nothing to show under each lift.
    const [warmups, exercises, logs] = await Promise.all([
      listWarmups(workout.id),
      listWorkoutExercises(workout.id),
      completedAt ? listLogsForSession(profile.id, { groupWorkoutId: workout.id }) : Promise.resolve(null),
    ]);
    setSessionContent((prev) => ({
      ...prev,
      [workout.id]: {
        warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
        exercises: exercises.map((ex) => ({
          id: ex.id,
          exerciseId: ex.exercises?.id ?? ex.exercise_id,
          name: ex.exercises?.name ?? "Exercise",
          detail: prescriptionLine(ex),
          exercise: ex.exercises,
          targetSets: ex.sets,
          targetReps: ex.reps,
          repScheme: ex.rep_scheme,
          supersetGroupId: ex.superset_group_id,
          tempo: ex.tempo,
          rest: ex.rest,
          notes: ex.notes,
        })),
        loggedSets: groupLogsByExercise(logs, exercises),
      },
    }));
    } catch (err) {
      // Without this the modal sat on its spinner forever and every retry
      // re-failed, because sessionContent[id] was never populated.
      setModalError(err.message ?? String(err));
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => setModalWorkoutId(null);

  // "Log this session" / "Update this session" hand off to My Fitness, which
  // is the one place a session is actually worked through (rest timers, last
  // time, per-exercise ticks). "Save this session" is different: a back-log
  // is finished here, because its sets have already been typed into the sheet.
  const handleSessionCta = async (logDate) => {
    const workout = modalWorkout;
    if (!workout) return;
    if (modalState === "backlog") {
      setSavingSession(true);
      try {
        await handleFinalizeMissedSession(workout, logDate);
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
      params: {
        session: "group",
        groupProgramId: state.program.id,
        weekNumber: String(workout.week_number),
        sessionNumber: String(workout.session_number),
      },
    });
  };

  // Logging a missed past session — the member picks (or keeps the
  // defaulted-to-today) date it actually happened, and that becomes the
  // completion's real timestamp so history reflects when it happened, not
  // when they got around to typing it in. Updates state.completions
  // in place rather than a full reload — the modal's own `completed` prop
  // is derived from that map, so it flips straight into the "view/edit
  // what you logged" mode once this resolves, no extra plumbing needed.
  const handleFinalizeMissedSession = async (workout, logDate) => {
    // logDate is free-typed (SessionDetailModal's "When did you do this?"
    // field) — an invalid or incomplete value here used to throw a bare
    // RangeError out of .toISOString(), which SessionLogger's finalize
    // handler now surfaces as a toast, but "RangeError: Invalid time
    // value" isn't a useful message for a member to act on.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      throw new Error("Enter the date as YYYY-MM-DD.");
    }
    // 18:00Z, not device-local noon: parsing without a zone used the
    // member's own timezone, so from UTC+7 or later a back-logged
    // session was stored (and read back) on the wrong Boise day.
    // 18:00Z is 12:00 MDT / 11:00 MST — mid-day in Boise either way.
    const completedAt = new Date(`${logDate}T18:00:00Z`).toISOString();
    await finalizeGroupSession(profile.id, workout.id, completedAt);
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = new Map(prev.completions);
      next.set(workout.id, completedAt);
      return { ...prev, completions: next };
    });
  };

  // Reachable from more than one place now (My Fitness's own "View full
  // block" link, and My Week's — same "go back to wherever you actually
  // came from" guard already used on the coach side's multi-entry screens,
  // e.g. blocks/[blockId].js) — a hardcoded push to My Fitness ignored that
  // and always landed there even when the member came from My Week. Falls
  // back to a real push only when there's no history to pop (a direct
  // deep-link with nothing behind it).
  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.push({ pathname: "/(member)/plan", params: programId ? { program: programId } : undefined });

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const modalWorkout = state.status === "ready" ? state.workouts.find((w) => w.id === modalWorkoutId) : null;
  const modalCompletedAt = modalWorkoutId ? state.completions?.get(modalWorkoutId) : null;
  const modalContent = modalWorkoutId ? sessionContent[modalWorkoutId] : null;

  // Which of the sheet's four states this session is in — driven by its week
  // and its completion row, never by a single "completed" boolean. A session
  // in a week that hasn't started reads as `future`, which is what removes
  // the log button entirely rather than leaving a disabled one to be tapped.
  const modalState = !modalWorkout
    ? "future"
    : modalCompletedAt
      ? "logged"
      : modalWorkout.week_number > currentWeek
        ? "future"
        : modalWorkout.week_number < currentWeek
          ? "backlog"
          : "today";

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-5 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      {/* Back on the left, the program on the right — the block itself is
          named in the hero below, so the program name doesn't need to be the
          page title as well. */}
      <View className="mb-2.5 flex-row items-center justify-between gap-3">
        <PressFade onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{}}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>‹ My Fitness</Text>
        </PressFade>
        {state.status === "ready" ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.muted, flexShrink: 1 }}>
            {state.program.name}
          </Text>
        ) : null}
      </View>

      {state.status !== "ready" ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          {state.status === "unassigned"
            ? "You're not assigned to a program yet."
            : state.status === "error"
              ? `Something went wrong: ${state.message}`
              : "No active block right now."}
        </Text>
      ) : (
        <>
          <BlockProgressHero
            title={`${state.blockNumber ? `Block ${state.blockNumber} | ` : ""}Week ${currentWeek} of ${weeksInBlock.length}`}
            done={blockView.totalDone}
            total={blockView.totalTarget}
          />

          {blockView.weeks.map((week) => (
            <BlockWeekCard
              key={week.week}
              weekNumber={week.week}
              status={week.status}
              missed={week.missed}
              awayLabel={week.awayLabel}
              slots={blockView.slots}
              sessions={week.sessions.map((s) => ({
                key: s.workout.id,
                label: `Session ${s.workout.session_number}`,
                state: s.state,
                onPress: () => openSession(s.workout),
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
        key={modalWorkoutId ?? "none"}
        visible={!!modalWorkoutId}
        onClose={closeModal}
        eyebrow={modalWorkout ? `Week ${modalWorkout.week_number} | Session ${modalWorkout.session_number}` : ""}
        title={modalWorkout ? modalWorkout.title || `Session ${modalWorkout.session_number}` : ""}
        state={modalState}
        completedDateLabel={modalCompletedAt ? formatDateMDY(dateInBoise(new Date(modalCompletedAt))) : null}
        futureLabel={modalWorkout ? (modalWorkout.week_number === currentWeek + 1 ? "Next week" : `Week ${modalWorkout.week_number}`) : null}
        loading={modalLoading || (!modalError && !modalContent)}
        error={modalError}
        onRetry={() => modalWorkout && openSession(modalWorkout)}
        exercises={modalContent?.exercises ?? []}
        loggedSets={modalContent?.loggedSets}
        userId={profile.id}
        source={state.source}
        session={modalWorkout ? { groupWorkoutId: modalWorkout.id } : undefined}
        ctaBusy={savingSession}
        onCta={handleSessionCta}
      />
    </ScrollView>
  );
}
