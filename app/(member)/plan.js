import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate } from "../../lib/programming/schedule";
import { listMyAssignments, getCurrentBlock, getWorkout, listWorkoutsForWeek } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getSpcClient, isSpcActive } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "../../lib/programming/spcBlocks";
import { listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";
import { listActiveOneOffWorkoutsForUser, listOneOffWarmups, listOneOffExercises } from "../../lib/programming/oneOffWorkouts";
import {
  getGroupCompletion,
  listGroupCompletionsForWorkouts,
  getCompletedSpcWorkoutIdsForWeek,
  finalizeGroupSession,
  finalizeSpcSession,
  finalizeOneOffSession,
} from "../../lib/programming/sessionCompletions";
import { retryOnce } from "../../lib/retry";
import { SessionLogger } from "../../components/SessionLogger";
import { TimerControl } from "../../components/TimerControl";
import { fonts, colors } from "../../lib/theme";

// Design tokens from design_handoff_visual_pass_v4/README.md.
const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };
const EYEBROW_MUTED = { fontFamily: fonts.sansBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 };

// Matches My Week's card treatment — a light spacing wrapper, not its own
// bordered card (the individual pieces inside — banner, warmup card,
// exercise cards — carry their own white/bordered styling instead, so the
// page reads as a flat stack of distinct elements on the canvas background
// rather than one big enclosing box). `title` is only rendered when there's
// no tab bar above already naming the program (see ProgramTabs) — with tabs
// visible, a second big program name inside would just repeat the active tab.
function FitnessCard({ title, children }) {
  return (
    <View className="mb-6">
      {title ? (
        <Text className="mb-3 text-center" style={{ fontFamily: fonts.display, fontSize: 20, color: colors.primary }}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

// Only rendered when a member has more than one of {a group membership,
// SPC, one-offs} available — the point is to show one thing at a time
// instead of stacking everything forever down the page. One tab per
// group program membership now, not just a single hardcoded "flagship"
// slot, since a client can hold several memberships at once.
function ProgramTabs({ options, active, onSelect }) {
  return (
    <View className="mb-5 flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = active === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            className="flex-1 items-center justify-center rounded-full px-3 py-2.5"
            style={{
              borderWidth: 1.5,
              borderColor: colors.primary,
              backgroundColor: isActive ? colors.primary : "white",
              ...(isActive
                ? { shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10 }
                : null),
            }}
          >
            <Text
              numberOfLines={2}
              style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: isActive ? "white" : colors.primaryOnWhite, textAlign: "center" }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// SPC sessions aren't tied to a day of the week the way Flagship/BWA are,
// so when a client does more than one a week, which one they're working on
// right now has to be a choice, not a lookup — this is that picker. Only
// rendered when sessionsPerWeek > 1; a 1x/week client has nothing to pick
// between, so their single session just loads directly (same as before).
// Border-only states, no checkmark circle: done-but-not-selected gets the
// same 2px olive border as a completed session tile elsewhere in the app;
// selected-not-done gets a peach tint; everything else is a plain outline.
function SpcSessionPicker({ sessions, selected, onSelect }) {
  return (
    <View className="mb-4 flex-row gap-2.5">
      {sessions.map((s) => {
        const isSelected = s.sessionNumber === selected;
        const doneNotSelected = s.completed && !isSelected;
        return (
          <Pressable
            key={s.sessionNumber}
            onPress={() => onSelect(s.sessionNumber)}
            className="flex-1 items-center justify-center rounded-2xl py-4"
            style={{
              backgroundColor: isSelected ? "#fdf6f2" : "white",
              borderWidth: doneNotSelected ? 2 : isSelected ? 1.5 : 1,
              borderColor: doneNotSelected ? "#4d6142" : isSelected ? colors.primary : CARD_BORDER,
              ...CARD_SHADOW,
            }}
          >
            <Text style={{ fontFamily: isSelected ? fonts.sansBold : fonts.sansSemiBold, fontSize: 14, color: isSelected ? colors.primaryOnWhite : "#44403c" }}>
              Session {s.sessionNumber}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Which session is currently loaded below — eyebrow (program · week, small/
// uppercase, truncates rather than wrapping into the title) + title (the
// session's own name, falling back to "Session N"), plus a pill shortcut to
// the full multi-week block view. `completed` surfaces a small "Finalized"
// pill right here at the top of the page — the only place on My Fitness
// that previously showed no completion state at all, which made it hard to
// tell whether today's session had actually been finalized without
// scrolling all the way down to check the Finalize button itself.
function SelectedSessionBanner({ eyebrow, title, completed, onViewBlock }) {
  return (
    <View
      className="mb-4 flex-row items-center gap-3 rounded-2xl px-3.5 py-3"
      style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: completed ? "#4d6142" : "#f0ddd2" }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: fonts.sansBold, fontSize: 10, color: colors.primaryOnWhite, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}
        >
          {eyebrow}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#44403c" }}>{title}</Text>
          {completed && (
            <View className="flex-row items-center rounded-full" style={{ backgroundColor: "#e9f0e1", paddingLeft: 6, paddingRight: 8, paddingVertical: 2 }}>
              <Ionicons name="checkmark" size={9} color="#3f5136" style={{ marginRight: 3 }} />
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#3f5136" }}>Finalized</Text>
            </View>
          )}
        </View>
      </View>
      <Pressable
        onPress={onViewBlock}
        hitSlop={HITSLOP}
        style={{ flexShrink: 0, borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: "white" }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.primaryOnWhite }}>View full block ›</Text>
      </Pressable>
    </View>
  );
}

// Warm-up section — a bordered card of name/sets×reps rows, mirroring the
// exercise list's card language, instead of one joined "Warm-up: A, B" line.
// Renders the same warmup rows already fetched for the section (no new
// query), just restyled from an inline string into individual rows.
function WarmupCard({ warmups }) {
  if (!warmups || warmups.length === 0) return null;
  return (
    <>
      <Text style={EYEBROW_MUTED}>Warm-up</Text>
      <View className="mb-5 rounded-2xl bg-white px-3.5" style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}>
        {warmups.map((w, i) => {
          const detail = w.sets && w.reps ? `${w.sets}×${w.reps}` : w.sets || w.reps || "";
          return (
            <View
              key={w.id ?? i}
              className="flex-row items-center justify-between py-2.5"
              style={i < warmups.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f2eee9" } : undefined}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>{w.exercises?.name ?? w.label}</Text>
              {detail ? <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>{detail}</Text> : null}
            </View>
          );
        })}
      </View>
    </>
  );
}

// A manual stopwatch pinned above the scroll content, not tied to "the
// workout session" — a member might use it to time one lift, then reset and
// use it again to time their rest before the next set. Mirrors the docked
// Finalize footer's sibling-View pattern (pinned to the top instead of the
// bottom) rather than CSS position:sticky, since that has known cross-
// behavior quirks between native and Expo Web.
function TimerBar({ insetsTop, timer, onToggle, onReset }) {
  return (
    <View
      className="items-center"
      style={{ paddingTop: insetsTop + 10, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: CANVAS, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}
    >
      <TimerControl timer={timer} onToggle={onToggle} onReset={onReset} />
    </View>
  );
}

export default function MyFitness() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const [groups, setGroups] = useState([]); // one entry per group program membership
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [hasSpc, setHasSpc] = useState(false);
  const [spc, setSpc] = useState(null);
  const [spcDetail, setSpcDetail] = useState(null); // { sessionNumber, title, exercises } for whichever session is selected
  const [spcDetailLoading, setSpcDetailLoading] = useState(false);
  const [oneOffs, setOneOffs] = useState([]);
  const [selectedProgramOverride, setSelectedProgramOverride] = useState(null);
  const [footerFinalizing, setFooterFinalizing] = useState(false);
  const [timer, setTimer] = useState({ elapsedMs: 0, running: false, startedAt: null });

  // Same staleness guard as My Week's load() — useFocusEffect below re-runs
  // load() on every focus, and without this an older in-flight call can
  // resolve after a newer one and clobber good state with stale/incomplete
  // data, reading as sessions/titles randomly disappearing.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestIdRef.current !== requestId;
    setGroupsLoading(true);
    const today = todayInBoise();

    // Every membership loads independently — a client can hold several
    // group program memberships at once (e.g. Flagship plus a specialty
    // program), and one program's failure shouldn't hide another's, same
    // reasoning as group-vs-SPC-vs-one-offs below. Wrapped in retryOnce:
    // same reasoning as My Week's load() — a transient failure on the
    // first request batch right after a reload used to render identically
    // to "nothing here," only "fixed" by navigating away and back.
    try {
      const results = await retryOnce(async () => {
        const assignments = await listMyAssignments(profile.id);
        return Promise.all(
        assignments.map(async (assignment) => {
          const program = assignment.group_programs;
          // logs.source predates multi-membership and only special-cases
          // Flagship/BWA by name (migration 0004) — any other program
          // (e.g. a specialty program like "Look Like You Lift") tags its
          // logs with the generic 'group' value added in migration 0010.
          const source = program.name === "Flagship" ? "flagship" : program.name === "Better With Age" ? "bwa" : "group";
          try {
            const block = await getCurrentBlock(program.id, today);
            if (!block) return { groupProgramId: program.id, programName: program.name, status: "no_block" };

            const weekNumber = currentWeekNumber(block.block_start_date, program.block_length_weeks, today);

            // A client on a reduced schedule (e.g. 1x/week) can already be
            // done for the week on a day that the program's own calendar
            // mapping still assigns to a *different* session number — the
            // day-of-week map is shared program-wide, it has no idea this
            // particular client only needs 1 of the 3 slots. Check the
            // per-client target against this week's actual completions
            // first, same as SPC's "no remaining sessions this week" done
            // state below, before falling through to "what does today map
            // to" at all. Crucially this counts *any* completed session
            // this week toward the cap, not specifically the first N in
            // session-number order — unlike SPC, a group client isn't
            // restricted to a fixed subset of slots; they can attend
            // whichever day's session fits their schedule that week (a
            // 1x/week client who did Wednesday's Session 2 has met their
            // cap just as much as one who did Monday's Session 1).
            const sessionsPerWeek = assignment.sessions_per_week ?? program.sessions_per_week;
            const weekWorkouts = await listWorkoutsForWeek(block.id, weekNumber);
            const completedThisWeek = await listGroupCompletionsForWorkouts(profile.id, weekWorkouts.map((w) => w.id));
            const completedCountThisWeek = weekWorkouts.filter((w) => completedThisWeek.has(w.id)).length;
            if (weekWorkouts.length > 0 && completedCountThisWeek >= sessionsPerWeek) {
              return { groupProgramId: program.id, programName: program.name, status: "done", weekNumber };
            }

            // Every program owns its own day-of-week map now (migration
            // 0011) — Flagship/BWA's Mon/Tue-Wed/Thu-Fri/Sat scheme is just
            // this program's data, not a rule every group program follows.
            const sessionNumber = sessionNumberForDate(today, program.session_days);
            if (!sessionNumber) return { groupProgramId: program.id, programName: program.name, status: "rest_day" };

            const workout = await getWorkout(block.id, weekNumber, sessionNumber);
            if (!workout) {
              return { groupProgramId: program.id, programName: program.name, status: "not_published", weekNumber, sessionNumber };
            }

            const [completion, warmups, exerciseRows] = await Promise.all([
              getGroupCompletion(profile.id, workout.id),
              listWarmups(workout.id),
              listWorkoutExercises(workout.id),
            ]);
            return {
              groupProgramId: program.id,
              programName: program.name,
              source,
              status: "ready",
              weekNumber,
              sessionNumber,
              workout,
              warmups,
              completed: !!completion,
              exercises: exerciseRows.map((ex) => ({
                id: ex.id,
                exercise: ex.exercises,
                targetSets: ex.sets,
                targetReps: ex.reps,
                repScheme: ex.rep_scheme,
                supersetGroupId: ex.superset_group_id,
                notes: ex.tempo ? `tempo ${ex.tempo}` : null,
              })),
            };
          } catch (err) {
            return { groupProgramId: program.id, programName: program.name, status: "error", message: err.message ?? String(err) };
          }
        })
        );
      });
      if (!isStale()) setGroups(results);
    } catch (err) {
      console.error("My Fitness: failed to load group programs", err);
      if (!isStale()) setGroups([{ status: "error", message: err.message ?? String(err) }]);
    } finally {
      if (!isStale()) setGroupsLoading(false);
    }

    try {
      const spcResult = await retryOnce(async () => {
        const spcClient = await getSpcClient(profile.id);
        const active = isSpcActive(spcClient);
        if (!active) return { active };

        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) return { active, spc: { status: "no_block" } };

        const weekNumber = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
        const workouts = await listSpcWorkoutsForWeek(block.id, weekNumber);
        if (workouts.length === 0) return { active, spc: { status: "not_published" } };

        const sessionsPerWeek = spcClient.sessions_per_week;
        const relevant = workouts.slice(0, sessionsPerWeek);
        const workoutIds = relevant.map((w) => w.id);
        const completedIds = await getCompletedSpcWorkoutIdsForWeek(profile.id, workoutIds, weekNumber);
        const sessions = relevant.map((w) => ({ sessionNumber: w.session_number, workout: w, completed: completedIds.has(w.id) }));
        const defaultSession = sessions.find((s) => !s.completed) ?? sessions[0];
        return {
          active,
          spc: {
            status: sessions.every((s) => s.completed) ? "done" : "ready",
            weekNumber,
            sessionsPerWeek,
            sessions,
            selectedSessionNumber: defaultSession?.sessionNumber ?? null,
          },
        };
      });
      if (!isStale()) {
        setHasSpc(spcResult.active);
        setSpc(spcResult.active ? spcResult.spc : null);
      }
    } catch (err) {
      console.error("My Fitness: failed to load SPC", err);
      if (!isStale()) {
        setHasSpc(false);
        setSpc(null);
      }
    }

    // One-offs load independently too, same reasoning — an away workout or
    // trial session assignment has nothing to do with group/SPC, so its
    // failure shouldn't hide either of those sections.
    try {
      const withContent = await retryOnce(async () => {
        const activeOneOffs = await listActiveOneOffWorkoutsForUser(profile.id);
        return Promise.all(
        activeOneOffs.map(async (workout) => {
          const [warmupRows, exerciseRows] = await Promise.all([listOneOffWarmups(workout.id), listOneOffExercises(workout.id)]);
          return {
            workout,
            warmups: warmupRows,
            exercises: exerciseRows.map((ex) => ({
              id: ex.id,
              exercise: ex.exercises,
              targetSets: ex.sets,
              targetReps: ex.reps,
              repScheme: ex.rep_scheme,
              notes: ex.rest ? `rest ${ex.rest}${ex.notes ? ` · ${ex.notes}` : ""}` : ex.notes,
            })),
          };
        })
        );
      });
      if (!isStale()) setOneOffs(withContent);
    } catch (err) {
      console.error("My Fitness: failed to load one-offs", err);
      if (!isStale()) setOneOffs([]);
    }
  }, [profile.id]);

  // Refetch on every focus, not just first mount — same reasoning as
  // My Week: Tabs keep this screen mounted, so without this, coming back
  // here later wouldn't pick up state that changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Loads whichever SPC session is currently selected — re-runs whenever
  // the selection changes (including the initial default), no caching by
  // session number since sessionsPerWeek is small enough that refetching
  // on switch isn't a real cost, and it keeps this simple.
  useEffect(() => {
    if (spc?.status !== "ready" || !spc.selectedSessionNumber) {
      setSpcDetail(null);
      return;
    }
    const session = spc.sessions.find((s) => s.sessionNumber === spc.selectedSessionNumber);
    if (!session) return;
    let cancelled = false;
    setSpcDetailLoading(true);
    (async () => {
      const exerciseRows = await listSpcWorkoutExercises(session.workout.id);
      if (cancelled) return;
      setSpcDetail({
        sessionNumber: session.sessionNumber,
        title: session.workout.title || null,
        exercises: exerciseRows.map((ex) => ({
          id: ex.id,
          exercise: ex.exercises,
          targetSets: ex.sets,
          targetReps: ex.reps,
          repScheme: ex.rep_scheme,
          supersetGroupId: ex.superset_group_id,
          notes: ex.rest ? `rest ${ex.rest}` : ex.notes,
        })),
      });
      setSpcDetailLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spc?.selectedSessionNumber, spc?.status]);

  // A fresh navigation (e.g. My Week's per-tile arrow) should always win
  // over whatever tab was manually selected on an earlier visit. This
  // screen stays mounted across tab switches (Tabs don't unmount their
  // screens), so without this the stale selectedProgramOverride from
  // before would silently outlive the new ?program= param and the arrow
  // would appear to do nothing — it'd land on the tab, but show whatever
  // was already open. Waits for groups to finish loading so a
  // group-program-id param can actually be validated against them.
  useEffect(() => {
    if (groupsLoading) return;
    const groupIds = groups.map((g) => g.groupProgramId);
    const isValidParam = groupIds.includes(params.program) || params.program === "spc" || params.program === "extras";
    if (isValidParam) setSelectedProgramOverride(params.program);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.program, groupsLoading]);

  const handleFinalizeGroup = async (groupEntry) => {
    await finalizeGroupSession(profile.id, groupEntry.workout.id);
    setGroups((prev) => prev.map((g) => (g.groupProgramId === groupEntry.groupProgramId ? { ...g, completed: true } : g)));
  };

  const handleFinalizeSpc = async () => {
    const session = spc.sessions.find((s) => s.sessionNumber === spc.selectedSessionNumber);
    if (!session) return;
    await finalizeSpcSession(profile.id, session.workout.id, spc.weekNumber);
    setSpc((s) => ({ ...s, sessions: s.sessions.map((row) => (row.sessionNumber === session.sessionNumber ? { ...row, completed: true } : row)) }));
  };

  // One-offs are open-until-completed, no recurrence — once finalized it
  // just drops out of the active list rather than showing a completed state.
  const handleFinalizeOneOff = async (workoutId) => {
    await finalizeOneOffSession(profile.id, workoutId);
    setOneOffs((prev) => prev.filter((o) => o.workout.id !== workoutId));
  };

  if (groupsLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const hasExtras = oneOffs.length > 0;
  const availableCount = groups.length + (hasSpc ? 1 : 0) + (hasExtras ? 1 : 0);
  const showTabs = availableCount > 1;
  const groupProgramIds = groups.map((g) => g.groupProgramId);
  const validParam = groupProgramIds.includes(params.program) || params.program === "spc" || params.program === "extras" ? params.program : null;
  const defaultProgram = validParam ?? groups[0]?.groupProgramId ?? (hasSpc ? "spc" : "extras");
  const selectedProgram = selectedProgramOverride ?? defaultProgram;

  // Exactly one section is "the" clear focus of the page — alone (no
  // tabs) or explicitly selected (tabs) — and that's the one whose
  // Finalize button gets docked to the bottom of the screen instead of
  // the bottom of the scrolling content. One-offs are excluded: there can
  // be several of them at once with no single "the" session, so theirs
  // stay inline on their own cards.
  let activeFinalize = null;
  const visibleGroup = groups.find((g) => (!showTabs || selectedProgram === g.groupProgramId) && g.status === "ready");
  if (visibleGroup) {
    activeFinalize = {
      key: visibleGroup.groupProgramId,
      completed: visibleGroup.completed,
      onFinalize: () => handleFinalizeGroup(visibleGroup),
    };
  } else if ((!showTabs || selectedProgram === "spc") && spc?.status === "ready" && spcDetail) {
    activeFinalize = {
      key: "spc",
      completed: spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false,
      onFinalize: handleFinalizeSpc,
    };
  }

  const handleToggleTimer = () => {
    setTimer((t) =>
      t.running
        ? { elapsedMs: t.elapsedMs + (Date.now() - t.startedAt), running: false, startedAt: null }
        : { ...t, running: true, startedAt: Date.now() }
    );
  };

  const handleResetTimer = () => setTimer({ elapsedMs: 0, running: false, startedAt: null });

  const handleFooterFinalize = async () => {
    if (!activeFinalize) return;
    setFooterFinalizing(true);
    try {
      await activeFinalize.onFinalize();
    } finally {
      setFooterFinalizing(false);
    }
  };

  if (groups.length === 0 && !hasSpc && oneOffs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: CANVAS }}>
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          You're not assigned to a program yet — check with your coach.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: CANVAS }}>
    {activeFinalize && (
      <TimerBar insetsTop={insets.top} timer={timer} onToggle={handleToggleTimer} onReset={handleResetTimer} />
    )}
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-6 pb-8"
      contentContainerStyle={{ paddingTop: activeFinalize ? 16 : insets.top + 6 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        My Fitness
      </Text>

      {showTabs && (
        <ProgramTabs
          options={[
            ...groups.map((g) => ({ key: g.groupProgramId, label: g.programName })),
            hasSpc && { key: "spc", label: "SPC" },
            hasExtras && { key: "extras", label: "Extras" },
          ].filter(Boolean)}
          active={selectedProgram}
          onSelect={setSelectedProgramOverride}
        />
      )}

      {groups.map((groupEntry) => {
        if (showTabs && selectedProgram !== groupEntry.groupProgramId) return null;
        return (
          <View key={groupEntry.groupProgramId}>
            {groupEntry.status === "error" && (
              <Text className="mb-4 text-red-600" style={{ fontFamily: fonts.sans }}>
                Something went wrong loading {groupEntry.programName}: {groupEntry.message}
              </Text>
            )}
            {groupEntry.status === "no_block" && (
              <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
                No active {groupEntry.programName} block right now.
              </Text>
            )}
            {groupEntry.status === "rest_day" && (
              <View className="mb-6 rounded-2xl border border-dashed border-stone-300 px-5 py-6 items-center">
                <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-600">
                  Rest day
                </Text>
                <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  No session scheduled today
                </Text>
              </View>
            )}
            {groupEntry.status === "not_published" && (
              <Text className="mb-6 text-stone-400" style={{ fontFamily: fonts.sans }}>
                Week {groupEntry.weekNumber}, Session {groupEntry.sessionNumber} isn't published yet — check back soon.
              </Text>
            )}

            {groupEntry.status === "done" && (
              <FitnessCard title={showTabs ? null : groupEntry.programName}>
                <Text className="mb-2 text-center text-sm" style={{ fontFamily: fonts.sansMedium, color: "#4d6142" }}>
                  ✓ No remaining sessions this week
                </Text>
                <Pressable
                  onPress={() => router.push({ pathname: "/(member)/plan-block", params: { programId: groupEntry.groupProgramId } })}
                  className="self-center"
                  hitSlop={HITSLOP}
                >
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    View full block →
                  </Text>
                </Pressable>
              </FitnessCard>
            )}

            {groupEntry.status === "ready" && (
              <FitnessCard title={showTabs ? null : groupEntry.programName}>
                <SelectedSessionBanner
                  eyebrow={`${groupEntry.programName} · WEEK ${groupEntry.weekNumber}`}
                  title={groupEntry.workout.title || `Session ${groupEntry.sessionNumber}`}
                  completed={groupEntry.completed}
                  onViewBlock={() => router.push({ pathname: "/(member)/plan-block", params: { programId: groupEntry.groupProgramId } })}
                />

                <WarmupCard warmups={groupEntry.warmups} />

                <Text style={EYEBROW_MUTED}>Main session</Text>
                <SessionLogger
                  userId={profile.id}
                  datePerformed={todayInBoise()}
                  source={groupEntry.source}
                  exercises={groupEntry.exercises}
                  isCompleted={groupEntry.completed}
                  onFinalize={() => handleFinalizeGroup(groupEntry)}
                  hideFinalizeButton={activeFinalize?.key === groupEntry.groupProgramId}
                  layout="focus"
                  timer={activeFinalize?.key === groupEntry.groupProgramId ? timer : undefined}
                  onToggleTimer={handleToggleTimer}
                  onResetTimer={handleResetTimer}
                />
              </FitnessCard>
            )}
          </View>
        );
      })}

      {(!showTabs || selectedProgram === "spc") && (
        <>
          {spc?.status === "no_block" && (
            <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
              No active SPC block right now.
            </Text>
          )}
          {spc?.status === "not_published" && (
            <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
              Your SPC coach hasn't published this block yet — check back soon.
            </Text>
          )}

          {spc?.status === "done" && (
            <FitnessCard title={showTabs ? null : "SPC"}>
              <Text className="mb-2 text-center text-sm" style={{ fontFamily: fonts.sansMedium, color: "#4d6142" }}>
                ✓ No remaining sessions this week
              </Text>
              <Pressable
                onPress={() => router.push("/(member)/plan-spc-block")}
                className="self-center"
                hitSlop={HITSLOP}
              >
                <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                  View full SPC block →
                </Text>
              </Pressable>
            </FitnessCard>
          )}

          {spc?.status === "ready" && (
            <FitnessCard title={showTabs ? null : "SPC"}>
              {spc.sessionsPerWeek > 1 && (
                <SpcSessionPicker
                  sessions={spc.sessions}
                  selected={spc.selectedSessionNumber}
                  onSelect={(sessionNumber) => setSpc((s) => ({ ...s, selectedSessionNumber: sessionNumber }))}
                />
              )}

              {spcDetailLoading || !spcDetail ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <SelectedSessionBanner
                    eyebrow={`SPC · SESSION ${spcDetail.sessionNumber}`}
                    title={spcDetail.title || `Session ${spcDetail.sessionNumber}`}
                    completed={spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false}
                    onViewBlock={() => router.push("/(member)/plan-spc-block")}
                  />

                  <Text style={EYEBROW_MUTED}>Main session</Text>
                  <SessionLogger
                    userId={profile.id}
                    datePerformed={todayInBoise()}
                    source="spc"
                    exercises={spcDetail.exercises}
                    isCompleted={spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false}
                    onFinalize={handleFinalizeSpc}
                    hideFinalizeButton={activeFinalize?.key === "spc"}
                    layout="focus"
                    timer={activeFinalize?.key === "spc" ? timer : undefined}
                    onToggleTimer={handleToggleTimer}
                    onResetTimer={handleResetTimer}
                  />
                </>
              )}
            </FitnessCard>
          )}
        </>
      )}

      {(!showTabs || selectedProgram === "extras") &&
        oneOffs.map(({ workout, warmups, exercises }) => (
          <FitnessCard key={workout.id} title={workout.title}>
            <WarmupCard warmups={warmups} />
            <SessionLogger
              userId={profile.id}
              datePerformed={todayInBoise()}
              source="one_off"
              exercises={exercises}
              isCompleted={false}
              onFinalize={() => handleFinalizeOneOff(workout.id)}
              layout="focus"
            />
          </FitnessCard>
        ))}
    </ScrollView>

    {activeFinalize && (
      <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: CARD_BORDER, backgroundColor: CANVAS }}>
        <Pressable
          onPress={handleFooterFinalize}
          disabled={footerFinalizing}
          className="items-center justify-center disabled:opacity-50"
          style={{
            height: 52,
            borderRadius: 12,
            backgroundColor: activeFinalize.completed ? "#4d6142" : colors.primary,
            shadowColor: activeFinalize.completed ? "#4d6142" : colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
          }}
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 14 }}>
            {footerFinalizing ? "Saving…" : activeFinalize.completed ? "✓ Finalized — tap to update" : "Finalize workout"}
          </Text>
        </Pressable>
      </View>
    )}
    </View>
  );
}
