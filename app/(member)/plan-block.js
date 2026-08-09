import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import {
  listMyAssignments,
  getCurrentBlock,
  listPublishedWorkoutsForBlock,
} from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { listGroupCompletionDetailsForWorkouts, finalizeGroupSession } from "../../lib/programming/sessionCompletions";
import { retryOnce } from "../../lib/retry";
import { formatDateMDY } from "../../lib/formatDate";
import { SessionDetailModal } from "../../components/SessionDetailModal";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const TILE_COMPLETED_BORDER = "#4d6142";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

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
        const week = currentWeekNumber(block.block_start_date, program.block_length_weeks, todayInBoise());
        // logs.source predates multi-membership and only special-cases
        // Flagship/BWA by name — any other program tags with the generic
        // 'group' value, same rule plan.js's own load() uses.
        const source = program.name === "Flagship" ? "flagship" : program.name === "Better With Age" ? "bwa" : "group";
        return { status: "ready", program, block, workouts, completions, source, week };
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
    return Array.from({ length: state.program.block_length_weeks }, (_, i) => i + 1);
  }, [state]);

  const openSession = async (workout) => {
    setModalWorkoutId(workout.id);
    if (sessionContent[workout.id]) return;
    setModalLoading(true);
    const [warmups, exercises] = await Promise.all([listWarmups(workout.id), listWorkoutExercises(workout.id)]);
    setSessionContent((prev) => ({
      ...prev,
      [workout.id]: {
        warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
        exercises: exercises.map((ex) => ({
          id: ex.id,
          exercise: ex.exercises,
          targetSets: ex.sets,
          targetReps: ex.reps,
          repScheme: ex.rep_scheme,
          supersetGroupId: ex.superset_group_id,
          notes: ex.tempo ? `tempo ${ex.tempo}${ex.notes ? ` · ${ex.notes}` : ""}` : ex.notes,
        })),
      },
    }));
    setModalLoading(false);
  };

  const closeModal = () => setModalWorkoutId(null);

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
    const completedAt = new Date(`${logDate}T12:00:00`).toISOString();
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

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      <Pressable onPress={goBack} className="mb-3 flex-row items-center gap-1 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>

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
          <Text className="mb-0.5 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {state.program.name} Plan
          </Text>
          <Text className="mb-5" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
            {formatDateMDY(state.block.block_start_date)} → {formatDateMDY(state.block.block_end_date)}
          </Text>

          {weeksInBlock.map((week) => {
            const sessionsForWeek = state.workouts
              .filter((w) => w.week_number === week)
              .sort((a, b) => a.session_number - b.session_number);
            const isCurrent = week === currentWeek;
            return (
              <View key={week} className="mb-5">
                <Text
                  className="mb-2 text-xs uppercase"
                  style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, color: isCurrent ? colors.primaryOnWhite : "#a8a29e" }}
                >
                  Week {week}
                  {isCurrent ? " · Current" : ""}
                </Text>

                {sessionsForWeek.length === 0 ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", fontStyle: "italic" }}>Not published yet</Text>
                ) : (
                  <View className="flex-row gap-2">
                    {sessionsForWeek.map((workout) => {
                      const completedAt = state.completions.get(workout.id);
                      const isCompleted = !!completedAt;
                      return (
                        <Pressable
                          key={workout.id}
                          onPress={() => openSession(workout)}
                          className="items-center justify-center rounded-2xl bg-white px-2 py-3.5"
                          style={{
                            flex: 1,
                            minHeight: 56,
                            borderWidth: isCompleted ? 2 : 1,
                            borderColor: isCompleted ? TILE_COMPLETED_BORDER : CARD_BORDER,
                            ...CARD_SHADOW,
                          }}
                        >
                          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c", textAlign: "center" }} numberOfLines={2}>
                            Session {workout.session_number}
                            {workout.title ? ` — ${workout.title}` : ""}
                          </Text>
                          {isCompleted ? (
                            <Text className="mt-0.5" style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, color: "#4d6142" }}>
                              ✓ {formatDateMDY(dateInBoise(new Date(completedAt)))}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <SessionDetailModal
        key={modalWorkoutId ?? "none"}
        visible={!!modalWorkoutId}
        onClose={closeModal}
        title={modalWorkout ? `Session ${modalWorkout.session_number}${modalWorkout.title ? ` — ${modalWorkout.title}` : ""}` : ""}
        completed={!!modalCompletedAt}
        completedDateLabel={modalCompletedAt ? formatDateMDY(dateInBoise(new Date(modalCompletedAt))) : null}
        loading={modalLoading || !modalContent}
        warmups={modalContent?.warmups}
        userId={profile.id}
        datePerformed={modalCompletedAt ? dateInBoise(new Date(modalCompletedAt)) : null}
        loggable={modalWorkout ? modalWorkout.week_number <= currentWeek : false}
        defaultLogDate={todayInBoise()}
        source={state.source}
        exercises={modalContent?.exercises ?? []}
        onFinalize={(logDate) => handleFinalizeMissedSession(modalWorkout, logDate)}
      />
    </ScrollView>
  );
}
