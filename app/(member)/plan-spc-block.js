import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import { getSpcClient } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises, listSpcWorkoutWeekTitlesForWorkouts } from "../../lib/programming/spcWorkouts";
import { listSpcCompletionDetailsForWorkouts, finalizeSpcSession } from "../../lib/programming/sessionCompletions";
import { retryOnce } from "../../lib/retry";
import { formatDateMDY } from "../../lib/formatDate";
import { SessionDetailModal } from "../../components/SessionDetailModal";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const TILE_COMPLETED_BORDER = "#4d6142";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

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
// hasn't happened yet shows its plain prescription. Unlike group, one
// spc_workouts row recurs across every week of the block (progression
// lives in spc_exercise_weeks columns), so completion and exercise targets
// are keyed by (workout, week), not workout alone.
export default function PlanSpcBlock() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ status: "loading" });
  const [currentWeek, setCurrentWeek] = useState(null);
  const [sessionContent, setSessionContent] = useState({}); // workoutId -> { warmups, exerciseRows }
  const [modalContext, setModalContext] = useState(null); // { workoutId, week }
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
        const spcClient = await getSpcClient(profile.id);
        if (!spcClient) return { status: "unassigned" };

        const today = todayInBoise();
        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) return { status: "no_block" };

        const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
        if (workouts.length === 0) return { status: "not_published" };

        const week = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
        const [weekTitles, completions] = await Promise.all([
          listSpcWorkoutWeekTitlesForWorkouts(workouts.map((w) => w.id)),
          listSpcCompletionDetailsForWorkouts(profile.id, workouts.map((w) => w.id)),
        ]);
        return { status: "ready", block, workouts, weekTitles, completions, week };
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
    return Array.from({ length: state.block.block_length_weeks }, (_, i) => i + 1);
  }, [state]);

  const openSession = async (workout, week) => {
    setModalContext({ workoutId: workout.id, week });
    if (sessionContent[workout.id]) return;
    setModalLoading(true);
    const [warmups, exerciseRows] = await Promise.all([listSpcWarmups(workout.id), listSpcWorkoutExercises(workout.id)]);
    setSessionContent((prev) => ({
      ...prev,
      [workout.id]: { warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean), exerciseRows },
    }));
    setModalLoading(false);
  };

  const closeModal = () => setModalContext(null);

  // Logging a missed past session — see plan-block.js's
  // handleFinalizeMissedSession for the full reasoning (same pattern here,
  // just keyed by (workout, week) since one spc_workouts row recurs across
  // every week of the block).
  const handleFinalizeMissedSession = async (workout, week, logDate) => {
    const completedAt = new Date(`${logDate}T12:00:00`).toISOString();
    await finalizeSpcSession(profile.id, workout.id, week, completedAt);
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = new Map(prev.completions);
      next.set(`${workout.id}:${week}`, completedAt);
      return { ...prev, completions: next };
    });
  };

  const goToMyFitness = () => router.push({ pathname: "/(member)/plan", params: { program: "spc" } });

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const modalWorkout = modalContext && state.status === "ready" ? state.workouts.find((w) => w.id === modalContext.workoutId) : null;
  const modalRaw = modalContext ? sessionContent[modalContext.workoutId] : null;
  const modalCompletedAt = modalContext ? state.completions?.get(`${modalContext.workoutId}:${modalContext.week}`) : null;
  const modalTitle =
    modalContext && modalWorkout
      ? (state.weekTitles[modalWorkout.id]?.[modalContext.week] || modalWorkout.title || `Session ${modalWorkout.session_number}`)
      : "";
  const modalExercises = modalContext && modalRaw
    ? modalRaw.exerciseRows.map((ex) => {
        const weekTarget = ex.spc_exercise_weeks.find((w) => w.week_number === modalContext.week);
        return {
          id: ex.id,
          exercise: ex.exercises,
          targetSets: weekTarget?.sets,
          targetReps: weekTarget?.reps,
          notes: weekTarget?.rest ? `rest ${weekTarget.rest}` : ex.notes,
        };
      })
    : [];

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      <Pressable onPress={goToMyFitness} className="mb-3 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ My Fitness</Text>
      </Pressable>

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
          <Text className="mb-0.5 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            SPC Plan
          </Text>
          <Text className="mb-5" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
            {formatDateMDY(state.block.block_start_date)} → {formatDateMDY(state.block.block_end_date)}
          </Text>

          {weeksInBlock.map((week) => {
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

                <View className="flex-row gap-2">
                  {state.workouts.map((workout) => {
                    const completedAt = state.completions.get(`${workout.id}:${week}`);
                    const isCompleted = !!completedAt;
                    const title = state.weekTitles[workout.id]?.[week] || workout.title || null;
                    return (
                      <Pressable
                        key={workout.id}
                        onPress={() => openSession(workout, week)}
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
                          {title ? ` — ${title}` : ""}
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
              </View>
            );
          })}
        </>
      )}

      <SessionDetailModal
        key={modalContext ? `${modalContext.workoutId}:${modalContext.week}` : "none"}
        visible={!!modalContext}
        onClose={closeModal}
        title={modalTitle}
        completed={!!modalCompletedAt}
        completedDateLabel={modalCompletedAt ? formatDateMDY(dateInBoise(new Date(modalCompletedAt))) : null}
        loading={modalLoading || !modalRaw}
        warmups={modalRaw?.warmups}
        userId={profile.id}
        datePerformed={modalCompletedAt ? dateInBoise(new Date(modalCompletedAt)) : null}
        loggable={modalContext ? modalContext.week <= currentWeek : false}
        defaultLogDate={todayInBoise()}
        source="spc"
        exercises={modalExercises}
        onFinalize={(logDate) => handleFinalizeMissedSession(modalWorkout, modalContext.week, logDate)}
      />
    </ScrollView>
  );
}
