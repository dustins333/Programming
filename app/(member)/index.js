import { useCallback, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dayOfWeekInBoise, addDays } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate, formatSessionDays } from "../../lib/programming/schedule";
import { listMyAssignments, getCurrentBlock, listWorkoutsForWeek } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getSpcClient, isSpcActive } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "../../lib/programming/spcBlocks";
import { listSpcWorkoutExercises, listSpcWarmups } from "../../lib/programming/spcWorkouts";
import { listGroupCompletionsForWorkouts, getCompletedSpcWorkoutIdsForWeek } from "../../lib/programming/sessionCompletions";
import { listWeekOneOffWorkoutsForUser, listOneOffWarmups, listOneOffExercises } from "../../lib/programming/oneOffWorkouts";
import { listLogsForDateRange } from "../../lib/nutrition/dailyLog";
import { getClient as getNutritionClient } from "../../lib/nutrition/clients";
import { retryOnce } from "../../lib/retry";
import { SessionPreviewModal } from "../../components/SessionPreviewModal";
import { fonts, colors } from "../../lib/theme";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sa", "Su"]; // Monday..Sunday

// Design tokens from design_handoff_visual_pass_v4/README.md — a completed
// session/card gets a border tint only, never a background fill ("a subtle
// warm fuzzy, never a full-color tile fill").
const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CARD_BORDER_DONE = "#dbe8cf";
const TILE_COMPLETED_BORDER = "#4d6142";
const PILL_BG = "#f5f1ec";
const PILL_BG_DONE = "#e9f0e1";
const PILL_TEXT_DONE = "#3f5136";
const CHEVRON_COLOR = "#c9c4bd";
const DESC_COLOR = "#a8907f";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const CARD_SHADOW = {
  shadowColor: "#44403c",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.05,
  shadowRadius: 16,
  elevation: 2,
};

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

// One tappable bubble in a session row — a preview, not a logging control.
// Day-of-week captions (Mon/Tue, Wed/Thu, Fri/Sat) always show, regardless
// of whether the client's hit their weekly target — those reflect the
// program's real schedule, not this client's personal attendance. Normal
// completion is signaled by border weight/color (2px olive vs. the card's
// default border). Once the whole card's weekly target is met (`weekDone`),
// every bubble in the row greys out uniformly instead — the individual
// completed/not-completed distinction stops mattering once nothing more is
// required this week, and ProgramCard shows a "Training complete" line
// above the row to say so. Fixed 3-row skeleton — title / description
// (blank, not omitted, when there's none) / day caption — so the day
// caption always lands at the same y-position regardless of how many lines
// the description needs.
function SessionBubble({ label, description, completed, published, onPress, caption, weekDone, fixedWidth }) {
  const borderColor = weekDone ? "#d6d3cd" : completed ? TILE_COMPLETED_BORDER : CARD_BORDER;
  return (
    <Pressable
      onPress={published ? onPress : undefined}
      style={{
        flex: fixedWidth ? undefined : 1,
        width: fixedWidth || undefined,
        minHeight: 78,
        flexDirection: "column",
        backgroundColor: weekDone ? "#efece6" : CANVAS,
        borderWidth: completed && !weekDone ? 2 : 1,
        borderColor,
        borderRadius: 14,
        paddingHorizontal: 8,
        paddingTop: 12,
        paddingBottom: 10,
        opacity: weekDone ? 0.55 : published ? 1 : 0.5,
      }}
    >
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c", textAlign: "center" }}>
        {label}
      </Text>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 2 }}>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontStyle: "italic", fontSize: 10.5, color: DESC_COLOR, textAlign: "center" }}>
          {description || ""}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.6, color: "#8a5140", textAlign: "center", textTransform: "uppercase" }}
      >
        {caption || ""}
      </Text>
    </Pressable>
  );
}

// Shared white-card shell for a program row on My Week — 8px dot + name
// left, completed-count pill + chevron right. The pill switches to an
// olive/check tint once every session for the week is done, and the card's
// own border tints toward that same olive family — a subtle nod, not a
// full-color fill. Once done, a "Training complete" line appears above the
// bubble row (pushing it down slightly) and every bubble greys out — per
// explicit ask, replacing an earlier attempt that swapped individual
// bubbles' day-of-week captions for "Not needed" text, which read as
// confusing/inconsistent with the always-real day captions elsewhere.
function ProgramCard({ title, rows, target, completedCount, onNavigate, navigateLabel }) {
  const isDone = completedCount >= target;
  return (
    <View
      className="mb-3.5 rounded-[20px] bg-white px-4 pb-3.5 pt-4"
      style={{ borderWidth: 1, borderColor: isDone ? CARD_BORDER_DONE : CARD_BORDER, ...CARD_SHADOW }}
    >
      <View className="mb-3 flex-row items-center justify-between">
        <View className="mr-2 flex-1 flex-row items-center gap-2">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>
            {title}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View
            className="flex-row items-center rounded-full py-1"
            style={{ backgroundColor: isDone ? PILL_BG_DONE : PILL_BG, paddingLeft: isDone ? 8 : 10, paddingRight: 10 }}
          >
            {isDone ? <Ionicons name="checkmark" size={9} color={PILL_TEXT_DONE} style={{ marginRight: 3 }} /> : null}
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: isDone ? PILL_TEXT_DONE : colors.primaryOnWhite }}>
              {completedCount}/{target}
            </Text>
          </View>
          <Pressable onPress={onNavigate} hitSlop={HITSLOP} accessibilityLabel={navigateLabel ?? `Go to ${title} in My Fitness`}>
            <Ionicons name="chevron-forward" size={16} color={CHEVRON_COLOR} />
          </Pressable>
        </View>
      </View>
      {isDone && (
        <Text className="mb-2.5 text-center" style={{ fontFamily: fonts.sansBold, fontSize: 12, color: PILL_TEXT_DONE, letterSpacing: 0.3 }}>
          ✓ Training complete
        </Text>
      )}
      <View className="flex-row gap-2">
        {rows.map(({ key, label, title: rowTitle, completed, published, onPress, caption, fixedWidth }) => (
          <SessionBubble
            key={key}
            label={label}
            description={rowTitle && rowTitle !== "Untitled session" ? rowTitle : ""}
            completed={completed}
            published={published}
            onPress={onPress}
            caption={caption}
            weekDone={isDone}
            fixedWidth={fixedWidth}
          />
        ))}
      </View>
    </View>
  );
}

// 7-day consistency strip — olive dot = logged, rust ring = today
// (unlogged), neutral outline = everything else. No calorie numbers/
// progress bar — nutrition isn't logged until evening, so nothing
// calorie-related should show mid-day.
function NutritionStrip({ days, onNavigate }) {
  return (
    <View className="mb-3.5 rounded-[20px] bg-white px-4 pb-4 pt-4" style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}>
      <View className="mb-3 flex-row items-center justify-between">
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>Nutrition</Text>
        <Pressable onPress={onNavigate} hitSlop={HITSLOP} accessibilityLabel="Go to My Nutrition">
          <Ionicons name="chevron-forward" size={16} color={CHEVRON_COLOR} />
        </Pressable>
      </View>
      <View className="flex-row justify-between">
        {days.map((day) => {
          const ringToday = day.isToday && !day.finalized;
          return (
            <View key={day.date} className="items-center" style={{ gap: 5 }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: ringToday ? "#fdf6f2" : "transparent",
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: day.finalized ? "#4d6142" : "transparent",
                    borderWidth: day.finalized ? 0 : 1.5,
                    borderColor: day.isToday ? colors.primary : "#d9d4cd",
                  }}
                />
              </View>
              <Text style={{ fontFamily: day.isToday ? fonts.sansBold : fonts.sans, fontSize: 10, color: day.isToday ? colors.primaryOnWhite : "#a8a29e" }}>
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// One-offs don't map onto a fixed 1/2/3 session grid the way Flagship/BWA
// or SPC do — a client can have any number of them (usually 0-2), so the
// bubble row wraps with fixed-width bubbles instead of stretching flex-1
// across a known count.
function OneOffsSection({ items, onNavigate }) {
  const target = items.length;
  const completedCount = items.filter((i) => i.completed).length;
  return (
    <ProgramCard
      title="Extras"
      rows={items.map((item) => ({ ...item, fixedWidth: 96 }))}
      target={target}
      completedCount={completedCount}
      onNavigate={onNavigate}
      navigateLabel="Go to Extras in My Fitness"
    />
  );
}

export default function MemberHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState([]); // one entry per group program membership
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [spc, setSpc] = useState(null); // null = not enrolled
  const [nutrition, setNutrition] = useState(null);
  const [oneOffs, setOneOffs] = useState([]);
  const [preview, setPreview] = useState(null); // { visible, loading, title, subtitle, warmups, exercises }

  // Tabs stay mounted, and useFocusEffect below re-runs load() on every
  // focus — flipping tabs quickly (or any slow network response) can leave
  // two load() calls in flight at once. Without this guard, an older call's
  // response can resolve after a newer one and overwrite good data with
  // whatever that older, possibly-incomplete fetch saw, which reads as
  // titles/rows randomly disappearing even though nothing actually changed
  // server-side. Same "cancelled" convention plan.js's SPC-detail effect
  // already uses, applied here to the whole multi-section load().
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestIdRef.current !== requestId;
    setGroupsLoading(true);
    const today = todayInBoise();

    // Each membership loads independently — a client can hold several
    // group program memberships at once (e.g. Flagship plus a specialty
    // program), and one program's failure shouldn't hide another's, same
    // reasoning as group-vs-SPC-vs-nutrition below. Each section is wrapped
    // in retryOnce: a transient failure on the very first request batch
    // right after a page reload (cold connections, browser resource
    // contention from many parallel fetches firing at once) used to get
    // swallowed by the plain catch below and render identically to "no data
    // here" — indistinguishable from genuinely not being enrolled, and only
    // "fixed" by navigating away and back (which re-triggers load() via
    // useFocusEffect, giving it a second, now-successful attempt). One
    // retry covers that blip without masking a real, persistent failure.
    try {
      const results = await retryOnce(async () => {
        const assignments = await listMyAssignments(profile.id);
        return Promise.all(
          assignments.map(async (assignment) => {
            const program = assignment.group_programs;
            try {
              const block = await getCurrentBlock(program.id, today);
              if (!block) return { groupProgramId: program.id, programName: program.name, status: "no_block" };

              const weekNumber = currentWeekNumber(block.block_start_date, program.block_length_weeks, today);
              const workouts = await listWorkoutsForWeek(block.id, weekNumber);
              const workoutIds = workouts.map((w) => w.id);
              const completedIds = await listGroupCompletionsForWorkouts(profile.id, workoutIds);

              // Every program owns its own session count and day-of-week map
              // now (migrations 0010/0011) — Flagship/BWA's 3-sessions-
              // Mon/Tue-Wed/Thu-Fri/Sat shape is just this program's data,
              // not a rule every group program follows. sessionsPerWeek is
              // the per-client *target* (how many the member is expected to
              // attend), not a restriction on which slots they're allowed to
              // see — a 1x/week client can still attend whichever of the
              // week's sessions fits their schedule (Monday's, Wednesday's,
              // or Friday's), they just only need to do one of them. So
              // every session slot for the program still gets its own
              // bubble with its own real day-of-week caption, regardless of
              // the client's target — ProgramCard below is what shows
              // "Training complete" and greys the whole row out once the
              // target's met, not a per-bubble caption swap.
              const sessionsPerWeek = assignment.sessions_per_week ?? program.sessions_per_week;
              const todaysSessionNumber = sessionNumberForDate(today, program.session_days);
              const rows = Array.from({ length: program.sessions_per_week }, (_, i) => i + 1).map((sessionNumber) => {
                const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
                return {
                  key: `session-${sessionNumber}`,
                  sessionNumber,
                  workout,
                  published: !!workout,
                  label: `Session ${sessionNumber}`,
                  title: workout?.title || "Untitled session",
                  caption: formatSessionDays(program.session_days?.[sessionNumber - 1]),
                  completed: workout ? completedIds.has(workout.id) : false,
                  isToday: sessionNumber === todaysSessionNumber,
                };
              });

              return {
                groupProgramId: program.id,
                programName: program.name,
                status: "ready",
                weekNumber,
                sessionsPerWeek,
                rows,
              };
            } catch (err) {
              return { groupProgramId: program.id, programName: program.name, status: "error", message: err.message ?? String(err) };
            }
          })
        );
      });
      if (!isStale()) setGroups(results);
    } catch (err) {
      console.error("My Week: failed to load group programs", err);
      if (!isStale()) setGroups([{ status: "error", message: err.message ?? String(err) }]);
    } finally {
      if (!isStale()) setGroupsLoading(false);
    }

    try {
      const spcResult = await retryOnce(async () => {
        const spcClient = await getSpcClient(profile.id);
        if (!isSpcActive(spcClient)) return { status: "inactive" };

        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) return { status: "no_block" };

        const weekNumber = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
        const workouts = await listSpcWorkoutsForWeek(block.id, weekNumber);
        if (workouts.length === 0) return { status: "not_published" };

        const sessionsPerWeek = spcClient.sessions_per_week;
        const workoutIds = workouts.map((w) => w.id);
        const completedIds = await getCompletedSpcWorkoutIdsForWeek(profile.id, workoutIds, weekNumber);

        const rows = Array.from({ length: sessionsPerWeek }, (_, i) => i + 1).map((sessionNumber) => {
          const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
          const resolvedTitle = workout?.title || "Untitled session";
          return {
            key: `spc-session-${sessionNumber}`,
            sessionNumber,
            workout,
            published: !!workout,
            label: `Session ${sessionNumber}`,
            title: resolvedTitle,
            completed: workout ? completedIds.has(workout.id) : false,
            isToday: false,
          };
        });

        return { status: "ready", weekNumber, sessionsPerWeek, rows };
      });
      if (!isStale()) setSpc(spcResult.status === "inactive" ? null : spcResult);
    } catch (err) {
      console.error("My Week: failed to load SPC", err);
      // A genuine fetch failure is not the same as "not enrolled" — setting
      // spc to null here made a failed SPC fetch indistinguishable from a
      // client who was never on SPC at all, which fed straight into the
      // "You're not assigned to a program yet" message below even for an
      // SPC-only member. An error-status object still fails every ready/
      // no_block/not_published render check below (so nothing SPC-shaped
      // renders), but `!spc` is now false, so the false claim is suppressed.
      if (!isStale()) setSpc({ status: "error", message: err.message ?? String(err) });
    }

    // Monday-Sunday of the current week, regardless of which day "today"
    // falls on — dayOfWeekInBoise is 0=Sunday..6=Saturday, so Sunday needs
    // its own offset (Monday was 6 days ago) rather than 1 - day.
    try {
      const days = await retryOnce(async () => {
        // A client mid-onboarding (or not turned on at all) has no real
        // daily-log target yet — the strip only means something once
        // they're past the coach's Approve & Set Targets step, same gate
        // the 4-tab home itself uses (lib/nutrition/useNutritionAccess.js).
        const nutritionClient = await getNutritionClient(profile.id);
        if (!nutritionClient || nutritionClient.status !== "active" || !nutritionClient.objective_tracking_approved_at) {
          return null;
        }
        const dow = dayOfWeekInBoise(today);
        const weekStart = addDays(today, dow === 0 ? -6 : 1 - dow);
        const weekEnd = addDays(weekStart, 6);
        const logs = await listLogsForDateRange(profile.id, weekStart, weekEnd);
        const finalizedDates = new Set(logs.filter((l) => l.finalized_at).map((l) => l.date));
        return Array.from({ length: 7 }, (_, i) => {
          const date = addDays(weekStart, i);
          return { date, label: DAY_LABELS[i], finalized: finalizedDates.has(date), isToday: date === today };
        });
      });
      if (!isStale()) setNutrition(days ? { status: "ready", days } : null);
    } catch (err) {
      console.error("My Week: failed to load nutrition", err);
      if (!isStale()) setNutrition(null);
    }

    // One-offs load independently too — an away workout or trial session
    // assignment has nothing to do with group/SPC/nutrition, so its
    // failure shouldn't hide any of those sections.
    try {
      const workouts = await retryOnce(() => listWeekOneOffWorkoutsForUser(profile.id, today));
      if (!isStale()) {
        setOneOffs(
          workouts.map((w) => ({
            key: w.id,
            workoutId: w.id,
            label: w.title,
            completed: w.completed,
            // listWeekOneOffWorkoutsForUser already filters to status:
            // "published" — every row here is real and tappable, unlike a
            // group/SPC session slot which can legitimately be an
            // unpublished placeholder. SessionBubble gates its press
            // handler and opacity on this; leaving it unset made every
            // Extras bubble permanently greyed-out and unpressable.
            published: true,
          }))
        );
      }
    } catch (err) {
      console.error("My Week: failed to load one-offs", err);
      if (!isStale()) setOneOffs([]);
    }
  }, [profile.id]);

  // Refetch on every focus, not just first mount — Tabs keep this screen
  // mounted in the background, so without this, finalizing a session on My
  // Fitness wouldn't be reflected here until a full app reload.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openGroupPreview = async (groupEntry, row) => {
    if (!row.workout) return;
    setPreview({
      visible: true,
      loading: true,
      title: `${groupEntry.programName} — Week ${groupEntry.weekNumber}, ${row.label}`,
      subtitle: row.title !== "Untitled session" ? row.title : null,
      warmups: [],
      exercises: [],
    });
    const [warmups, exercises] = await Promise.all([listWarmups(row.workout.id), listWorkoutExercises(row.workout.id)]);
    setPreview((p) => ({
      ...p,
      loading: false,
      warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
      exercises: exercises.map((ex) => ({
        id: ex.id,
        name: ex.exercises?.name,
        detail: `${ex.sets}×${ex.reps}${ex.tempo ? ` · ${ex.tempo}` : ""}`,
      })),
    }));
  };

  const openSpcPreview = async (row) => {
    if (!row.workout) return;
    setPreview({
      visible: true,
      loading: true,
      title: `SPC — ${row.label}`,
      subtitle: row.title !== "Untitled session" ? row.title : null,
      warmups: [],
      exercises: [],
    });
    const [warmups, exerciseRows] = await Promise.all([listSpcWarmups(row.workout.id), listSpcWorkoutExercises(row.workout.id)]);
    setPreview((p) => ({
      ...p,
      loading: false,
      warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
      exercises: exerciseRows.map((ex) => ({
        id: ex.id,
        name: ex.exercises?.name,
        detail: `${ex.sets ?? "–"}×${ex.reps ?? "–"}`,
      })),
    }));
  };

  const openOneOffPreview = async (item) => {
    setPreview({ visible: true, loading: true, title: item.label, subtitle: null, warmups: [], exercises: [] });
    const [warmups, exercises] = await Promise.all([listOneOffWarmups(item.workoutId), listOneOffExercises(item.workoutId)]);
    setPreview((p) => ({
      ...p,
      loading: false,
      warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
      exercises: exercises.map((ex) => ({
        id: ex.id,
        name: ex.exercises?.name,
        detail: `${ex.sets}×${ex.reps}${ex.rest ? ` · rest ${ex.rest}` : ""}`,
      })),
    }));
  };

  const closePreview = () => setPreview((p) => (p ? { ...p, visible: false } : p));

  if (groupsLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-5 pb-5"
      style={{ backgroundColor: CANVAS }}
      contentContainerStyle={{ paddingTop: insets.top + 6 }}
    >
      <View className="flex-row items-center gap-3">
        {/* design_handoff_v2_settings_nutrition — only mocked on My Week's
            header (the README flagged it as realistically belonging on
            every tab, but only drew it here); easy to extend if asked. */}
        <Pressable onPress={() => router.push("/(member)/settings")} hitSlop={HITSLOP}>
          <Ionicons name="settings-outline" size={22} color="#78716c" />
        </Pressable>
        <Pressable onPress={() => router.push("/(member)/messages")} hitSlop={HITSLOP}>
          <Ionicons name="chatbubble-outline" size={21} color="#78716c" />
        </Pressable>
        <Text className="flex-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }} numberOfLines={1}>
          Hi, {profile?.name}
        </Text>
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 36, height: 36, borderRadius: 18 }} />
      </View>
      <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
        {formatToday()}
      </Text>

      {groups.length === 0 && !spc && oneOffs.length === 0 && (
        <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
          You're not assigned to a program yet — check with your coach.
        </Text>
      )}

      {groups.map((groupEntry) => {
        if (groupEntry.status === "error") {
          return (
            <Text key={groupEntry.groupProgramId ?? "group-error"} className="mb-4 text-red-600" style={{ fontFamily: fonts.sans }}>
              Something went wrong loading {groupEntry.programName ?? "your plan"}: {groupEntry.message}
            </Text>
          );
        }
        if (groupEntry.status === "no_block") {
          return (
            <Text key={groupEntry.groupProgramId} className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
              No active {groupEntry.programName} block right now.
            </Text>
          );
        }
        const completedCount = groupEntry.rows.filter((r) => r.completed).length;
        return (
          <ProgramCard
            key={groupEntry.groupProgramId}
            title={groupEntry.programName}
            rows={groupEntry.rows.map((row) => ({ ...row, onPress: () => openGroupPreview(groupEntry, row) }))}
            target={groupEntry.sessionsPerWeek}
            completedCount={completedCount}
            onNavigate={() => router.push({ pathname: "/(member)/plan", params: { program: groupEntry.groupProgramId } })}
          />
        );
      })}

      {spc?.status === "no_block" && (
        <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
          No active SPC block right now.
        </Text>
      )}
      {spc?.status === "not_published" && (
        <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Your SPC coach hasn't published this block yet — check back soon.
        </Text>
      )}

      {spc?.status === "ready" && (
        <ProgramCard
          title="SPC"
          rows={spc.rows.map((row) => ({ ...row, onPress: () => openSpcPreview(row) }))}
          target={spc.sessionsPerWeek}
          completedCount={spc.rows.filter((r) => r.completed).length}
          onNavigate={() => router.push({ pathname: "/(member)/plan", params: { program: "spc" } })}
        />
      )}

      {oneOffs.length > 0 && (
        <OneOffsSection
          items={oneOffs.map((item) => ({ ...item, onPress: () => openOneOffPreview(item) }))}
          onNavigate={() => router.push({ pathname: "/(member)/plan", params: { program: "extras" } })}
        />
      )}

      {nutrition?.status === "ready" && (
        <NutritionStrip days={nutrition.days} onNavigate={() => router.push("/(member)/nutrition")} />
      )}

      <SessionPreviewModal
        visible={!!preview?.visible}
        onClose={closePreview}
        title={preview?.title}
        subtitle={preview?.subtitle}
        loading={preview?.loading}
        warmups={preview?.warmups}
        exercises={preview?.exercises}
      />
    </ScrollView>
  );
}
