import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getClientGoal } from "../../lib/programming/clientGoals";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dateInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, calendarWeekNumber, sessionNumberForDate, blockLengthWeeks } from "../../lib/programming/schedule";
import { listMyAssignments, getCurrentBlock, getWorkout, listWorkoutsForWeek } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { warmupNumbersFor } from "../../lib/programming/sessionLabels";
import { getSpcClient, isSpcActive } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";
import {
  listActiveOneOffWorkoutsForUser,
  listWeekOneOffWorkoutsForUser,
  listOneOffWarmups,
  listOneOffExercises,
} from "../../lib/programming/oneOffWorkouts";
import {
  getLiveAlternateProgramForUser,
  listAlternateSessions,
  listAlternateWarmups,
  listAlternateExercises,
  programWeekNumber,
  programWeekCount,
} from "../../lib/programming/alternatePrograms";
import {
  getGroupCompletion,
  listGroupCompletionsForWorkouts,
  listSpcCompletionDetailsForWorkouts,
  finalizeGroupSession,
  finalizeSpcSession,
  finalizeOneOffSession,
  unfinalizeGroupSession,
  unfinalizeSpcSession,
  listAlternateCompletionsForWeek,
  finalizeAlternateSession,
  unfinalizeAlternateSession,
} from "../../lib/programming/sessionCompletions";
import { retryOnce } from "../../lib/retry";
import { clearScreen, SCREEN_MY_WEEK } from "../../lib/screenCache";
import { SessionLogger } from "../../components/SessionLogger";
import { SessionHeroBar } from "../../components/SessionHeroBar";
import { ProgramPickerModal } from "../../components/ProgramPickerModal";
import { FinalizePlate } from "../../components/session/FinalizePlate";
import {
  FinalizeWash,
  FinalizeConfettiScreen,
  useFinalizeCelebration,
  holdUntil,
} from "../../components/session/FinalizeCelebration";
import { getClient as getNutritionClient } from "../../lib/nutrition/clients";
import { buildLiftFinalizePlate } from "../../lib/finalizePlate";
import { getGroupWeeklyProgress, getSpcWeeklyProgress } from "../../lib/programming/weeklyProgress";
import { fonts, colors, type } from "../../lib/theme";
import { toastSuccess } from "../../lib/toast";

// Design tokens from design_handoff_visual_pass_v4/README.md.
const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };

// Bottom padding on the logging list. Has to clear FloatingMessageBubble,
// which app/(member)/_layout.js pins 74pt above the safe-area bottom at 52pt
// tall — measured against the screen, so inside a tab screen it floats over
// roughly the last ~80pt of this ScrollView. At the old pb-8 (32) the
// Finalize button sat right underneath it.
const FOOTER_CLEARANCE = 96;

// Matches My Week's card treatment — a light spacing wrapper, not its own
// bordered card (the individual pieces inside — warmup card, exercise cards
// — carry their own white/bordered styling instead, so the page reads as a
// flat stack of distinct elements on the canvas background rather than one
// big enclosing box). `title` is only passed for statuses that have no
// other on-page context naming the program (done/no_block/rest_day/
// not_published) — a "ready" session already gets its program name from
// the page's own header (SessionHeroBar), so passing null there avoids
// showing the same name twice.
// `celebrating` washes the session green for the beat after it is finalized
// (see components/session/FinalizeCelebration.js). It sits over the session
// only, never the title, and never blocks a tap.
function FitnessCard({ title, children, celebrating = false }) {
  return (
    <View className="mb-6">
      {title ? (
        <Text className="mb-3 text-center" style={{ fontFamily: fonts.display, fontSize: 20, color: colors.primary }}>
          {title}
        </Text>
      ) : null}
      <View>
        {children}
        {celebrating ? <FinalizeWash /> : null}
      </View>
    </View>
  );
}

// Warm-up — one collapsed row ("Warm-up  5 moves" + chevron) that opens into
// the individual moves (design_handoff_member_lift_v1). It's the only thing
// on the session page that starts closed: the lifts all open expanded, and
// the warm-up is the part you already know by heart.
//
// Each move gets the same circle checkbox the lifts use — pure placekeeping
// for whoever's actually running the session, not tracked data: no
// exercise_completions row, no persistence, nothing survives a reload.
// Local state is deliberate, not an oversight — warm-ups have no per-item id
// worth writing to the database over.
function WarmupCard({ warmups }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  if (!warmups || warmups.length === 0) return null;
  const warmupNumbers = warmupNumbersFor(warmups);
  const toggle = (key) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <View
      className="mb-2.5 rounded-2xl"
      style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 15 }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel={open ? "Hide warm-up" : "Show warm-up"}
        className="flex-row items-center justify-between"
        style={{ paddingVertical: 13 }}
      >
        <View className="flex-row items-center" style={{ gap: 9 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#44403c" }}>
            Warm-up
          </Text>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
            {warmups.length} move{warmups.length === 1 ? "" : "s"}
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color="#c9c4bd" />
      </Pressable>
      {open
        ? warmups.map((w, i) => {
            const key = w.id ?? i;
            const detail = w.sets && w.reps ? `${w.sets}×${w.reps}` : w.sets || w.reps || "";
            const isChecked = checked.has(key);
            // Superset members share a number (3, 3, 3 — the coach's "do
            // these back-to-back" cue), matching the builder and the
            // printed sheet. warmupNumbers is computed once per card below.
            const number = warmupNumbers[i];
            return (
              <View
                key={key}
                className="flex-row items-center justify-between py-2.5"
                style={{ borderTopWidth: 1, borderTopColor: "#f4efe9" }}
              >
                <Text
                  maxFontSizeMultiplier={1.15}
                  style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#c9c4bd", width: 18 }}
                >
                  {number}
                </Text>
                <View className="flex-1 pr-2">
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>{w.exercises?.name ?? w.label}</Text>
                  {w.notes ? (
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, fontStyle: "italic", marginTop: 1 }}>
                      {w.notes}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row items-center" style={{ gap: 10 }}>
                  {detail ? <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>{detail}</Text> : null}
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
          })
        : null}
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
  const [spcLoadError, setSpcLoadError] = useState(null);
  const [spc, setSpc] = useState(null);
  const [spcDetail, setSpcDetail] = useState(null); // { sessionNumber, title, exercises } for whichever session is selected
  const [spcDetailLoading, setSpcDetailLoading] = useState(false);
  const [spcDetailError, setSpcDetailError] = useState(null);
  const [spcDetailRetryKey, setSpcDetailRetryKey] = useState(0);
  const [oneOffs, setOneOffs] = useState([]);
  const [alternate, setAlternate] = useState(null);
  const [goal, setGoal] = useState(null);
  const [hasNutrition, setHasNutrition] = useState(false);
  // Set once the member picks an option from ProgramPickerModal — either the
  // one auto-shown when My Fitness is opened with no session context and 2+
  // things are due, or the one they open themselves from the hero's program
  // chip. Stored with the params it was picked under (see activePick below),
  // so it doesn't need a re-navigation to take effect and can't outlive the
  // navigation it belongs to.
  const [pickedFocus, setPickedFocus] = useState(null);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  // Distinct from the auto-shown picker below: this is the member *asking*
  // for it from the hero's program chip. It has to be its own state because
  // the auto-shown one is gated on `needsPicker` (nothing resolved yet), and
  // by definition the chip is only ever tapped once something already is —
  // so reusing that gate meant the chip did nothing at all.
  const [pickerOpen, setPickerOpen] = useState(false);
  // The finalize plate (design_handoff_member_finalize_v1) — set by
  // handleFinalizeGroup/handleFinalizeSpc right after a successful finalize,
  // never on the un-finalize branch or from handleFinalizeOneOff (Extras
  // have no weekly target to count against — see the README's "Extras /
  // one-offs: no plate" rule).
  const [finalizePlate, setFinalizePlate] = useState(null);

  // The green wash + confetti that runs on the session itself the moment it
  // is finalized, matching the gym-floor board. `celebration.key` names the
  // one session that washes; the confetti is screen-wide.
  const { celebration, celebrate, clearCelebration } = useFinalizeCelebration();
  // The page's own ScrollView is what a focused reps/weight/notes field
  // scrolls itself above the keyboard inside — this used to be the focus
  // overlay's ScrollView, but with the session on one page the page is the
  // scroller. scrollOffsetRef is tracked here and shared by every card, since
  // RN has no synchronous way to read a ScrollView's current offset (see
  // lib/scrollToKeyboard.js).
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);

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

    // The five sections below run concurrently. They were already fully
    // independent (own try/catch, own state, own retryOnce) — they were
    // just awaited one after another, which made this screen's cost the
    // SUM of five chains (~13 round trips) rather than the longest single
    // one (~5). At the 124ms per-request latency measured 2026-08-23 that
    // is most of a second and a half, on every focus. allSettled rather
    // than all: every section already catches its own failures, and this
    // keeps that true even if a future edit throws outside one.
    //
    // Deliberately NOT cache-hydrated the way My Week is: which session
    // this screen resolves depends on the deep-link params, so painting a
    // remembered session before that resolves could show the wrong one —
    // and this is the screen where a member acts, not just reads.
    await Promise.allSettled([
      (async () => {
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
            // logs.source predates multi-membership and only ever special-
            // cased BWA by name (migration 0004); everything else tags with
            // the generic 'group' value added in 0010. Nothing reads this
            // column back — history matches on the completion row, not on
            // source — so rows written before Flagship was renamed to Group
            // keep their old 'flagship' tag harmlessly.
            const source = program.name === "Better With Age" ? "bwa" : "group";
            try {
              const block = await getCurrentBlock(program.id, today);
              if (!block) return { groupProgramId: program.id, programName: program.name, status: "no_block" };

              const weekNumber = currentWeekNumber(block.block_start_date, blockLengthWeeks(block, program), today);

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
                  tempo: ex.tempo,
                  rest: ex.rest,
                  notes: ex.notes,
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
      })(),

      (async () => {
      try {
        const spcResult = await retryOnce(async () => {
          const spcClient = await getSpcClient(profile.id);
          const active = isSpcActive(spcClient);
          if (!active) return { active };

          const block = await getCurrentSpcBlock(profile.id, today);
          if (!block) return { active, spc: { status: "no_block" } };

          // Sessions-format runs (0102) count weeks uncapped off the start
          // date — a lapsed or ongoing run keeps running, and completions file
          // under that same uncapped week, so the clamped legacy math would
          // stop matching them the week the run outlived its planned length.
          const weekNumber =
            block.format === "sessions"
              ? calendarWeekNumber(block.block_start_date, today)
              : currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
          const workouts = await listSpcWorkoutsForWeek(block.id, weekNumber, block);
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
      })(),

      (async () => {
      // One-offs load independently too, same reasoning — an away workout or
      // trial session assignment has nothing to do with group/SPC, so its
      // failure shouldn't hide either of those sections.
      try {
        const withContent = await retryOnce(async () => {
          const activeOneOffs = await listActiveOneOffWorkoutsForUser(profile.id);
          // My Week keeps a one-off visible (checked off) for the rest of the
          // day it was finished and offers "Update session" on it — but the
          // active list above drops it the moment it's completed, so that
          // button resolved to nothing and silently dumped the member on an
          // unrelated session. Pull the specifically-requested one back in.
          let oneOffList = activeOneOffs;
          const wantedId = params.session === "one_off" ? params.oneOffWorkoutId : null;
          if (wantedId && !activeOneOffs.some((w) => w.id === wantedId)) {
            const weekOneOffs = await listWeekOneOffWorkoutsForUser(profile.id, today);
            const wanted = weekOneOffs.find((w) => w.id === wantedId);
            if (wanted) oneOffList = [...activeOneOffs, wanted];
          }
          return Promise.all(
          oneOffList.map(async (workout) => {
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
                supersetGroupId: ex.superset_group_id,
                tempo: ex.tempo,
                rest: ex.rest,
                notes: ex.notes,
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
      })(),

      (async () => {
      // Alternate programming (0110). Isolated exactly like one-offs above:
      // a travel run has nothing to do with group/SPC and its failure must
      // not hide either.
      try {
        const program = await retryOnce(() => getLiveAlternateProgramForUser(profile.id, today));
        if (!program) {
          if (!isStale()) setAlternate(null);
          return;
        }
        const sessions = await listAlternateSessions(program.id);
        const week = programWeekNumber(program, today);
        const withContent = await Promise.all(
          sessions.map(async (session) => {
            const [warmupRows, exerciseRows] = await Promise.all([
              listAlternateWarmups(session.id),
              listAlternateExercises(session.id),
            ]);
            return {
              session,
              warmups: warmupRows,
              exercises: exerciseRows.map((ex) => ({
                id: ex.id,
                exercise: ex.exercises,
                targetSets: ex.sets,
                targetReps: ex.reps,
                repScheme: ex.rep_scheme,
                supersetGroupId: ex.superset_group_id,
                tempo: ex.tempo,
                rest: ex.rest,
                notes: ex.notes,
              })),
            };
          })
        );
        const completions = await listAlternateCompletionsForWeek(
          profile.id,
          sessions.map((session) => session.id),
          week
        );
        if (!isStale()) {
          setAlternate({
            program,
            week,
            totalWeeks: programWeekCount(program),
            sessions: withContent,
            completions,
          });
        }
      } catch (err) {
        console.error("My Fitness: failed to load alternate programming", err);
        if (!isStale()) setAlternate(null);
      }
      })(),

      (async () => {
      // What their coach wrote they're working toward. Own try/catch, same as
      // every other domain on this page — and this one throws outright until
      // migration 0078 is run.
      try {
        const goalRow = await getClientGoal(profile.id);
        if (!isStale()) setGoal(goalRow?.goal ?? null);
      } catch {
        if (!isStale()) setGoal(null);
      }
      })(),

      (async () => {
      // Only to tell a nutrition-only member apart from a genuinely
      // unassigned one on the empty state below — this tab used to tell
      // nutrition-only clients "you're not assigned to a program yet."
      try {
        const nutritionClient = await getNutritionClient(profile.id);
        if (!isStale()) setHasNutrition(nutritionClient?.status === "active");
      } catch {
        if (!isStale()) setHasNutrition(false);
      }
      })(),
    ]);
    // params.session/groupProgramId/weekNumber/sessionNumber deliberately
    // included — a fresh My Week deep link needs to re-resolve which
    // specific group session this loads even when the tab doesn't actually
    // blur/refocus (e.g. a second link tapped while already on this
    // screen), and adding them here recreates `load`'s identity, which
    // useFocusEffect below picks up the same way it already does for a
    // real focus event.
  }, [profile.id, params.session, params.groupProgramId, params.weekNumber, params.sessionNumber, params.oneOffWorkoutId]);

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
    // Both early returns clear the loading flag. Leaving a stale `true`
    // behind kept the spinner up once SPC became ready again, because
    // nothing else ever resets it.
    if (spc?.status !== "ready" || !spc.selectedSessionNumber) {
      setSpcDetail(null);
      setSpcDetailLoading(false);
      return;
    }
    const session = spc.sessions.find((s) => s.sessionNumber === spc.selectedSessionNumber);
    if (!session) {
      setSpcDetailLoading(false);
      return;
    }
    let cancelled = false;
    setSpcDetailLoading(true);
    setSpcDetailError(null);
    (async () => {
      try {
        // Warm-ups too — the group and one-off branches always fetched theirs,
        // but SPC never did, so a member's phone showed no warm-up section at
        // all while the hub/TV (their own fetchHubWarmups) displayed it fine.
        const [exerciseRows, warmupRows] = await Promise.all([
          listSpcWorkoutExercises(session.workout.id),
          listSpcWarmups(session.workout.id),
        ]);
        // Lift notes are NOT fetched here any more. SessionLogger loads them
        // itself for every program type (0087) — this branch only ever
        // covered SPC, so group and one-off members saw no note at all, and
        // it was keyed on values that come back identical after a refocus,
        // so a note written at the TV mid-week never refreshed onto the
        // phone until a full reload.
        if (cancelled) return;
        setSpcDetail({
          sessionNumber: session.sessionNumber,
          title: session.workout.title || null,
          completedAt: session.completedAt,
          warmups: warmupRows,
          exercises: exerciseRows.map((ex) => ({
            id: ex.id,
            exercise: ex.exercises,
            targetSets: ex.sets,
            targetReps: ex.reps,
            repScheme: ex.rep_scheme,
            supersetGroupId: ex.superset_group_id,
            tempo: ex.tempo,
            rest: ex.rest,
            notes: ex.notes,
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

  // Finalize is a toggle, not a one-way door. People kept tapping it by
  // accident mid-session and had no way back — and because My Week's
  // "done for the week" count is derived straight from session_completions,
  // one stray tap made the whole week read as finished. Tapping again undoes
  // it. Nothing they typed is touched either way; only the completion row
  // moves. The button's own copy is unchanged (SessionLogger already swaps
  // olive/clay on isCompleted), so the two states stay tellable apart
  // without a second verb to learn.
  const handleFinalizeGroup = async (groupEntry) => {
    if (groupEntry.completed) {
      await unfinalizeGroupSession(profile.id, groupEntry.workout.id);
      void clearScreen(SCREEN_MY_WEEK, profile.id);
      clearCelebration();
      setGroups((prev) => prev.map((g) => (g.groupProgramId === groupEntry.groupProgramId ? { ...g, completed: false } : g)));
      toastSuccess("Un-finalized — keep logging.");
      return;
    }
    await finalizeGroupSession(profile.id, groupEntry.workout.id);
    // My Week reflects this, and it can paint from cache — drop its
    // snapshot so the next visit can't show this session as still to do.
    void clearScreen(SCREEN_MY_WEEK, profile.id);
    setGroups((prev) => prev.map((g) => (g.groupProgramId === groupEntry.groupProgramId ? { ...g, completed: true } : g)));
    // Wash + confetti start now; the plate is held until `plateAt` so the
    // beat is seen rather than covered in the same frame.
    const plateAt = celebrate(`group:${groupEntry.groupProgramId}`);
    // Detached on purpose: SessionLogger holds its button on "Saving…" for
    // as long as onFinalize is pending, and the button sits under the wash.
    // Returning now lets it flip to its finished state while the beat plays.
    void (async () => {
      try {
        const progress = await getGroupWeeklyProgress(profile.id, groupEntry.groupProgramId);
        const plate = await buildLiftFinalizePlate({
          userId: profile.id,
          sessionKey: `group:${groupEntry.workout.id}`,
          session: { groupWorkoutId: groupEntry.workout.id },
          sessionName: groupEntry.workout.title || `Session ${groupEntry.sessionNumber}`,
          weekNumber: groupEntry.weekNumber,
          exerciseIds: groupEntry.exercises.map((ex) => ex.exercise?.id),
          progress,
        });
        await holdUntil(plateAt);
        setFinalizePlate(plate);
      } catch (err) {
        // The finalize itself already succeeded — a failure computing the
        // celebratory plate shouldn't look like the finalize failed, so this
        // falls back to the plain toast instead of surfacing an error. The
        // celebration is unaffected either way; it is already running.
        console.error("Finalize plate failed to build", err);
        await holdUntil(plateAt);
        toastSuccess("Workout finalized — nice work!");
      }
    })();
  };

  const handleFinalizeSpc = async () => {
    const session = spc.sessions.find((s) => s.sessionNumber === spc.selectedSessionNumber);
    if (!session) return;
    const setCompleted = (completed) =>
      setSpc((s) => ({
        ...s,
        sessions: s.sessions.map((row) => (row.sessionNumber === session.sessionNumber ? { ...row, completed } : row)),
      }));
    if (session.completed) {
      await unfinalizeSpcSession(profile.id, session.workout.id);
      void clearScreen(SCREEN_MY_WEEK, profile.id);
      clearCelebration();
      setCompleted(false);
      toastSuccess("Un-finalized — keep logging.");
      return;
    }
    await finalizeSpcSession(profile.id, session.workout.id);
    void clearScreen(SCREEN_MY_WEEK, profile.id);
    setCompleted(true);
    const plateAt = celebrate("spc");
    void (async () => {
      try {
        const progress = await getSpcWeeklyProgress(profile.id);
        const plate = await buildLiftFinalizePlate({
          userId: profile.id,
          sessionKey: `spc:${session.workout.id}:${spc.weekNumber}`,
          // The workout's AUTHORED week, never the week it's being shown in:
          // a moved session (0101) files its logs under the week it was written
          // in, which is where every reader looks for them.
          session: { spcWorkoutId: session.workout.id, weekNumber: session.workout.week_number },
          sessionName: spcDetail?.title || session.workout.title || `Session ${session.sessionNumber}`,
          weekNumber: spc.weekNumber,
          exerciseIds: (spcDetail?.exercises ?? []).map((ex) => ex.exercise?.id),
          progress,
        });
        await holdUntil(plateAt);
        setFinalizePlate(plate);
      } catch (err) {
        console.error("Finalize plate failed to build", err);
        await holdUntil(plateAt);
        toastSuccess("Workout finalized — nice work!");
      }
    })();
  };

  // One-offs are open-until-completed, no recurrence — once finalized it
  // just drops out of the active list rather than showing a completed state.
  const handleFinalizeOneOff = async (workoutId) => {
    await finalizeOneOffSession(profile.id, workoutId);
    void clearScreen(SCREEN_MY_WEEK, profile.id);
    // A one-off leaves the list once it's done — but not until the wash has
    // landed on it, or the card it belongs to is gone before the
    // celebration has anything to celebrate on. Same beat the plate waits
    // for on group and SPC, so the timing reads the same whichever kind of
    // session was just finished.
    const removeAt = celebrate(`one_off:${workoutId}`);
    void (async () => {
      await holdUntil(removeAt);
      setOneOffs((prev) => prev.filter((o) => o.workout.id !== workoutId));
      toastSuccess("Workout finalized — nice work!");
    })();
  };

  // Finalize is a two-way toggle here, same as group and SPC — an
  // accidental tap has to be undoable, and unlike a one-off (which is done
  // for good) an away session repeats next week, so the completion is
  // per-week and re-openable.
  const handleFinalizeAlternate = async (sessionId) => {
    if (!alternate) return;
    const already = alternate.completions.has(sessionId);
    if (already) {
      await unfinalizeAlternateSession(profile.id, sessionId, alternate.week);
      clearCelebration();
    } else {
      await finalizeAlternateSession(profile.id, sessionId, alternate.week);
    }
    void clearScreen(SCREEN_MY_WEEK, profile.id);
    setAlternate((prev) => {
      if (!prev) return prev;
      const next = new Map(prev.completions);
      if (already) next.delete(sessionId);
      else next.set(sessionId, new Date().toISOString());
      return { ...prev, completions: next };
    });
    if (!already) {
      const toastAt = celebrate(`alternate:${sessionId}`);
      void (async () => {
        await holdUntil(toastAt);
        toastSuccess("Workout finalized — nice work!");
      })();
    }
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
  const explicitAlternateTarget =
    params.session === "alternate" && params.alternateSessionId && alternate
      ? alternate.sessions.find((entry) => entry.session.id === params.alternateSessionId)
      : null;
  const validProgramParam =
    groupProgramIds.includes(params.program) ||
    params.program === "spc" ||
    params.program === "extras" ||
    (params.program === "alternate" && alternate)
      ? params.program
      : null;

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
    ...(alternate
      ? [
          {
            key: "alternate",
            label: alternate.totalWeeks > 1
              ? `${alternate.program.name} — Week ${alternate.week} of ${alternate.totalWeeks}`
              : alternate.program.name,
            focus: { type: "alternate" },
          },
        ]
      : []),
  ];

  // A pick made from the hero's program chip has to outrank the params that
  // brought the member here (they arrived on Flagship from My Week and are
  // now asking for SPC) — but only for the navigation it was made during, or
  // a later tap on a different My Week session would silently land back on
  // whatever was picked before. Tying it to the params it was chosen under
  // gives both: a fresh deep link changes the signature and supersedes it,
  // re-focusing the tab with the same params keeps it.
  const paramSignature = [
    params.session,
    params.groupProgramId,
    params.sessionNumber,
    params.weekNumber,
    params.oneOffWorkoutId,
    params.alternateSessionId,
    params.program,
  ]
    .map((p) => p ?? "")
    .join("|");
  // Whether this navigation actually names a session at all. Pressing the
  // My Fitness tab in the tab bar arrives with NO params — which used to
  // change the signature and quietly throw away the pick, so coming back from
  // My Week re-asked "which session are you logging?" every time. An absence
  // of params is not a fresh choice; only a real deep link supersedes one.
  const hasNavParams = !!(
    params.session ||
    params.program ||
    params.groupProgramId ||
    params.oneOffWorkoutId ||
    params.alternateSessionId
  );
  const activePick = pickedFocus && (!hasNavParams || pickedFocus.signature === paramSignature) ? pickedFocus.focus : null;

  let focus = null;
  if (activePick) {
    focus = activePick;
  } else if (explicitGroupTarget) {
    focus = { type: "group", groupProgramId: explicitGroupTarget.groupProgramId };
  } else if (explicitSpcTarget) {
    focus = { type: "spc" };
  } else if (explicitOneOffTarget) {
    focus = { type: "extras", oneOffWorkoutId: explicitOneOffTarget.workout.id };
  } else if (explicitAlternateTarget) {
    focus = { type: "alternate", alternateSessionId: explicitAlternateTarget.session.id };
  } else if (validProgramParam) {
    focus =
      validProgramParam === "spc"
        ? { type: "spc" }
        : validProgramParam === "extras"
          ? { type: "extras" }
          : validProgramParam === "alternate"
            ? { type: "alternate" }
            : { type: "group", groupProgramId: validProgramParam };
  } else if (candidates.length === 1) {
    focus = candidates[0].focus;
  }
  const needsPicker = !focus && candidates.length >= 2;
  // SPC's empty-state chatter is only meaningful when SPC is the thing being
  // looked at, or when it's the only program on the account.
  const spcMessagesApply = focus?.type === "spc" || groups.length === 0;

  // Exactly one section is "the" clear focus of the page — alone (no
  // ambiguity) or explicitly resolved — and that's the one the hero header
  // describes. One-offs are excluded: there can be several at once with no
  // single "the" session. Its Finalize button is NOT docked to the bottom
  // of the screen: it renders inline at the end of that session's own
  // exercise list (SessionLogger's own button), per direct feedback that a
  // permanently-stuck bar over the content read as heavy-handed.
  // "{n} exercises | {m} sets" for the hero's meta line — counted off the
  // already-loaded exercise rows, no extra query.
  const describeSession = (exercises) => {
    if (!exercises || exercises.length === 0) return null;
    const sets = exercises.reduce((sum, ex) => sum + (Number(ex.targetSets) || 0), 0);
    const exLabel = `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`;
    return sets > 0 ? `${exLabel} | ${sets} sets` : exLabel;
  };

  let activeFinalize = null;
  const visibleGroup = groups.find((g) => (!focus || (focus.type === "group" && focus.groupProgramId === g.groupProgramId)) && g.status === "ready");
  if (visibleGroup) {
    activeFinalize = {
      key: visibleGroup.groupProgramId,
      completed: visibleGroup.completed,
      programLabel: visibleGroup.programName,
      eyebrowDetail: `Week ${visibleGroup.weekNumber} | Session ${visibleGroup.sessionNumber}`,
      title: visibleGroup.workout.title || `Session ${visibleGroup.sessionNumber}`,
      meta: describeSession(visibleGroup.exercises),
      onFinalize: () => handleFinalizeGroup(visibleGroup),
      onViewBlock: () => router.push({ pathname: "/(member)/plan-block", params: { programId: visibleGroup.groupProgramId } }),
      // No session tabs for a group program: which session a member can log
      // is decided by today's weekday (schedule.js's sessionNumberForDate),
      // not by choice, so a tab row would offer a switch that isn't real.
      // My Week's stripes are where another session gets opened.
    };
  } else if ((!focus || focus.type === "spc") && spc?.status === "ready" && spcDetail) {
    activeFinalize = {
      key: "spc",
      completed: spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false,
      programLabel: "SPC",
      eyebrowDetail: `Week ${spc.weekNumber}`,
      title: spcDetail.title || `Session ${spcDetail.sessionNumber}`,
      meta: describeSession(spcDetail.exercises),
      onFinalize: handleFinalizeSpc,
      onViewBlock: () => router.push("/(member)/plan-spc-block"),
      // SPC genuinely is a choice (no day-of-week routing), so its sessions
      // become the hero's tab row — replacing the separate SpcSessionPicker
      // card that used to sit above the exercise list.
      tabs: spc.sessions.map((s) => ({
        key: s.sessionNumber,
        label: `Session ${s.sessionNumber}`,
        subtitle: s.workout?.title && s.workout.title !== "Untitled session" ? s.workout.title : null,
        completed: s.completed,
      })),
      selectedTab: spc.selectedSessionNumber,
      onSelectTab: (sessionNumber) => setSpc((s) => ({ ...s, selectedSessionNumber: sessionNumber })),
    };
  }

  // `!alternate` on both of these: a member whose only training this week is
  // an away run has no group and no SPC, and without it she was told she
  // isn't assigned to a program while looking at one.
  if (groups.length === 0 && !hasSpc && oneOffs.length === 0 && !alternate && spcLoadError) {
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

  if (groups.length === 0 && !hasSpc && oneOffs.length === 0 && !alternate) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: CANVAS }}>
        {hasNutrition ? (
          <>
            <Text className="mb-4 text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
              No training program yet — your plan lives on the My Nutrition tab.
            </Text>
            <Pressable
              onPress={() => router.push("/(member)/nutrition")}
              className="rounded-xl px-5 py-3"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                Go to My Nutrition
              </Text>
            </Pressable>
          </>
        ) : (
          <Text className="text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
            You're not assigned to a program yet — check with your coach.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: CANVAS }}>
    {/* One header, not two. When there's a session to log, the session's own
        identity IS this page's title (the handoff draws it that way), so the
        generic "My Fitness" row would just be a second heading saying less —
        the gear moves into it instead so Settings stays reachable from this
        tab either way. With no session (rest day, week done, nothing
        published) the plain tab header stands on its own. */}
    {activeFinalize ? (
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: CANVAS }}>
        <SessionHeroBar
          programLabel={activeFinalize.programLabel}
          onPickProgram={candidates.length > 1 ? () => setPickerOpen(true) : null}
          eyebrowDetail={activeFinalize.eyebrowDetail}
          title={activeFinalize.title}
          meta={activeFinalize.meta}
          completed={activeFinalize.completed}
          onViewBlock={activeFinalize.onViewBlock}
          onOpenSettings={() => router.push("/(member)/settings")}
          tabs={activeFinalize.tabs}
          selectedTab={activeFinalize.selectedTab}
          onSelectTab={activeFinalize.onSelectTab}
          goal={goal}
        />
      </View>
    ) : focus?.type === "alternate" && alternate ? (
      // An away run has one to three sessions with no day-of-week routing,
      // so like Extras there is no single activeFinalize session. It still
      // gets the same header identity — the coach's own name for the run,
      // and which week of it she's in.
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: CANVAS }}>
        <SessionHeroBar
          programLabel={alternate.program.name}
          onPickProgram={candidates.length > 1 ? () => setPickerOpen(true) : null}
          eyebrowDetail={alternate.totalWeeks > 1 ? `Week ${alternate.week} of ${alternate.totalWeeks}` : null}
          title={
            alternate.sessions.length === 1
              ? alternate.sessions[0].session.title
              : `${alternate.sessions.length} sessions this week`
          }
          onOpenSettings={() => router.push("/(member)/settings")}
          goal={goal}
        />
      </View>
    ) : focus?.type === "extras" && oneOffs.length > 0 ? (
      // One-offs never become "the" activeFinalize (several can coexist, no
      // single session to finalize) — but an Extras logging session still
      // deserves the same header identity instead of a chrome-less screen.
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: CANVAS }}>
        <SessionHeroBar
          programLabel="Extras"
          onPickProgram={candidates.length > 1 ? () => setPickerOpen(true) : null}
          title={oneOffs.length === 1 ? oneOffs[0].workout.title || "One-off workout" : `${oneOffs.length} one-off workouts`}
          onOpenSettings={() => router.push("/(member)/settings")}
          goal={goal}
        />
      </View>
    ) : (
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingBottom: 10,
          paddingHorizontal: 20,
          backgroundColor: CANVAS,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: CARD_BORDER,
        }}
      >
        <Text className="flex-1" numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: 24, color: colors.primary }}>
          My Fitness
        </Text>
        <Pressable onPress={() => router.push("/(member)/settings")} hitSlop={HITSLOP} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={22} color="#78716c" />
        </Pressable>
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
      </View>
    )}
    <View style={{ flex: 1 }}>
    <ScrollView
      ref={scrollViewRef}
      className="flex-1"
      contentContainerClassName="px-5"
      contentContainerStyle={{ paddingTop: 4, paddingBottom: FOOTER_CLEARANCE }}
      keyboardShouldPersistTaps="handled"
      // NO automaticallyAdjustKeyboardInsets here, deliberately. It uses
      // iOS's own keyboard tracking to reveal a focused field, which fights
      // the manual measure-and-scroll this page already runs through every
      // ExerciseCard (scrollViewRef/scrollOffsetRef -> lib/scrollToKeyboard).
      // With both active the two disagree about where the content should
      // sit: the native inset survives the keyboard hiding, so the list
      // scrolls up past its own end, the Finalize button goes off-screen,
      // and the scroll won't settle back. The nutrition Today tab hit the
      // same conflict and dropped this prop for the same reason — see
      // app/(member)/nutrition/index.js's note. This page was the one screen
      // that still had both.
      onScroll={(e) => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
    >
      {needsPicker && pickerDismissed && (
        <Pressable onPress={() => setPickerOpen(true)} className="mb-6 items-center self-center" hitSlop={HITSLOP}>
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
                <Text className="text-xs" style={{ fontFamily: fonts.sans, color: colors.muted }}>
                  No session scheduled today
                </Text>
              </View>
            )}
            {groupEntry.status === "not_published" && (
              <Text className="mb-6" style={{ fontFamily: fonts.sans, color: colors.muted }}>
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
                    View full block ›
                  </Text>
                </Pressable>
              </FitnessCard>
            )}

            {groupEntry.status === "ready" && (
              <FitnessCard title={null} celebrating={celebration?.key === `group:${groupEntry.groupProgramId}`}>
                <WarmupCard warmups={groupEntry.warmups} />

                <SessionLogger
                  userId={profile.id}
                  datePerformed={groupEntry.datePerformed}
                  source={groupEntry.source}
                  exercises={groupEntry.exercises}
                  isCompleted={groupEntry.completed}
                  session={{ groupWorkoutId: groupEntry.workout.id }}
                  onFinalize={() => handleFinalizeGroup(groupEntry)}
                  layout="session"
                  exerciseCompletionType="group"
                  scrollViewRef={scrollViewRef}
                  scrollOffsetRef={scrollOffsetRef}
                  // Where the pinned rest bar's "Back to lift ›" returns to.
                  // These are the same params My Week's own deep links use,
                  // so load() resolves this exact session again.
                  restReturnTo={{
                    pathname: "/(member)/plan",
                    params: {
                      session: "group",
                      groupProgramId: groupEntry.groupProgramId,
                      weekNumber: String(groupEntry.weekNumber),
                      sessionNumber: String(groupEntry.sessionNumber),
                    },
                  }}
                  onDataChanged={() =>
                    setGroups((prev) =>
                      prev.map((g) => (g.groupProgramId === groupEntry.groupProgramId ? { ...g, completed: false } : g))
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
          {/* "There's nothing here for you" messages, so they only belong on
              screen when SPC is what the member is actually looking at, or
              when SPC is all they have. Otherwise finishing a group workout
              dropped an unrelated line about SPC right under the done card:
              once the last session is finalized nothing is "ready" any more,
              so focus resolves to null and this whole block rendered by
              default. Reads as "you're done — but something's wrong", which
              is the opposite of what just happened. */}
          {spcMessagesApply && spc?.status === "no_block" && (
            <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
              No active SPC block right now.
            </Text>
          )}
          {spcMessagesApply && spc?.status === "not_published" && (
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
            <FitnessCard title={null} celebrating={celebration?.key === "spc"}>
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
                <WarmupCard warmups={spcDetail.warmups} />

                <SessionLogger
                  userId={profile.id}
                  datePerformed={spcDetail.completedAt ? dateInBoise(new Date(spcDetail.completedAt)) : todayInBoise()}
                  source="spc"
                  exercises={spcDetail.exercises}
                  isCompleted={spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false}
                  session={{
                    spcWorkoutId: spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.workout?.id,
                    weekNumber: spc.weekNumber,
                  }}
                  onFinalize={handleFinalizeSpc}
                  layout="session"
                  exerciseCompletionType="spc"
                  weekNumber={spc.weekNumber}
                  scrollViewRef={scrollViewRef}
                  scrollOffsetRef={scrollOffsetRef}
                  restReturnTo={{
                    pathname: "/(member)/plan",
                    params: {
                      session: "spc",
                      weekNumber: String(spc.weekNumber),
                      sessionNumber: String(spcDetail.sessionNumber),
                    },
                  }}
                  onDataChanged={() =>
                    setSpc((s) => ({
                      ...s,
                      sessions: s.sessions.map((row) =>
                        row.sessionNumber === spcDetail.sessionNumber ? { ...row, completed: false } : row
                      ),
                    }))
                  }
                />
                </>
              )}
            </FitnessCard>
          )}
        </>
      )}

      {!needsPicker &&
        focus?.type === "alternate" &&
        alternate &&
        alternate.sessions
          .filter((entry) => !focus.alternateSessionId || entry.session.id === focus.alternateSessionId)
          .map(({ session, warmups, exercises }) => (
            <FitnessCard key={session.id} title={session.title} celebrating={celebration?.key === `alternate:${session.id}`}>
              <WarmupCard warmups={warmups} />
              <SessionLogger
                userId={profile.id}
                datePerformed={todayInBoise()}
                source="alternate"
                exercises={exercises}
                isCompleted={alternate.completions.has(session.id)}
                session={{ alternateSessionId: session.id }}
                onFinalize={() => handleFinalizeAlternate(session.id)}
                layout="session"
                exerciseCompletionType="alternate"
                weekNumber={alternate.week}
                scrollViewRef={scrollViewRef}
                scrollOffsetRef={scrollOffsetRef}
                restReturnTo={{
                  pathname: "/(member)/plan",
                  params: { session: "alternate", alternateSessionId: session.id },
                }}
              />
            </FitnessCard>
          ))}

      {!needsPicker &&
        focus?.type === "extras" &&
        oneOffs
          .filter((o) => !focus.oneOffWorkoutId || o.workout.id === focus.oneOffWorkoutId)
          .map(({ workout, warmups, exercises }) => (
          <FitnessCard key={workout.id} title={workout.title} celebrating={celebration?.key === `one_off:${workout.id}`}>
            <WarmupCard warmups={warmups} />
            <SessionLogger
              userId={profile.id}
              datePerformed={todayInBoise()}
              source="one_off"
              exercises={exercises}
              isCompleted={false}
              session={{ oneOffWorkoutId: workout.id }}
              onFinalize={() => handleFinalizeOneOff(workout.id)}
              layout="session"
              exerciseCompletionType="one_off"
              scrollViewRef={scrollViewRef}
              scrollOffsetRef={scrollOffsetRef}
              restReturnTo={{
                pathname: "/(member)/plan",
                params: { session: "one_off", oneOffWorkoutId: workout.id },
              }}
            />
          </FitnessCard>
        ))}
    </ScrollView>
    </View>

    <ProgramPickerModal
      visible={pickerOpen || (needsPicker && !pickerDismissed)}
      options={candidates}
      onSelect={(selected) => {
        setPickedFocus({ focus: selected, signature: paramSignature });
        setPickerOpen(false);
        setPickerDismissed(false);
      }}
      onClose={() => {
        setPickerOpen(false);
        setPickerDismissed(true);
      }}
    />

    {/* Screen-level and outside the ScrollView, so the pieces fall down what
        the member is looking at and can't scroll away mid-fall. Rendered
        before the plate so it paints underneath it: the plate is a Modal,
        which sits above in-tree content on both platforms. */}
    <FinalizeConfettiScreen runKey={celebration?.runKey ?? null} />

    <FinalizePlate plate={finalizePlate} onDone={() => setFinalizePlate(null)} />
    </View>
  );
}
