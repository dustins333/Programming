import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, blockLengthWeeks } from "../../lib/programming/schedule";
import { listGroupPrograms, listBlocksForProgram, listWorkoutsForBlock } from "../../lib/programming/blocks";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { SessionSheet } from "../SessionSheet";
import { BlockProgressHero } from "../BlockProgressHero";
import { BlockWeekCard } from "../BlockWeekCard";
import { BlockPicker, blockHeroTitle } from "../BlockPicker";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";

// Coach-side read view of a block, in the member's own language.
//
// The builder — even opened read-only — is a build surface: dense, wide, and
// not something you can hold up on a phone between clients. This answers the
// other question: "what is this block, and what's in each session." Same
// hero, same week containers, same session sheet the member sees, so a coach
// and a client are looking at one thing rather than two descriptions of it.
//
// Deliberately NOT adherence-coloured: a group block is shared across every
// client on the program, so there's no single person's completion to tint a
// week by. Every week reads plain and only the current one is marked. (SPC is
// the opposite — it's one client, so that view keeps the real member states;
// see app/(coach)/spc/[userId].js.)
// "This one doesn't stop." One component so the two placements below can't
// drift apart on wording.
function OngoingNote() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        // The week card above carries marginBottom: 11 — pull up slightly so
        // the note reads as attached to it, then restore the gap below.
        marginTop: -2,
        marginBottom: 14,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: "#eef1e7",
        borderWidth: 1,
        borderColor: "#cfdac0",
      }}
    >
      <Ionicons name="infinite-outline" size={16} color="#4d6142" />
      <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#4d6142" }}>
        This program is set to ongoing. A new week is added automatically, so it won't run out.
      </Text>
    </View>
  );
}

function prescriptionLine(ex) {
  const reps = Array.isArray(ex.rep_scheme) && new Set(ex.rep_scheme).size > 1 ? ex.rep_scheme.join(", ") : ex.reps;
  return `${ex.sets ?? "–"} × ${reps ?? "–"}`;
}

// `showBack` is off when this is the whole screen (the native Group Programs
// tab) and on when it's pushed as its own route from the web build.
export function CoachBlockOverview({ initialProgramId = null, showBack = false, onBack, footer = null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const programParam = initialProgramId;
  const [programs, setPrograms] = useState(null);
  const [selectedProgramId, setSelectedProgramId] = useState(programParam ?? null);
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
      const list = await listGroupPrograms();
      setPrograms(list);
      const program = list.find((p) => p.id === selectedProgramId) ?? list[0];
      if (!program) return setState({ status: "no_programs" });
      if (program.id !== selectedProgramId) setSelectedProgramId(program.id);

      const today = todayInBoise();
      // Every block, oldest first, so the picker can step back through
      // finished ones and forward into anything already queued. Numbered by
      // chronological position, same rule SPC's labelBlocks uses.
      const rows = await listBlocksForProgram(program.id);
      const blocks = rows.map((b, i) => ({ ...b, label: `Block ${i + 1}` }));
      if (blocks.length === 0) return setState({ status: "no_block", program, blocks });

      // Default to the block covering today; failing that the most recent
      // one, so a program between blocks opens on what just finished rather
      // than on nothing.
      const current = blocks.find((b) => b.block_start_date <= today && today <= b.block_end_date);
      // Resolved rather than written back into state: setting it here would
      // change load()'s own dependency and fire a second full fetch on every
      // first open. The picker reads state.block.id instead.
      const block = blocks.find((b) => b.id === selectedBlockId) ?? current ?? blocks[blocks.length - 1];

      // Every workout, not just published ones — a coach previewing a block
      // needs to see what's still a draft, which is exactly what the member
      // view hides.
      const workouts = await listWorkoutsForBlock(block.id);
      const week = currentWeekNumber(block.block_start_date, blockLengthWeeks(block, program), today);

      setState({ status: "ready", program, blocks, block, workouts, week, today });
    } catch (err) {
      console.error("Coach block overview: failed to load", err);
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [selectedProgramId, selectedBlockId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const blockView = useMemo(() => {
    if (state.status !== "ready") return null;
    const { program, block, workouts, week, today } = state;
    // A finished or not-yet-started block has no "this week" to mark.
    const isCurrentBlock = block.block_start_date <= today && today <= block.block_end_date;
    const slots = program.sessions_per_week ?? 3;
    const weeks = Array.from({ length: blockLengthWeeks(block, program) }, (_, i) => i + 1)
      .map((weekNumber) => {
        const sessions = workouts
          .filter((w) => w.week_number === weekNumber)
          .sort((a, b) => a.session_number - b.session_number);
        if (sessions.length === 0) return null;
        return {
          week: weekNumber,
          status: isCurrentBlock && weekNumber === week ? "current" : "neutral",
          sessions: sessions.map((workout) => ({
            workout,
            // Draft sessions read as the dashed "not filled in" tile — the one
            // thing a coach needs from this that a member never sees.
            state: workout.status === "published" ? "done" : "missed",
          })),
        };
      })
      .filter(Boolean);
    return {
      weeks,
      slots,
      published: workouts.filter((w) => w.status === "published").length,
      total: workouts.length,
      // auto_extend (0049) — the nightly scan grows this block a week at a
      // time instead of letting it end. Read straight off the block so the
      // note below can only ever say it about the block being looked at.
      ongoing: Boolean(block.auto_extend),
      isCurrentBlock,
    };
  }, [state]);

  const openSession = async (workout) => {
    setModalWorkoutId(workout.id);
    if (sessionContent[workout.id]) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const [warmups, exercises] = await Promise.all([listWarmups(workout.id), listWorkoutExercises(workout.id)]);
      setSessionContent((prev) => ({
        ...prev,
        [workout.id]: {
          warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
          exercises: exercises.map((ex) => ({
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

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-5 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      {showBack ? (
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <PressFade onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.push("/(coach)/blocks"))} hitSlop={10} style={{}}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>‹ Back</Text>
          </PressFade>
        </View>
      ) : null}

      {/* One pill per program — the whole selector, since a coach previewing
          is choosing between programs, not filtering within one. */}
      {programs && programs.length > 1 ? (
        <View className="mb-4 flex-row flex-wrap" style={{ gap: 7 }}>
          {programs.map((p) => {
            const active = p.id === selectedProgramId;
            return (
              <PressFade
                key={p.id}
                onPress={() => {
                  setSelectedProgramId(p.id);
                  setSelectedBlockId(null);
                }}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  backgroundColor: active ? colors.primary : "#fff",
                  borderWidth: 1,
                  borderColor: active ? colors.primary : "#ece7e1",
                }}
              >
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: active ? "#fff" : "#57534e" }}>
                  {p.name}
                </Text>
              </PressFade>
            );
          })}
        </View>
      ) : null}

      {/* Only for a program flagged hub_enabled (0106) — LLYL, where everyone
          lifts the same session, not every group type. Lands on the live
          screen with this program's segment already open. */}
      {state.program?.hub_enabled ? (
        <PressFade
          onPress={() => router.push(`/(coach)/spc/live?program=${state.program.id}`)}
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#e8c4b8",
            backgroundColor: "#fdf6f2",
            paddingHorizontal: 13,
            paddingVertical: 7,
          }}
        >
          <Ionicons name="tv-outline" size={15} color={colors.primaryOnWhite} />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            Live session
          </Text>
        </PressFade>
      ) : null}

      {state.status !== "ready" ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>
          {state.status === "no_programs"
            ? "No group programs yet."
            : state.status === "error"
              ? `Something went wrong: ${state.message}`
              : `No active ${state.program?.name ?? ""} block right now.`}
        </Text>
      ) : (
        <>
          <BlockPicker blocks={state.blocks} selectedId={state.block.id} onSelect={setSelectedBlockId} today={state.today} />

          <BlockProgressHero
            title={blockHeroTitle({
              block: state.block,
              label: state.block.label,
              weeks: blockLengthWeeks(state.block, state.program),
              currentWeek: state.week,
              today: state.today,
            })}
            done={blockView.published}
            total={blockView.total}
            footer={`${blockView.published} of ${blockView.total} sessions published`}
          />

          {blockView.weeks.map((week) => (
            <View key={week.week}>
              <BlockWeekCard
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
              {/* Directly under the current week, because that's where a coach
                  is looking when the question "does this stop soon?" comes up.
                  The setting itself lives in the Extend controls on the web
                  Group Programs page, which is nowhere near here. */}
              {blockView.ongoing && week.status === "current" ? <OngoingNote /> : null}
            </View>
          ))}

          {/* A finished or not-yet-started block has no current week to hang
              the note under, so say it once at the end instead. */}
          {blockView.ongoing && !blockView.isCurrentBlock ? <OngoingNote /> : null}

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
    </ScrollView>
  );
}
