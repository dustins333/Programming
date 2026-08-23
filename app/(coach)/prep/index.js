import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { SessionPrepView, PrepEyebrow } from "../../../components/coach/SessionPrepView";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateRange } from "../../../lib/formatDate";
import { listGroupPrograms, listBlocksForProgram, listWorkoutsForBlock } from "../../../lib/programming/blocks";
import { listWorkoutExerciseRowsForWorkouts, listWarmupsForWorkouts } from "../../../lib/programming/workouts";
import { listSessionEducationForBlock } from "../../../lib/programming/sessionEducation";
import { fonts, colors } from "../../../lib/theme";

// Coach Prep — read the block before you run it.
//
// A coach opens this on their phone to learn a new block: pick the program,
// pick the block (current, or anything queued behind it), then a session tab.
// Under each tab the session overview and the coach education for it are one
// thing rather than two screens — which is the point, since the notes only
// mean anything against the lifts they're about.
//
// Group only for now (Terra's call). Notes are keyed to (block, session), so
// what shows here is the same whichever week of the block you're in — see
// migration 0079.
//
// Universal file, no .web.js sibling: a read view with no table and no
// drag-and-drop, so one phone-first layout with a max width is right on both.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const MAX_WIDTH = 760;

function Pill({ label, sublabel, tag, active, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: active ? colors.primary : "#fff",
        borderWidth: 1,
        borderColor: active ? colors.primary : CARD_BORDER,
      }}
    >
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: active ? "#fff" : "#2a211c" }}>
        {label}
      </Text>
      {sublabel ? (
        <Text
          maxFontSizeMultiplier={1.15}
          style={{ fontFamily: fonts.sans, fontSize: 11.5, marginTop: 2, color: active ? "#f7e6df" : "#6f6862" }}
        >
          {sublabel}
        </Text>
      ) : null}
      {tag ? (
        <Text
          maxFontSizeMultiplier={1.15}
          style={{
            fontFamily: fonts.sansBold,
            fontSize: 10,
            letterSpacing: 0.8,
            marginTop: 3,
            color: active ? "#fff" : colors.primaryOnWhite,
          }}
        >
          {tag}
        </Text>
      ) : null}
    </PressFade>
  );
}

function SessionTab({ label, active, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexGrow: 1,
        minWidth: 96,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: active ? "#33251f" : "#fff",
        borderWidth: 1,
        borderColor: active ? "#33251f" : CARD_BORDER,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.15}
        numberOfLines={1}
        style={{ textAlign: "center", fontFamily: fonts.sansBold, fontSize: 13.5, color: active ? "#fff" : "#57534e" }}
      >
        {label}
      </Text>
    </PressFade>
  );
}

export default function CoachPrep() {
  const router = useRouter();

  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState(null);
  const [blockId, setBlockId] = useState(null);
  const [sessionNumber, setSessionNumber] = useState(null);
  const [state, setState] = useState({ status: "loading" });

  const load = useCallback(async () => {
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const today = todayInBoise();
      const list = await listGroupPrograms();
      setPrograms(list);
      const program = list.find((p) => p.id === programId) ?? list[0];
      if (!program) return setState({ status: "empty", message: "No group programs yet." });
      if (program.id !== programId) setProgramId(program.id);

      // Numbered by chronological position — the same rule the block overview
      // and SPC's labelBlocks use — then filtered to what a coach can still
      // prepare for: whatever is running now plus anything queued behind it.
      // A finished block is history, not prep.
      const all = await listBlocksForProgram(program.id);
      const blocks = all.map((b, i) => ({ ...b, label: `Block ${i + 1}` })).filter((b) => b.block_end_date >= today);
      if (blocks.length === 0) {
        return setState({ status: "empty", program, message: `Nothing current or upcoming for ${program.name}.` });
      }

      // Resolved rather than written back into state — setting it here would
      // change load()'s own dependency and fire a second fetch on every open.
      const block = blocks.find((b) => b.id === blockId) ?? blocks[0];

      // Drafts included, deliberately: the whole point is reading a block
      // before it's posted, which is exactly what the member view hides.
      const workouts = await listWorkoutsForBlock(block.id);
      const ids = workouts.map((w) => w.id);
      const [exercisesByWorkout, warmupsByWorkout, educationBySession] = await Promise.all([
        listWorkoutExerciseRowsForWorkouts(ids),
        listWarmupsForWorkouts(ids),
        // Isolated: an unrun 0079 must not take the session overview down
        // with it, since the overview is useful on its own.
        listSessionEducationForBlock(block.id).catch((err) => {
          console.error("Coach Prep: failed to load coach education", err);
          return {};
        }),
      ]);

      setState({ status: "ready", today, program, blocks, block, workouts, exercisesByWorkout, warmupsByWorkout, educationBySession });
    } catch (err) {
      console.error("Coach Prep: failed to load", err);
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [programId, blockId]);

  // useFocusEffect, not a mount-only effect — a coach who edits the notes in
  // the builder and comes back must see them, not last visit's copy.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Sessions come from what's actually in the block rather than from the
  // program's sessions_per_week: a program whose frequency changed still has
  // older blocks carrying the session count they were built with.
  const sessions = useMemo(() => {
    if (state.status !== "ready") return [];
    return [...new Set(state.workouts.map((w) => w.session_number))].sort((a, b) => a - b);
  }, [state]);

  const activeSession = sessions.includes(sessionNumber) ? sessionNumber : (sessions[0] ?? null);

  // One representative workout per session. Notes span the whole block, and a
  // group session's lifts are normally the same every week (only the
  // prescription progresses), so the earliest week that actually has lifts in
  // it is what "Session 2 is…" means. Which week that is gets named on screen.
  const view = useMemo(() => {
    if (state.status !== "ready" || activeSession == null) return null;
    const forSession = state.workouts
      .filter((w) => w.session_number === activeSession)
      .sort((a, b) => a.week_number - b.week_number);
    const workout = forSession.find((w) => (state.exercisesByWorkout[w.id] ?? []).length > 0) ?? forSession[0];
    if (!workout) return null;
    // Unioned across every week of the session, not just the week on screen —
    // a note can be attached to a warm-up that only appears later in the
    // block, and it should still read as a warm-up note.
    const warmupExerciseIds = new Set();
    for (const w of forSession) {
      for (const wu of state.warmupsByWorkout[w.id] ?? []) {
        if (wu.exercises?.id) warmupExerciseIds.add(wu.exercises.id);
      }
    }
    return {
      warmupExerciseIds,
      workout,
      weeks: forSession.length,
      exercises: state.exercisesByWorkout[workout.id] ?? [],
      warmups: state.warmupsByWorkout[workout.id] ?? [],
      // A box a coach opened and never filled in is not content — drop it
      // rather than render an empty card on the read side.
      education: (state.educationBySession[activeSession] ?? []).filter(
        (e) => (e.notes ?? "").trim() || (e.video_url ?? "").trim()
      ),
    };
  }, [state, activeSession]);

  if (state.status === "loading") {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerStyle={{ padding: 18, paddingBottom: 44 }}>
        <View style={{ width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" }}>
          <PressFade
            onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)"))}
            hitSlop={10}
            style={{ alignSelf: "flex-start", marginBottom: 10 }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ Back</Text>
          </PressFade>

          <Text style={{ fontFamily: fonts.display, fontSize: 27, color: colors.primary }}>Coach Prep</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: "#6f6862", marginTop: 4 }}>
            Read a block before you run it — what's in each session, and what your coaches need to know.
          </Text>

          {programs.length > 1 ? (
            <View style={{ marginTop: 20 }}>
              <PrepEyebrow>PROGRAM</PrepEyebrow>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {programs.map((p) => (
                  <Pill
                    key={p.id}
                    label={p.name}
                    active={p.id === (state.program?.id ?? programId)}
                    onPress={() => {
                      setProgramId(p.id);
                      setBlockId(null);
                      setSessionNumber(null);
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {state.status !== "ready" ? (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: "#6f6862" }}>
                {state.status === "error" ? `Something went wrong: ${state.message}` : state.message}
              </Text>
              {state.status === "error" ? (
                <PressFade onPress={load} hitSlop={8} style={{ marginTop: 8, alignSelf: "flex-start" }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>Retry</Text>
                </PressFade>
              ) : null}
            </View>
          ) : (
            <>
              <View style={{ marginTop: 20 }}>
                <PrepEyebrow>BLOCK</PrepEyebrow>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {state.blocks.map((b) => (
                    <Pill
                      key={b.id}
                      label={b.label}
                      sublabel={formatDateRange(b.block_start_date, b.block_end_date)}
                      tag={b.block_start_date <= state.today ? "CURRENT" : "UPCOMING"}
                      active={b.id === state.block.id}
                      onPress={() => {
                        setBlockId(b.id);
                        setSessionNumber(null);
                      }}
                    />
                  ))}
                </View>
              </View>

              {sessions.length > 0 ? (
                <View style={{ marginTop: 22, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {sessions.map((n) => (
                    <SessionTab
                      key={n}
                      label={`Session ${n}`}
                      active={n === activeSession}
                      onPress={() => setSessionNumber(n)}
                    />
                  ))}
                </View>
              ) : null}

              {view ? (
                <SessionPrepView
                  workout={view.workout}
                  exercises={view.exercises}
                  warmups={view.warmups}
                  education={view.education}
                  warmupExerciseIds={view.warmupExerciseIds}
                  weeks={view.weeks}
                />
              ) : (
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: "#6f6862", marginTop: 20 }}>
                  Nothing written in this block yet.
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </CoachShell>
  );
}
