import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import { getUser } from "../../lib/programming/clients";
import { getSpcClient } from "../../lib/programming/spcClients";
import { listSpcWorkoutsForBlock, listBlocksForSpcClient, labelBlocks } from "../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";
import { SessionSheet } from "../SessionSheet";
import { BlockProgressHero } from "../BlockProgressHero";
import { BlockWeekCard } from "../BlockWeekCard";
import { BlockPicker, blockHeroTitle } from "../BlockPicker";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";

// Coach-side read view of one SPC client's block, in the member's own
// language — the sibling of app/(coach)/blocks/overview.js. Same reasoning:
// the builder is a build surface and doesn't hold up on a phone, and this
// answers "what is this client actually doing" instead.
//
// Weeks read plain with only the current one marked; a draft session shows as
// the dashed tile. Adherence is deliberately left to the SPC dashboard and the
// session read-out — this screen is about the programming, not the client's
// week-by-week record.
function prescriptionLine(ex) {
  const reps = Array.isArray(ex.rep_scheme) && new Set(ex.rep_scheme).size > 1 ? ex.rep_scheme.join(", ") : ex.reps;
  return `${ex.sets ?? "–"} × ${reps ?? "–"}`;
}

// `showBack`/`showName` are on when this is pushed as its own route and off
// when it's embedded in the client page, which already has both.
export function CoachSpcOverview({ userId, showBack = false, embedded = false, footer = null, backTo = null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [state, setState] = useState({ status: "loading" });
  const [sessionContent, setSessionContent] = useState({});
  const [modalWorkoutId, setModalWorkoutId] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setSessionContent({});
    try {
      const [member, spcClient] = await Promise.all([getUser(userId), getSpcClient(userId)]);
      if (!spcClient) return setState({ status: "not_enrolled", member });

      const today = todayInBoise();
      // Every block this client has had, oldest first and already numbered by
      // labelBlocks — the picker steps through finished ones and anything
      // queued ahead.
      const blocks = labelBlocks(await listBlocksForSpcClient(userId))
        .slice()
        .sort((a, b) => (a.block_start_date < b.block_start_date ? -1 : 1));
      if (blocks.length === 0) return setState({ status: "no_block", member });

      // Resolved, not written back — see the group overview for why setting
      // it here would double-fetch on every open.
      const current = blocks.find((b) => b.block_start_date <= today && today <= b.block_end_date);
      const block = blocks.find((b) => b.id === selectedBlockId) ?? current ?? blocks[blocks.length - 1];

      // Every workout, drafts included — the one thing a coach needs here
      // that the member's own view deliberately hides.
      const workouts = await listSpcWorkoutsForBlock(block.id);
      const week = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);

      setState({ status: "ready", member, spcClient, blocks, block, workouts, week, today });
    } catch (err) {
      console.error("Coach SPC overview: failed to load", err);
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [userId, selectedBlockId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const blockView = useMemo(() => {
    if (state.status !== "ready") return null;
    const { block, workouts, week, today } = state;
    const isCurrentBlock = block.block_start_date <= today && today <= block.block_end_date;
    const slots = Math.max(1, ...workouts.map((w) => w.session_number));
    const weeks = Array.from({ length: block.block_length_weeks }, (_, i) => i + 1)
      .map((weekNumber) => {
        const sessions = workouts.filter((w) => w.week_number === weekNumber).sort((a, b) => a.session_number - b.session_number);
        if (sessions.length === 0) return null;
        return {
          week: weekNumber,
          status: isCurrentBlock && weekNumber === week ? "current" : "neutral",
          sessions: sessions.map((workout) => ({
            workout,
            state: workout.status === "published" ? "done" : "missed",
          })),
        };
      })
      .filter(Boolean);
    return { weeks, slots, published: workouts.filter((w) => w.status === "published").length, total: workouts.length };
  }, [state]);

  const openSession = async (workout) => {
    setModalWorkoutId(workout.id);
    if (sessionContent[workout.id]) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const [warmups, exerciseRows] = await Promise.all([listSpcWarmups(workout.id), listSpcWorkoutExercises(workout.id)]);
      setSessionContent((prev) => ({
        ...prev,
        [workout.id]: {
          warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
          exercises: exerciseRows.map((ex) => ({
            id: ex.id,
            exerciseId: ex.exercises?.id ?? ex.exercise_id,
            name: ex.exercises?.name ?? "Exercise",
            detail: prescriptionLine(ex),
            supersetGroupId: ex.superset_group_id,
            targetSets: ex.sets,
          })),
        },
      }));
    } catch (err) {
      setModalError(err.message ?? String(err));
    } finally {
      setModalLoading(false);
    }
  };

  const modalWorkout = state.status === "ready" ? state.workouts.find((w) => w.id === modalWorkoutId) : null;
  const modalContent = modalWorkoutId ? sessionContent[modalWorkoutId] : null;
  // Embedded inside the client page, the host already owns the scroller —
  // a ScrollView inside a ScrollView eats the drag.
  const Container = embedded ? View : ScrollView;

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Container
      {...(embedded
        ? {}
        : {
            className: "flex-1",
            style: { backgroundColor: CANVAS },
            contentContainerClassName: "px-5 pb-8",
            contentContainerStyle: { paddingTop: insets.top + 6 },
          })}
    >
      {showBack ? (
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <PressFade onPress={() => (router.canGoBack() ? router.back() : router.push(backTo ?? "/(coach)/spc"))} hitSlop={10} style={{}}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>‹ Back</Text>
          </PressFade>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e", flexShrink: 1 }}>
            {state.member?.name ?? "SPC"}
          </Text>
        </View>
      ) : null}

      {state.status !== "ready" ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>
          {state.status === "not_enrolled"
            ? "This client isn't enrolled in SPC."
            : state.status === "error"
              ? `Something went wrong: ${state.message}`
              : "No active SPC block right now."}
        </Text>
      ) : (
        <>
          <BlockPicker blocks={state.blocks} selectedId={state.block.id} onSelect={setSelectedBlockId} today={state.today} />

          <BlockProgressHero
            title={blockHeroTitle({
              block: state.block,
              label: state.block.label,
              weeks: state.block.block_length_weeks,
              currentWeek: state.week,
              today: state.today,
            })}
            done={blockView.published}
            total={blockView.total}
            footer={`${blockView.published} of ${blockView.total} sessions published`}
          />

          {blockView.weeks.map((week) => (
            <BlockWeekCard
              key={week.week}
              weekNumber={week.week}
              status={week.status}
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
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>Nothing written in this block yet.</Text>
          ) : null}
        </>
      )}

      {footer}

      <SessionSheet
        key={modalWorkoutId ?? "none"}
        visible={!!modalWorkoutId}
        onClose={() => setModalWorkoutId(null)}
        eyebrow={modalWorkout ? `Week ${modalWorkout.week_number} | Session ${modalWorkout.session_number}` : ""}
        title={modalWorkout ? modalWorkout.title || `Session ${modalWorkout.session_number}` : ""}
        state="future"
        pillLabel={modalWorkout ? (modalWorkout.status === "published" ? "PUBLISHED" : "DRAFT") : undefined}
        loading={modalLoading || (!modalError && !modalContent)}
        error={modalError}
        onRetry={() => modalWorkout && openSession(modalWorkout)}
        exercises={modalContent?.exercises ?? []}
        footerNote="Open the builder to make changes"
      />
    </Container>
  );
}
