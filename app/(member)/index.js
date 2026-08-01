import { useCallback, useState } from "react";
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
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { listSpcWorkoutExercises, listSpcWarmups, listSpcWorkoutWeekTitlesForWorkouts } from "../../lib/programming/spcWorkouts";
import { listGroupCompletionsForWorkouts, getCompletedSpcWorkoutIdsForWeek } from "../../lib/programming/sessionCompletions";
import { listWeekOneOffWorkoutsForUser, listOneOffWarmups, listOneOffExercises } from "../../lib/programming/oneOffWorkouts";
import { listLogsForDateRange } from "../../lib/nutrition/dailyLog";
import { SessionPreviewModal } from "../../components/SessionPreviewModal";
import { fonts, colors } from "../../lib/theme";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sa", "Su"]; // Monday..Sunday

// A section's "fully checked off" wash — deliberately more saturated than
// the app's usual subtle statusColors.onTrack tint, since the point here is
// a visible celebratory moment, not a quiet status indicator. The header
// band uses a slightly deeper shade of the same family for a two-tone card.
const DONE_BG = "#dcead0";
const DONE_BORDER = "#8fb473";
const DONE_HEADER_BG = "#c9e0b8";
const HEADER_BG = "#f6e2d6";

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

// One tappable bubble in a session row — a preview + checkmark, not a
// logging control. Tapping a published bubble opens a read-only detail
// popup; an unpublished slot renders muted and isn't pressable at all.
function SessionBubble({ label, title, completed, published, onPress, borderColor, caption, fixedWidth }) {
  const hasTitle = title && title !== "Untitled session";
  return (
    <Pressable
      onPress={published ? onPress : undefined}
      className={fixedWidth ? "items-center rounded-xl px-1 py-3" : "flex-1 items-center rounded-xl px-1 py-3"}
      style={{
        borderWidth: 1.5,
        borderColor: published ? borderColor : "#e7e5e4",
        backgroundColor: "white",
        opacity: published ? 1 : 0.55,
        ...(fixedWidth ? { width: fixedWidth } : null),
      }}
    >
      {/* Top block grows to fill whatever space the bottom block doesn't
          need — since siblings in the row are stretched to equal height,
          this pins the checkmark+caption to the same Y position in every
          bubble regardless of whether this one has a title line or not. */}
      <View className="flex-1 items-center">
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 12 }} className="max-w-full text-center text-stone-600">
          {label}
        </Text>
        {hasTitle ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 10 }} className="mt-0.5 max-w-full text-center text-stone-500">
            {title}
          </Text>
        ) : null}
      </View>
      <View className="items-center">
        {published ? (
          <Ionicons
            name={completed ? "checkmark-circle-outline" : "ellipse-outline"}
            size={26}
            color={completed ? "#4d6142" : "#d6d3d1"}
          />
        ) : (
          <Text className="text-xs text-stone-300" style={{ fontFamily: fonts.sans }}>
            —
          </Text>
        )}
        {caption ? (
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 10 }} className="mt-1.5 text-stone-400">
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function WeekSection({ title, rows, target, completedCount, onNavigate }) {
  const isDone = completedCount >= target;
  const borderColor = isDone ? DONE_BORDER : colors.primary;
  return (
    <View
      className="mb-4 overflow-hidden rounded-2xl"
      style={{
        backgroundColor: isDone ? DONE_BG : "white",
        borderWidth: 1.5,
        borderColor,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
      }}
    >
      <View
        className="flex-row items-end justify-between px-4 py-3"
        style={{ backgroundColor: isDone ? DONE_HEADER_BG : HEADER_BG, borderBottomWidth: 1.5, borderBottomColor: borderColor }}
      >
        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>{title}</Text>
        <View className="flex-row items-center gap-2">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 24, color: isDone ? "#4d6142" : colors.primaryOnWhite }}>
            {completedCount}/{target}
          </Text>
          <Pressable
            onPress={onNavigate}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`Go to ${title} in My Fitness`}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.primaryOnWhite} />
          </Pressable>
        </View>
      </View>
      <View className="flex-row gap-2 px-4 py-4">
        {rows.map(({ key, label, title: rowTitle, completed, published, onPress, caption }) => (
          <SessionBubble
            key={key}
            label={label}
            title={rowTitle}
            completed={completed}
            published={published}
            onPress={onPress}
            borderColor={borderColor}
            caption={caption}
          />
        ))}
      </View>
    </View>
  );
}

function NutritionStrip({ days, onNavigate }) {
  return (
    <View
      className="mb-4 overflow-hidden rounded-2xl"
      style={{ backgroundColor: "white", borderWidth: 1.5, borderColor: colors.primary, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14 }}
    >
      <View
        className="flex-row items-center justify-center px-4 py-3"
        style={{ backgroundColor: HEADER_BG, borderBottomWidth: 1.5, borderBottomColor: colors.primary }}
      >
        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>Nutrition</Text>
        <Pressable
          onPress={onNavigate}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Go to My Nutrition"
          style={{ position: "absolute", right: 16 }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.primaryOnWhite} />
        </Pressable>
      </View>
      <View className="flex-row gap-1.5 px-4 py-4">
        {days.map((day) => (
          <View
            key={day.date}
            className="flex-1 items-center rounded-xl px-1 py-2.5"
            style={{ borderWidth: 1.5, borderColor: day.isToday ? colors.primary : "#e7e5e4", backgroundColor: "white" }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11 }} className="mb-1 text-stone-600">
              {day.label}
            </Text>
            <Ionicons
              name={day.finalized ? "checkmark-circle-outline" : "ellipse-outline"}
              size={22}
              color={day.finalized ? "#4d6142" : "#d6d3d1"}
            />
          </View>
        ))}
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
  const isDone = target > 0 && completedCount >= target;
  const borderColor = isDone ? DONE_BORDER : colors.primary;
  return (
    <View
      className="mb-4 overflow-hidden rounded-2xl"
      style={{
        backgroundColor: isDone ? DONE_BG : "white",
        borderWidth: 1.5,
        borderColor,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
      }}
    >
      <View
        className="flex-row items-end justify-between px-4 py-3"
        style={{ backgroundColor: isDone ? DONE_HEADER_BG : HEADER_BG, borderBottomWidth: 1.5, borderBottomColor: borderColor }}
      >
        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>Extras</Text>
        <View className="flex-row items-center gap-2">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 24, color: isDone ? "#4d6142" : colors.primaryOnWhite }}>
            {completedCount}/{target}
          </Text>
          <Pressable onPress={onNavigate} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Go to Extras in My Fitness">
            <Ionicons name="chevron-forward" size={22} color={colors.primaryOnWhite} />
          </Pressable>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2 px-4 py-4">
        {items.map((item) => (
          <SessionBubble
            key={item.key}
            label={item.label}
            completed={item.completed}
            published
            onPress={item.onPress}
            borderColor={borderColor}
            fixedWidth={96}
          />
        ))}
      </View>
    </View>
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

  const load = useCallback(async () => {
    setGroupsLoading(true);
    const today = todayInBoise();

    // Each membership loads independently — a client can hold several
    // group program memberships at once (e.g. Flagship plus a specialty
    // program), and one program's failure shouldn't hide another's, same
    // reasoning as group-vs-SPC-vs-nutrition below.
    try {
      const assignments = await listMyAssignments(profile.id);
      const results = await Promise.all(
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
            // not a rule every group program follows.
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
              sessionsPerWeek: assignment.sessions_per_week ?? program.sessions_per_week,
              rows,
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
      if (!isSpcActive(spcClient)) {
        setSpc(null);
      } else {
        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) {
          setSpc({ status: "no_block" });
        } else {
          const weekNumber = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
          const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
          if (workouts.length === 0) {
            setSpc({ status: "not_published" });
          } else {
            const sessionsPerWeek = spcClient.sessions_per_week;
            const workoutIds = workouts.map((w) => w.id);
            const [completedIds, weekTitles] = await Promise.all([
              getCompletedSpcWorkoutIdsForWeek(profile.id, workoutIds, weekNumber),
              listSpcWorkoutWeekTitlesForWorkouts(workoutIds),
            ]);

            const rows = Array.from({ length: sessionsPerWeek }, (_, i) => i + 1).map((sessionNumber) => {
              const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
              const overrideTitle = workout ? weekTitles[workout.id]?.[weekNumber] : null;
              const resolvedTitle = overrideTitle || workout?.title || "Untitled session";
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

            setSpc({ status: "ready", weekNumber, sessionsPerWeek, rows });
          }
        }
      }
    } catch {
      setSpc(null);
    }

    // Monday-Sunday of the current week, regardless of which day "today"
    // falls on — dayOfWeekInBoise is 0=Sunday..6=Saturday, so Sunday needs
    // its own offset (Monday was 6 days ago) rather than 1 - day.
    try {
      const dow = dayOfWeekInBoise(today);
      const weekStart = addDays(today, dow === 0 ? -6 : 1 - dow);
      const weekEnd = addDays(weekStart, 6);
      const logs = await listLogsForDateRange(profile.id, weekStart, weekEnd);
      const finalizedDates = new Set(logs.filter((l) => l.finalized_at).map((l) => l.log_date));
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return { date, label: DAY_LABELS[i], finalized: finalizedDates.has(date), isToday: date === today };
      });
      setNutrition({ status: "ready", days });
    } catch {
      setNutrition(null);
    }

    // One-offs load independently too — an away workout or trial session
    // assignment has nothing to do with group/SPC/nutrition, so its
    // failure shouldn't hide any of those sections.
    try {
      const workouts = await listWeekOneOffWorkoutsForUser(profile.id, today);
      setOneOffs(
        workouts.map((w) => ({
          key: w.id,
          workoutId: w.id,
          label: w.title,
          completed: w.completed,
        }))
      );
    } catch {
      setOneOffs([]);
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
      exercises: exerciseRows.map((ex) => {
        const weekTarget = ex.spc_exercise_weeks.find((w) => w.week_number === spc.weekNumber);
        return {
          id: ex.id,
          name: ex.exercises?.name,
          detail: `${weekTarget?.sets ?? "–"}×${weekTarget?.reps ?? "–"}`,
        };
      }),
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
      <View className="flex-1 items-center justify-center bg-stone-200">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-stone-200"
      contentContainerClassName="px-5 pb-5"
      contentContainerStyle={{ paddingTop: insets.top + 6 }}
    >
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }} numberOfLines={1}>
          Hi, {profile?.name}
        </Text>
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 36, height: 36, borderRadius: 18 }} />
      </View>
      <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
        {formatToday()}
      </Text>

      {groups.length === 0 && !spc && (
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
          <WeekSection
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
        <WeekSection
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
