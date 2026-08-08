import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";
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
  listSpcCompletionDetailsForWorkouts,
  finalizeGroupSession,
  finalizeSpcSession,
  finalizeOneOffSession,
} from "../../lib/programming/sessionCompletions";
import { retryOnce } from "../../lib/retry";
import { SessionLogger } from "../../components/SessionLogger";
import { SessionFocusModal } from "../../components/SessionFocusModal";
import { SessionInfoBar } from "../../components/SessionInfoBar";
import { ProgramPickerModal } from "../../components/ProgramPickerModal";
import { fonts, colors } from "../../lib/theme";
import { toastError } from "../../lib/toast";

// Design tokens from design_handoff_visual_pass_v4/README.md.
const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };
const EYEBROW_MUTED = { fontFamily: fonts.sansBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 };

// Matches My Week's card treatment — a light spacing wrapper, not its own
// bordered card (the individual pieces inside — warmup card, exercise cards
// — carry their own white/bordered styling instead, so the page reads as a
// flat stack of distinct elements on the canvas background rather than one
// big enclosing box). `title` is only passed for statuses that have no
// other on-page context naming the program (done/no_block/rest_day/
// not_published) — a "ready" session already gets its program name from
// the page's own header (SessionInfoBar), so passing null there avoids
// showing the same name twice.
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

// Warm-up section — a bordered card of name/sets×reps rows, mirroring the
// exercise list's card language, instead of one joined "Warm-up: A, B" line.
// Renders the same warmup rows already fetched for the section (no new
// query), just restyled from an inline string into individual rows.
//
// Each row also gets the same circle checkbox ExerciseCard uses, on the
// right — pure placekeeping for whoever's actually running the session
// (checking off each warm-up move as they go), not real tracked data: no
// exercise_completions row, no persistence, nothing survives a reload.
// Local component state is deliberate here, not an oversight — warm-ups
// have no per-item id worth writing to the database over, this is just a
// "where was I" aid for the live session.
function WarmupCard({ warmups }) {
  const [checked, setChecked] = useState(() => new Set());
  if (!warmups || warmups.length === 0) return null;
  const toggle = (key) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <>
      <Text style={EYEBROW_MUTED}>Warm-up</Text>
      <View className="mb-5 rounded-2xl bg-white px-3.5" style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}>
        {warmups.map((w, i) => {
          const key = w.id ?? i;
          const detail = w.sets && w.reps ? `${w.sets}×${w.reps}` : w.sets || w.reps || "";
          const isChecked = checked.has(key);
          return (
            <View
              key={key}
              className="flex-row items-center justify-between py-2.5"
              style={i < warmups.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f2eee9" } : undefined}
            >
              <View className="flex-1 pr-2">
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>{w.exercises?.name ?? w.label}</Text>
                {w.notes ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", fontStyle: "italic", marginTop: 1 }}>
                    {w.notes}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                {detail ? <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>{detail}</Text> : null}
                <Pressable
                  onPress={() => toggle(key)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={isChecked ? "Mark warm-up not complete" : "Mark warm-up complete"}
                >
                  <Ionicons name={isChecked ? "checkmark-circle" : "checkmark-circle-outline"} size={24} color="#4d6142" />
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </>
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
  const [spcLoadError, setSpcLoadError] = useState(null);
  const [spc, setSpc] = useState(null);
  const [spcDetail, setSpcDetail] = useState(null); // { sessionNumber, title, exercises } for whichever session is selected
  const [spcDetailLoading, setSpcDetailLoading] = useState(false);
  const [spcDetailError, setSpcDetailError] = useState(null);
  const [spcDetailRetryKey, setSpcDetailRetryKey] = useState(0);
  const [oneOffs, setOneOffs] = useState([]);
  // Set once the member picks an option from ProgramPickerModal (only shown
  // when My Fitness is opened with no specific session context and 2+
  // things are still due this week) — sticks for the rest of this screen's
  // mounted lifetime, same as a resolved param would, so picking doesn't
  // need a re-navigation.
  const [pickedFocus, setPickedFocus] = useState(null);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [footerFinalizing, setFooterFinalizing] = useState(false);
  const [timer, setTimer] = useState({ elapsedMs: 0, running: false, startedAt: null });
  const [timerExpanded, setTimerExpanded] = useState(false);
  // The exercise-focus overlay, lifted up from SessionLogger to here so it
  // can render as a sibling of the page's own header instead of nested deep
  // inside the scrolling content — a real page header can't stay visible/
  // clickable above a component nested that deep (see SessionFocusModal.js
  // for the fuller version of this). `focusTarget` is deliberately sticky
  // (never cleared back to null on close, only replaced by the next open) —
  // ExerciseCard's autosave is a debounced timer cancelled by its own
  // unmount, so unmounting the whole overlay tree the instant it's closed
  // could drop an edit made in the last ~900ms; `focusVisible` alone
  // controls show/hide, same as SessionFocusModal's own internal
  // display:none pattern for navigating between exercises.
  const [focusTarget, setFocusTarget] = useState(null);
  const [focusVisible, setFocusVisible] = useState(false);
  // Which SessionLogger instance to tell to refresh its own summaries/
  // completions once the overlay closes — keyed by the same sectionKey
  // string passed into openFocus below, registered via each SessionLogger's
  // callback ref as they mount/unmount (there can be several one-off
  // instances at once, only ever one group/SPC one on this page).
  const loggerRefs = useRef(new Map());
  const registerLoggerRef = (key) => (el) => {
    if (el) loggerRefs.current.set(key, el);
    else loggerRefs.current.delete(key);
  };

  const openFocus = (sectionProps, payload) => {
    setFocusTarget({ ...sectionProps, ...payload });
    setFocusVisible(true);
  };

  const closeFocus = () => {
    setFocusVisible(false);
    loggerRefs.current.get(focusTarget?.sectionKey)?.refresh();
  };

  const navigateFocus = (i) => setFocusTarget((prev) => (prev ? { ...prev, focusIndex: i } : prev));

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

            // An explicit deep link from My Week (tapping a specific
            // bubble's preview → "Log/Update session") always wins for its
            // own program — it must be able to reach that exact session
            // even if the member already hit their weekly cap via a
            // different one, so it bypasses the cap check below entirely.
            // Only applies while the live current week still matches what
            // the link was generated for; a stale link spanning a week
            // rollover falls through to normal resolution instead of
            // forcing a week that's no longer current.
            const isExplicitTarget =
              params.session === "group" && params.groupProgramId === program.id && Number(params.weekNumber) === weekNumber;

            let sessionNumber;
            if (isExplicitTarget) {
              sessionNumber = Number(params.sessionNumber);
            } else {
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
              sessionNumber = sessionNumberForDate(today, program.session_days);
              if (!sessionNumber) return { groupProgramId: program.id, programName: program.name, status: "rest_day" };
            }

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
              // Reopening an already-completed session (e.g. "Update session"
              // from My Week for a session logged on a past date) must read
              // and keep writing against whatever date it was actually
              // performed, not today — otherwise the member's real logged
              // sets never show up, since they're stored under a different
              // date_performed. Only a not-yet-completed session defaults to
              // today, since that's genuinely when it's being logged.
              datePerformed: completion?.completed_at ? dateInBoise(new Date(completion.completed_at)) : today,
              exercises: exerciseRows.map((ex) => ({
                id: ex.id,
                exercise: ex.exercises,
                targetSets: ex.sets,
                targetReps: ex.reps,
                repScheme: ex.rep_scheme,
                supersetGroupId: ex.superset_group_id,
                notes: ex.tempo ? `tempo ${ex.tempo}${ex.notes ? ` · ${ex.notes}` : ""}` : ex.notes,
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
        // Detail version (not just the id Set) so a completed session's
        // real completed_at date is available — reopening it via "Update
        // session" needs to read/write against that date, not today (same
        // reasoning as the group loader above).
        const completionDetails = await listSpcCompletionDetailsForWorkouts(profile.id, workoutIds);
        const sessions = relevant.map((w) => {
          const completedAt = completionDetails.get(`${w.id}:${weekNumber}`) ?? null;
          return { sessionNumber: w.session_number, workout: w, completed: !!completedAt, completedAt };
        });
        // Explicit deep link from My Week (a bubble's preview → "Log/Update
        // session") resolved right here, the same way the group branch
        // above resolves its own isExplicitTarget — NOT via a separate
        // reactive useEffect keyed on spc?.status/weekNumber, which this
        // used to be. That effect only re-ran when those two primitives
        // actually changed value between loads; load() itself runs on
        // every focus (useFocusEffect) and always recomputed
        // selectedSessionNumber fresh, so any repeat visit where status and
        // weekNumber happened to come out the same as last time (the common
        // case — still mid-week, tapping a session bubble again) never
        // re-triggered the effect, and the just-recomputed default silently
        // won over the deep link every time. Computing it inline instead
        // means there's no second render pass to race against.
        const isExplicitSpcTarget =
          params.session === "spc" && params.sessionNumber && String(weekNumber) === String(params.weekNumber);
        const explicitSession = isExplicitSpcTarget
          ? sessions.find((s) => s.sessionNumber === Number(params.sessionNumber))
          : null;
        const defaultSession = explicitSession ?? sessions.find((s) => !s.completed) ?? sessions[0];
        // An explicit target also bypasses the "done" status the same way
        // the group branch's isExplicitTarget bypasses its weekly-cap
        // check — reopening a specific already-completed session via
        // "Update session" must still land on "ready" with that session
        // selected, not the whole-week "done" card, even if every session
        // in the relevant slice happens to be complete.
        const allCompleted = sessions.every((s) => s.completed);
        return {
          active,
          spc: {
            status: allCompleted && !isExplicitSpcTarget ? "done" : "ready",
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
        setSpcLoadError(null);
      }
    } catch (err) {
      console.error("My Fitness: failed to load SPC", err);
      if (!isStale()) {
        setHasSpc(false);
        setSpc(null);
        // Distinct from "genuinely not on SPC" — see the guard below, which
        // used to show "You're not assigned to a program yet" to an
        // SPC-only member whose SPC fetch simply failed.
        setSpcLoadError(err.message ?? String(err));
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
    // params.session/groupProgramId/weekNumber/sessionNumber deliberately
    // included — a fresh My Week deep link needs to re-resolve which
    // specific group session this loads even when the tab doesn't actually
    // blur/refocus (e.g. a second link tapped while already on this
    // screen), and adding them here recreates `load`'s identity, which
    // useFocusEffect below picks up the same way it already does for a
    // real focus event.
  }, [profile.id, params.session, params.groupProgramId, params.weekNumber, params.sessionNumber]);

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
    setSpcDetailError(null);
    (async () => {
      try {
        const exerciseRows = await listSpcWorkoutExercises(session.workout.id);
        if (cancelled) return;
        setSpcDetail({
          sessionNumber: session.sessionNumber,
          title: session.workout.title || null,
          completedAt: session.completedAt,
          exercises: exerciseRows.map((ex) => ({
            id: ex.id,
            exercise: ex.exercises,
            targetSets: ex.sets,
            targetReps: ex.reps,
            repScheme: ex.rep_scheme,
            supersetGroupId: ex.superset_group_id,
            notes: ex.rest ? `rest ${ex.rest}${ex.notes ? ` · ${ex.notes}` : ""}` : ex.notes,
          })),
        });
      } catch (err) {
        if (cancelled) return;
        setSpcDetailError(err.message ?? String(err));
      } finally {
        if (!cancelled) setSpcDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spc?.selectedSessionNumber, spc?.status, spcDetailRetryKey]);

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

  // Resolution precedence, highest wins:
  //  1. An explicit session deep link (My Week bubble → preview → "Log/
  //     Update session") — bypasses everything else below, including the
  //     picker, since it's already an unambiguous choice.
  //  2. The older `program` param (My Week's card-header chevrons, "View
  //     full block" links) — same "already a made choice" treatment.
  //  3. No param at all (the bottom tab bar) — auto-resolve if exactly one
  //     group/SPC candidate is still due this week, or offer a picker if
  //     more than one is. One-offs are never a candidate here and never
  //     shown unless reached via #1 or #2 with an "extras" target.
  const groupProgramIds = groups.map((g) => g.groupProgramId);
  const explicitGroupTarget =
    params.session === "group" && params.groupProgramId
      ? groups.find((g) => g.groupProgramId === params.groupProgramId)
      : null;
  const explicitSpcTarget = params.session === "spc" && hasSpc;
  const explicitOneOffTarget =
    params.session === "one_off" && params.oneOffWorkoutId
      ? oneOffs.find((o) => o.workout.id === params.oneOffWorkoutId)
      : null;
  const validProgramParam =
    groupProgramIds.includes(params.program) || params.program === "spc" || params.program === "extras" ? params.program : null;

  const candidates = [
    ...groups
      .filter((g) => g.status === "ready")
      .map((g) => ({
        key: `group-${g.groupProgramId}`,
        label: `${g.programName} — Week ${g.weekNumber}, Session ${g.sessionNumber}`,
        focus: { type: "group", groupProgramId: g.groupProgramId },
      })),
    ...(spc?.status === "ready"
      ? [
          {
            key: "spc",
            label: `SPC — Session ${spc.selectedSessionNumber ?? spc.sessions[0]?.sessionNumber}`,
            focus: { type: "spc" },
          },
        ]
      : []),
  ];

  let focus = null;
  if (explicitGroupTarget) {
    focus = { type: "group", groupProgramId: explicitGroupTarget.groupProgramId };
  } else if (explicitSpcTarget) {
    focus = { type: "spc" };
  } else if (explicitOneOffTarget) {
    focus = { type: "extras", oneOffWorkoutId: explicitOneOffTarget.workout.id };
  } else if (validProgramParam) {
    focus =
      validProgramParam === "spc"
        ? { type: "spc" }
        : validProgramParam === "extras"
          ? { type: "extras" }
          : { type: "group", groupProgramId: validProgramParam };
  } else if (pickedFocus) {
    focus = pickedFocus;
  } else if (candidates.length === 1) {
    focus = candidates[0].focus;
  }
  const needsPicker = !focus && candidates.length >= 2;

  // Exactly one section is "the" clear focus of the page — alone (no
  // ambiguity) or explicitly resolved — and that's the one whose Finalize
  // button gets docked to the bottom of the screen instead of the bottom
  // of the scrolling content. One-offs are excluded: there can be several
  // of them at once with no single "the" session, so theirs stay inline on
  // their own cards.
  let activeFinalize = null;
  const visibleGroup = groups.find((g) => (!focus || (focus.type === "group" && focus.groupProgramId === g.groupProgramId)) && g.status === "ready");
  if (visibleGroup) {
    activeFinalize = {
      key: visibleGroup.groupProgramId,
      completed: visibleGroup.completed,
      eyebrow: `${visibleGroup.programName} · WEEK ${visibleGroup.weekNumber}`,
      title: visibleGroup.workout.title || `Session ${visibleGroup.sessionNumber}`,
      onFinalize: () => handleFinalizeGroup(visibleGroup),
      onViewBlock: () => router.push({ pathname: "/(member)/plan-block", params: { programId: visibleGroup.groupProgramId } }),
    };
  } else if ((!focus || focus.type === "spc") && spc?.status === "ready" && spcDetail) {
    activeFinalize = {
      key: "spc",
      completed: spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false,
      eyebrow: `SPC · SESSION ${spcDetail.sessionNumber}`,
      title: spcDetail.title || `Session ${spcDetail.sessionNumber}`,
      onFinalize: handleFinalizeSpc,
      onViewBlock: () => router.push("/(member)/plan-spc-block"),
    };
  }

  // Same canGoBack-or-fallback guard used elsewhere in this codebase for a
  // screen that can be reached either as a real stack push (My Week's "Log
  // session" deep link) or by tapping the bottom tab bar directly (no
  // history to go back to, so fall back to My Week).
  const handleBack = () => (router.canGoBack() ? router.back() : router.push("/(member)"));

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
    } catch (err) {
      toastError("Couldn't save", err);
    } finally {
      setFooterFinalizing(false);
    }
  };

  if (groups.length === 0 && !hasSpc && oneOffs.length === 0 && spcLoadError) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: CANVAS }}>
        <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Couldn't load your SPC program: {spcLoadError}
        </Text>
        <Pressable onPress={load} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

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
    <View
      style={{
        paddingTop: insets.top + 10,
        paddingBottom: 10,
        paddingHorizontal: 20,
        backgroundColor: CANVAS,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderBottomWidth: activeFinalize ? 0 : 1,
        borderBottomColor: CARD_BORDER,
      }}
    >
      <Pressable onPress={handleBack} hitSlop={HITSLOP} accessibilityLabel="Back" className="items-center justify-center" style={{ width: 30, height: 30 }}>
        <Ionicons name="chevron-back" size={20} color="#78716c" />
      </Pressable>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>My Fitness</Text>
    </View>
    {activeFinalize && (
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: CARD_BORDER, backgroundColor: CANVAS }}>
        <SessionInfoBar
          eyebrow={activeFinalize.eyebrow}
          title={activeFinalize.title}
          completed={activeFinalize.completed}
          timer={timer}
          timerExpanded={timerExpanded}
          onToggleExpanded={() => setTimerExpanded((e) => !e)}
          onToggleTimer={handleToggleTimer}
          onResetTimer={handleResetTimer}
          onViewBlock={activeFinalize.onViewBlock}
        />
      </View>
    )}
    <View style={{ flex: 1, position: "relative" }}>
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-6 pb-8"
      contentContainerStyle={{ paddingTop: 16 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {needsPicker && pickerDismissed && (
        <Pressable onPress={() => setPickerDismissed(false)} className="mb-6 items-center self-center" hitSlop={HITSLOP}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Choose a session to log →</Text>
        </Pressable>
      )}

      {groups.map((groupEntry) => {
        if (needsPicker) return null;
        if (focus && !(focus.type === "group" && focus.groupProgramId === groupEntry.groupProgramId)) return null;
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
              <FitnessCard title={groupEntry.programName}>
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
              <FitnessCard title={null}>
                <WarmupCard warmups={groupEntry.warmups} />

                <Text style={EYEBROW_MUTED}>Main session</Text>
                <SessionLogger
                  ref={registerLoggerRef(`group-${groupEntry.groupProgramId}`)}
                  userId={profile.id}
                  datePerformed={groupEntry.datePerformed}
                  source={groupEntry.source}
                  exercises={groupEntry.exercises}
                  isCompleted={groupEntry.completed}
                  onFinalize={() => handleFinalizeGroup(groupEntry)}
                  hideFinalizeButton={activeFinalize?.key === groupEntry.groupProgramId}
                  layout="focus"
                  exerciseCompletionType="group"
                  onOpenFocus={(payload) =>
                    openFocus(
                      {
                        sectionKey: `group-${groupEntry.groupProgramId}`,
                        userId: profile.id,
                        datePerformed: groupEntry.datePerformed,
                        source: groupEntry.source,
                        exerciseCompletionType: "group",
                        onFinalize: () => handleFinalizeGroup(groupEntry),
                        isCompleted: groupEntry.completed,
                        onSessionDataChanged: () =>
                          setGroups((prev) =>
                            prev.map((g) => (g.groupProgramId === groupEntry.groupProgramId ? { ...g, completed: false } : g))
                          ),
                      },
                      payload
                    )
                  }
                />
              </FitnessCard>
            )}
          </View>
        );
      })}

      {!needsPicker && (!focus || focus.type === "spc") && (
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
            <FitnessCard title="SPC">
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
            <FitnessCard title={null}>
              {spc.sessionsPerWeek > 1 && (
                <SpcSessionPicker
                  sessions={spc.sessions}
                  selected={spc.selectedSessionNumber}
                  onSelect={(sessionNumber) => setSpc((s) => ({ ...s, selectedSessionNumber: sessionNumber }))}
                />
              )}

              {spcDetailError ? (
                <View className="items-center py-4">
                  <Text className="mb-2 text-center" style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>
                    Couldn't load this session: {spcDetailError}
                  </Text>
                  <Pressable onPress={() => setSpcDetailRetryKey((k) => k + 1)} hitSlop={8}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
                  </Pressable>
                </View>
              ) : spcDetailLoading || !spcDetail ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Text style={EYEBROW_MUTED}>Main session</Text>
                  <SessionLogger
                    ref={registerLoggerRef("spc")}
                    userId={profile.id}
                    datePerformed={spcDetail.completedAt ? dateInBoise(new Date(spcDetail.completedAt)) : todayInBoise()}
                    source="spc"
                    exercises={spcDetail.exercises}
                    isCompleted={spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false}
                    onFinalize={handleFinalizeSpc}
                    hideFinalizeButton={activeFinalize?.key === "spc"}
                    layout="focus"
                    exerciseCompletionType="spc"
                    weekNumber={spc.weekNumber}
                    onOpenFocus={(payload) =>
                      openFocus(
                        {
                          sectionKey: "spc",
                          userId: profile.id,
                          datePerformed: spcDetail.completedAt ? dateInBoise(new Date(spcDetail.completedAt)) : todayInBoise(),
                          source: "spc",
                          exerciseCompletionType: "spc",
                          weekNumber: spc.weekNumber,
                          onFinalize: handleFinalizeSpc,
                          isCompleted: spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false,
                          onSessionDataChanged: () =>
                            setSpc((s) => ({
                              ...s,
                              sessions: s.sessions.map((row) =>
                                row.sessionNumber === spcDetail.sessionNumber ? { ...row, completed: false } : row
                              ),
                            })),
                        },
                        payload
                      )
                    }
                  />
                </>
              )}
            </FitnessCard>
          )}
        </>
      )}

      {!needsPicker &&
        focus?.type === "extras" &&
        oneOffs
          .filter((o) => !focus.oneOffWorkoutId || o.workout.id === focus.oneOffWorkoutId)
          .map(({ workout, warmups, exercises }) => (
          <FitnessCard key={workout.id} title={workout.title}>
            <WarmupCard warmups={warmups} />
            <SessionLogger
              ref={registerLoggerRef(`oneoff-${workout.id}`)}
              userId={profile.id}
              datePerformed={todayInBoise()}
              source="one_off"
              exercises={exercises}
              isCompleted={false}
              onFinalize={() => handleFinalizeOneOff(workout.id)}
              layout="focus"
              exerciseCompletionType="one_off"
              onOpenFocus={(payload) =>
                openFocus(
                  {
                    sectionKey: `oneoff-${workout.id}`,
                    userId: profile.id,
                    datePerformed: todayInBoise(),
                    source: "one_off",
                    exerciseCompletionType: "one_off",
                    onFinalize: () => handleFinalizeOneOff(workout.id),
                    isCompleted: false,
                  },
                  payload
                )
              }
            />
          </FitnessCard>
        ))}
    </ScrollView>

    {focusTarget && (
      <SessionFocusModal
        visible={focusVisible}
        groups={focusTarget.groups}
        focusIndex={focusTarget.focusIndex}
        onNavigate={navigateFocus}
        onClose={closeFocus}
        userId={focusTarget.userId}
        datePerformed={focusTarget.datePerformed}
        source={focusTarget.source}
        hideVideo={focusTarget.hideVideo}
        exerciseCompletionType={focusTarget.exerciseCompletionType}
        weekNumber={focusTarget.weekNumber}
        completions={focusTarget.completions}
        onFinalize={focusTarget.onFinalize}
        isCompleted={focusTarget.isCompleted}
        onSessionDataChanged={focusTarget.onSessionDataChanged}
      />
    )}
    </View>

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
            {footerFinalizing ? "Saving…" : activeFinalize.completed ? "✓ Finalized" : "Finalize workout"}
          </Text>
        </Pressable>
      </View>
    )}

    <ProgramPickerModal
      visible={needsPicker && !pickerDismissed}
      options={candidates}
      onSelect={(selected) => {
        setPickedFocus(selected);
        setPickerDismissed(false);
      }}
      onClose={() => setPickerDismissed(true)}
    />
    </View>
  );
}
