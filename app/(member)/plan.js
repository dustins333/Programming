import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate } from "../../lib/programming/schedule";
import { listMyAssignments, getCurrentBlock, getWorkout } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getSpcClient, isSpcActive } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { listSpcWorkoutExercises, getSpcWorkoutWeekTitles } from "../../lib/programming/spcWorkouts";
import { listActiveOneOffWorkoutsForUser, listOneOffWarmups, listOneOffExercises } from "../../lib/programming/oneOffWorkouts";
import {
  getGroupCompletion,
  getCompletedSpcWorkoutIdsForWeek,
  finalizeGroupSession,
  finalizeSpcSession,
  finalizeOneOffSession,
} from "../../lib/programming/sessionCompletions";
import { SessionLogger } from "../../components/SessionLogger";
import { fonts, colors } from "../../lib/theme";

// Matches My Week's card treatment — a white box sitting on the page's
// warm-gray background so each program reads as its own distinct block.
// `title` is only rendered when there's no tab bar above already naming
// the program (see ProgramTabs) — with tabs visible, a second big program
// name inside the card would just repeat what the active tab already says.
function FitnessCard({ title, children }) {
  return (
    <View
      className="mb-6 rounded-2xl px-5 py-5"
      style={{ backgroundColor: "white", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14 }}
    >
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
            className="items-center rounded-xl px-4 py-3"
            style={{ borderWidth: 1.5, borderColor: colors.primary, backgroundColor: isActive ? colors.primary : "white" }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, color: isActive ? "white" : colors.primaryOnWhite }}>{opt.label}</Text>
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
function SpcSessionPicker({ sessions, selected, onSelect }) {
  return (
    <View className="mb-4 flex-row gap-2">
      {sessions.map((s) => {
        const isActive = s.sessionNumber === selected;
        return (
          <Pressable
            key={s.sessionNumber}
            onPress={() => onSelect(s.sessionNumber)}
            className="flex-1 items-center rounded-xl py-2.5"
            style={{ borderWidth: 1.5, borderColor: isActive ? colors.primary : "#e7e5e4", backgroundColor: isActive ? "#fdf6f2" : "white" }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12 }} className="text-stone-600">
              Session {s.sessionNumber}
            </Text>
            <Ionicons
              name={s.completed ? "checkmark-circle-outline" : "ellipse-outline"}
              size={18}
              color={s.completed ? "#4d6142" : "#d6d3d1"}
              style={{ marginTop: 3 }}
            />
          </Pressable>
        );
      })}
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

  const load = useCallback(async () => {
    setGroupsLoading(true);
    const today = todayInBoise();

    // Every membership loads independently — a client can hold several
    // group program memberships at once (e.g. Flagship plus a specialty
    // program), and one program's failure shouldn't hide another's, same
    // reasoning as group-vs-SPC-vs-one-offs below.
    try {
      const assignments = await listMyAssignments(profile.id);
      const results = await Promise.all(
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

            // Every program owns its own day-of-week map now (migration
            // 0011) — Flagship/BWA's Mon/Tue-Wed/Thu-Fri/Sat scheme is just
            // this program's data, not a rule every group program follows.
            const sessionNumber = sessionNumberForDate(today, program.session_days);
            if (!sessionNumber) return { groupProgramId: program.id, programName: program.name, status: "rest_day" };

            const weekNumber = currentWeekNumber(block.block_start_date, program.block_length_weeks, today);
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
                notes: ex.tempo ? `tempo ${ex.tempo}` : null,
              })),
            };
          } catch (err) {
            return { groupProgramId: program.id, programName: program.name, status: "error", message: err.message ?? String(err) };
          }
        })
      );
      setGroups(results);
    } catch (err) {
      setGroups([{ status: "error", message: err.message ?? String(err) }]);
    } finally {
      setGroupsLoading(false);
    }

    try {
      const spcClient = await getSpcClient(profile.id);
      const active = isSpcActive(spcClient);
      setHasSpc(active);
      if (!active) {
        setSpc(null);
      } else {
        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) {
          setSpc({ status: "no_block" });
        } else {
          const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
          if (workouts.length === 0) {
            setSpc({ status: "not_published" });
          } else {
            const weekNumber = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
            const sessionsPerWeek = spcClient.sessions_per_week;
            const relevant = workouts.slice(0, sessionsPerWeek);
            const workoutIds = relevant.map((w) => w.id);
            const completedIds = await getCompletedSpcWorkoutIdsForWeek(profile.id, workoutIds, weekNumber);
            const sessions = relevant.map((w) => ({ sessionNumber: w.session_number, workout: w, completed: completedIds.has(w.id) }));
            const defaultSession = sessions.find((s) => !s.completed) ?? sessions[0];
            setSpc({
              status: sessions.every((s) => s.completed) ? "done" : "ready",
              weekNumber,
              sessionsPerWeek,
              sessions,
              selectedSessionNumber: defaultSession?.sessionNumber ?? null,
            });
          }
        }
      }
    } catch {
      setHasSpc(false);
      setSpc(null);
    }

    // One-offs load independently too, same reasoning — an away workout or
    // trial session assignment has nothing to do with group/SPC, so its
    // failure shouldn't hide either of those sections.
    try {
      const activeOneOffs = await listActiveOneOffWorkoutsForUser(profile.id);
      const withContent = await Promise.all(
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
              notes: ex.rest ? `rest ${ex.rest}${ex.notes ? ` · ${ex.notes}` : ""}` : ex.notes,
            })),
          };
        })
      );
      setOneOffs(withContent);
    } catch {
      setOneOffs([]);
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
      const [exerciseRows, weekTitles] = await Promise.all([
        listSpcWorkoutExercises(session.workout.id),
        getSpcWorkoutWeekTitles(session.workout.id),
      ]);
      if (cancelled) return;
      const title = weekTitles.find((t) => t.week_number === spc.weekNumber)?.title || session.workout.title || null;
      setSpcDetail({
        sessionNumber: session.sessionNumber,
        title,
        exercises: exerciseRows.map((ex) => {
          const weekTarget = ex.spc_exercise_weeks.find((w) => w.week_number === spc.weekNumber);
          return {
            id: ex.id,
            exercise: ex.exercises,
            targetSets: weekTarget?.sets,
            targetReps: weekTarget?.reps,
            notes: weekTarget?.rest ? `rest ${weekTarget.rest}` : ex.notes,
          };
        }),
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
      <View className="flex-1 items-center justify-center bg-stone-100">
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
      isCompleted: visibleGroup.completed,
      onFinalize: () => handleFinalizeGroup(visibleGroup),
    };
  } else if ((!showTabs || selectedProgram === "spc") && spc?.status === "ready" && spcDetail) {
    activeFinalize = {
      key: "spc",
      isCompleted: spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false,
      onFinalize: handleFinalizeSpc,
    };
  }

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
      <View className="flex-1 items-center justify-center bg-stone-100 px-6">
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          You're not assigned to a program yet — check with your coach.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-stone-100">
    <ScrollView className="flex-1" contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
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

            {groupEntry.status === "ready" && (
              <FitnessCard title={showTabs ? null : groupEntry.programName}>
                <Text className="mb-1 text-center text-sm text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                  Week {groupEntry.weekNumber}, Session {groupEntry.sessionNumber}
                  {groupEntry.workout.title ? ` — ${groupEntry.workout.title}` : ""}
                </Text>
                {groupEntry.warmups.length > 0 && (
                  <Text className="mb-2 text-center text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    Warm-up: {groupEntry.warmups.map((w) => w.exercises?.name ?? w.label).join(", ")}
                  </Text>
                )}
                <Pressable
                  onPress={() => router.push({ pathname: "/(member)/plan-block", params: { programId: groupEntry.groupProgramId } })}
                  className="mb-4 self-center"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    View full block →
                  </Text>
                </Pressable>

                <SessionLogger
                  userId={profile.id}
                  datePerformed={todayInBoise()}
                  source={groupEntry.source}
                  exercises={groupEntry.exercises}
                  isCompleted={groupEntry.completed}
                  onFinalize={() => handleFinalizeGroup(groupEntry)}
                  hideFinalizeButton={activeFinalize?.key === groupEntry.groupProgramId}
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
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                  <Text className="mb-1 text-center text-sm text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                    Session {spcDetail.sessionNumber}
                    {spcDetail.title ? ` — ${spcDetail.title}` : ""}
                  </Text>
                  <Pressable
                    onPress={() => router.push("/(member)/plan-spc-block")}
                    className="mb-4 self-center"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                      View full SPC block →
                    </Text>
                  </Pressable>

                  <SessionLogger
                    userId={profile.id}
                    datePerformed={todayInBoise()}
                    source="spc"
                    exercises={spcDetail.exercises}
                    isCompleted={spc.sessions.find((s) => s.sessionNumber === spcDetail.sessionNumber)?.completed ?? false}
                    onFinalize={handleFinalizeSpc}
                    hideFinalizeButton={activeFinalize?.key === "spc"}
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
            {warmups.length > 0 && (
              <Text className="mb-2 text-center text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                Warm-up: {warmups.map((w) => w.exercises?.name ?? w.label).join(", ")}
              </Text>
            )}
            <SessionLogger
              userId={profile.id}
              datePerformed={todayInBoise()}
              source="one_off"
              exercises={exercises}
              isCompleted={false}
              onFinalize={() => handleFinalizeOneOff(workout.id)}
            />
          </FitnessCard>
        ))}
    </ScrollView>

    {activeFinalize && (
      <View className="px-6 py-3.5" style={{ borderTopWidth: 1, borderTopColor: "#e7e5e4", backgroundColor: "white" }}>
        <Pressable
          onPress={handleFooterFinalize}
          disabled={footerFinalizing}
          className="items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
        >
          <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {footerFinalizing ? "Saving…" : activeFinalize.isCompleted ? "Session finalized ✓ (tap to re-finalize)" : "Finalize workout"}
          </Text>
        </Pressable>
      </View>
    )}
    </View>
  );
}
