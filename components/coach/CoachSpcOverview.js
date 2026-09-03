import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getClientGoal } from "../../lib/programming/clientGoals";
import { ClientGoalCard } from "../ClientGoalCard";
import { getUser } from "../../lib/programming/clients";
import { getSpcClient } from "../../lib/programming/spcClients";
import { listSpcWorkoutsForBlock, listBlocksForSpcClient, labelBlocks } from "../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises, setSpcWorkoutScheduledWeek } from "../../lib/programming/spcWorkouts";
import { listSpcCompletionDetailsForWorkouts } from "../../lib/programming/sessionCompletions";
import { listSpcSessionActivity } from "../../lib/programming/spcSessionActivity";
import { SessionSheet } from "../SessionSheet";
import { BlockProgressHero } from "../BlockProgressHero";
import { SpcBlockCalendar } from "./SpcBlockCalendar";
import { calendarMeta } from "./spcCalendarModel";
import { BlockPicker, blockHeroTitle } from "../BlockPicker";
import { CommentThread } from "../CommentThread";
import { PressFade } from "../PressFade";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";

// Coach-side read view of one SPC client's block, in the member's own
// language — the sibling of app/(coach)/blocks/overview.js. Same reasoning:
// the builder is a build surface and doesn't hold up on a phone, and this
// answers "what is this client actually doing" instead.
//
// The block reads as a calendar (SpcBlockCalendar, phase 3 of the SPC rework
// spec): calendar weeks down the side, one full-width bar per session across.
// A pending session is full width because that is literally what it is — SPC
// has no day-of-week routing, so a session is any day that week — and it
// collapses to a chip on the day she finalized once it's done.
//
// This is the phone view, and the phone is where coaches actually read this.
// It also backs the native route and the web "Preview" button; the desktop
// client page keeps its build grid, with copy mode and End here.
function prescriptionLine(ex) {
  const reps = Array.isArray(ex.rep_scheme) && new Set(ex.rep_scheme).size > 1 ? ex.rep_scheme.join(", ") : ex.reps;
  return `${ex.sets ?? "–"} × ${reps ?? "–"}`;
}

// `showBack`/`showName` are on when this is pushed as its own route and off
// when it's embedded in the client page, which already has both.
// `goalEditable` is opt-in because this same component backs the web
// "Preview" route, which is meant to be the member's own view — an edit
// affordance there would misrepresent what she actually sees.
export function CoachSpcOverview({ userId, showBack = false, embedded = false, footer = null, backTo = null, goalEditable = false }) {
  const { profile } = useAuth();
  const [goalRow, setGoalRow] = useState(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [state, setState] = useState({ status: "loading" });
  const [sessionContent, setSessionContent] = useState({});
  const [modalWorkoutId, setModalWorkoutId] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setSessionContent({});
    setShowAllWeeks(false);
    try {
      const [member, spcClient] = await Promise.all([getUser(userId), getSpcClient(userId)]);
      // Isolated: throws until 0078 is run, and must never blank the block.
      setGoalRow(await getClientGoal(userId).catch(() => null));
      if (!spcClient) return setState({ status: "not_enrolled", member });

      const today = todayInBoise();
      // Every block this client has had, oldest first and already numbered by
      // labelBlocks — the picker steps through finished ones and anything
      // queued ahead.
      // Drafts (0089) are excluded: this is the client's own view of her
      // programming, and a block she has not been given isn't part of it yet.
      const blocks = labelBlocks((await listBlocksForSpcClient(userId)).filter((b) => b.status !== "draft"))
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
      // Both isolated: the calendar's states degrade to "nothing is finished
      // yet" without completions, which is wrong but readable. Letting either
      // throw would blank a block that is otherwise fine.
      const [completions, activity] = await Promise.all([
        listSpcCompletionDetailsForWorkouts(userId, workouts.map((w) => w.id)).catch(() => new Map()),
        listSpcSessionActivity({ userId, block, workouts }).catch(() => new Map()),
      ]);
      const week = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);

      setState({ status: "ready", member, spcClient, blocks, block, workouts, completions, activity, week, today });
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
    const { workouts } = state;
    return { published: workouts.filter((w) => w.status === "published").length, total: workouts.length };
  }, [state]);

  // Optimistic: a drag that waits on a round trip before the bar lands reads
  // as a failed drop. On failure the workouts array is put back exactly as it
  // was and the coach is told — never left looking at a move that didn't
  // happen.
  const handleMoveSession = async (bar, week) => {
    if (!bar?.workout || state.status !== "ready") return;
    const before = state.workouts;
    const target = week === bar.workout.week_number ? null : week;
    setState((prev) =>
      prev.status === "ready"
        ? { ...prev, workouts: prev.workouts.map((w) => (w.id === bar.workout.id ? { ...w, scheduled_week: target } : w)) }
        : prev
    );
    try {
      await setSpcWorkoutScheduledWeek(bar.workout.id, week);
      toastSuccess(target == null ? `S${bar.sessionNumber} is back in week ${bar.workout.week_number}.` : `S${bar.sessionNumber} moved to week ${week}.`);
    } catch (err) {
      setState((prev) => (prev.status === "ready" ? { ...prev, workouts: before } : prev));
      toastError("Couldn't move that session.", err);
    }
  };

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
          {/* The shared goal — same card the coach edits on the web SPC
              page and the member reads on her session. */}
          <ClientGoalCard
            goal={goalRow?.goal}
            userId={userId}
            clientName={state.member?.name}
            editable={goalEditable}
            editorId={profile?.id}
            showSharedMark={goalEditable}
            onSaved={setGoalRow}
            style={{ marginBottom: 14 }}
          />

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

          <SpcBlockCalendar
            block={state.block}
            workouts={state.workouts}
            completions={state.completions}
            activity={state.activity}
            sessionsPerWeek={state.spcClient?.sessions_per_week ?? 1}
            today={state.today}
            meta={calendarMeta({ block: state.block, sessionsPerWeek: state.spcClient?.sessions_per_week })}
            onSelectSession={openSession}
            onMoveSession={handleMoveSession}
            showAll={showAllWeeks}
            onToggleShowAll={() => setShowAllWeeks((v) => !v)}
          />

          {/* Coach-to-coach notes on the block being viewed. The pre-overview
              version of this page carried them and the restructure dropped
              them; on a phone this screen IS the block, so it's where a note
              about the block belongs. Keyed on the selected block, so the
              picker re-reads its notes. */}
          <View style={{ marginTop: 18 }}>
            <CommentThread spcBlockId={state.block.id} />
          </View>
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
