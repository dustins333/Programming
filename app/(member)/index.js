import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate } from "../../lib/programming/schedule";
import { getMyAssignment, getCurrentBlock, getWorkout } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getSpcClient } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listPublishedSpcWorkoutsForBlock } from "../../lib/programming/spcBlocks";
import { getLogForDate } from "../../lib/nutrition/dailyLog";
import { getCurrentTarget, deriveCalories } from "../../lib/nutrition/targets";
import { fonts, colors } from "../../lib/theme";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

function Eyebrow({ children }) {
  return (
    <Text className="text-xs uppercase" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5, color: "#8a5140" }}>
      {children}
    </Text>
  );
}

export default function MemberHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState({ status: "loading" });
  const [spcTeaser, setSpcTeaser] = useState(null); // null = no SPC / no active block, else { sessionCount }
  const [nutrition, setNutrition] = useState(null); // { status: "logged"|"not_logged", weight, caloriePct }

  const load = useCallback(async () => {
    setSession({ status: "loading" });
    const today = todayInBoise();

    // Each section loads independently — a member with only SPC (no group
    // program), or nutrition data that errors before its migration has run,
    // shouldn't be able to take down the rest of Today. Same isolation
    // pattern as the Clients page's nutrition/SPC lookups.
    try {
      const assignment = await getMyAssignment(profile.id);
      if (!assignment?.group_program_id) {
        setSession({ status: "unassigned" });
      } else {
        const program = assignment.group_programs;
        const block = await getCurrentBlock(program.id, today);
        if (!block) {
          setSession({ status: "no_block", programName: program.name });
        } else {
          const sessionNumber = sessionNumberForDate(today);
          if (!sessionNumber) {
            setSession({ status: "rest_day", programName: program.name });
          } else {
            const weekNumber = currentWeekNumber(block.block_start_date, program.block_length_weeks, today);
            const workout = await getWorkout(block.id, weekNumber, sessionNumber);
            if (!workout) {
              setSession({ status: "not_published", programName: program.name, weekNumber, sessionNumber });
            } else {
              const [warmups, exercises] = await Promise.all([listWarmups(workout.id), listWorkoutExercises(workout.id)]);
              setSession({ status: "ready", programName: program.name, weekNumber, sessionNumber, warmups, exercises });
            }
          }
        }
      }
    } catch (err) {
      setSession({ status: "error", message: err.message ?? String(err) });
    }

    try {
      const spcClient = await getSpcClient(profile.id);
      if (spcClient) {
        const block = await getCurrentSpcBlock(profile.id, today);
        if (block) {
          const workouts = await listPublishedSpcWorkoutsForBlock(block.id);
          if (workouts.length > 0) setSpcTeaser({ sessionCount: workouts.length });
        }
      }
    } catch {
      // leave spcTeaser null
    }

    try {
      const log = await getLogForDate(profile.id, today);
      const hasAnything = log && Object.entries(log).some(([key, v]) => !["user_id", "log_date"].includes(key) && v !== null);
      if (!hasAnything) {
        setNutrition({ status: "not_logged" });
      } else {
        const target = await getCurrentTarget(profile.id, today);
        let caloriePct = null;
        if (target && (log.protein_g !== null || log.carb_g !== null || log.fat_g !== null)) {
          const targetCalories = deriveCalories(target);
          const loggedCalories = deriveCalories({ protein_g: log.protein_g, carb_g: log.carb_g, fat_g: log.fat_g });
          if (targetCalories > 0) caloriePct = Math.round((loggedCalories / targetCalories) * 100);
        }
        setNutrition({ status: "logged", weight: log.weight, caloriePct });
      }
    } catch {
      setNutrition(null);
    }
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Hi, {profile?.name}
      </Text>
      <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
        {formatToday()}
      </Text>

      {session.status === "error" && (
        <Text className="mb-4 text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your plan: {session.message}
        </Text>
      )}
      {session.status === "unassigned" && !spcTeaser && (
        <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
          You're not assigned to a program yet — check with your coach.
        </Text>
      )}
      {session.status === "no_block" && (
        <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
          No active {session.programName} block right now.
        </Text>
      )}
      {session.status === "not_published" && (
        <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Week {session.weekNumber}, Session {session.sessionNumber} isn't published yet — check back soon.
        </Text>
      )}

      {session.status === "rest_day" && (
        <View className="mb-4 rounded-2xl border border-dashed border-stone-300 px-5 py-6 items-center">
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-600">
            Rest day
          </Text>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            No session scheduled — back Monday
          </Text>
        </View>
      )}

      {session.status === "ready" && (
        <View className="mb-4 rounded-2xl border border-stone-200 px-5 py-4" style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 }}>
          <View className="mb-1 flex-row items-center justify-between">
            <Eyebrow>Today's session</Eyebrow>
            {spcTeaser ? (
              <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: "#f4ede3" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#8a5a2e" }}>+ SPC today</Text>
              </View>
            ) : null}
          </View>
          <Text className="mb-2 text-stone-700" style={{ fontFamily: fonts.sansSemiBold, fontSize: 16 }}>
            {session.programName} — Week {session.weekNumber}, Session {session.sessionNumber}
          </Text>

          {session.warmups.length > 0 && (
            <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Warm-up: {session.warmups.map((w) => w.exercises?.name ?? w.label).join(", ")}
            </Text>
          )}

          <View className="mb-4 rounded-xl px-3.5" style={{ backgroundColor: "#faf7f4", borderWidth: 1, borderColor: "#f0ebe6" }}>
            {session.exercises.map((ex, i) => (
              <View
                key={ex.id}
                className="flex-row items-center justify-between py-2.5"
                style={i < session.exercises.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f0ebe6" } : undefined}
              >
                <Text className="text-stone-700" style={{ fontFamily: fonts.sansMedium, fontSize: 14 }}>
                  {ex.exercises?.name}
                </Text>
                <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {ex.sets}×{ex.reps}
                  {ex.tempo ? ` · ${ex.tempo}` : ""}
                </Text>
              </View>
            ))}
          </View>

          <Pressable onPress={() => router.push("/(member)/session")} className="items-center rounded-lg bg-primary py-3.5">
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              Start session
            </Text>
          </Pressable>
        </View>
      )}

      {spcTeaser ? (
        <Pressable
          onPress={() => router.push("/(member)/spc-session")}
          className="mb-4 rounded-2xl border border-stone-200 px-5 py-4"
        >
          <Eyebrow>SPC — Individual program</Eyebrow>
          <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {spcTeaser.sessionCount} session{spcTeaser.sessionCount === 1 ? "" : "s"} · with your coach
          </Text>
          <Text className="mt-2" style={{ fontFamily: fonts.sansMedium, color: "#8a5140", fontSize: 13 }}>
            View SPC session ↓
          </Text>
        </Pressable>
      ) : null}

      {nutrition ? (
        <View
          className="mb-4 rounded-2xl px-5 py-4"
          style={
            nutrition.status === "logged"
              ? { borderWidth: 1, borderColor: "#e7e5e4" }
              : { borderWidth: 1, borderColor: "#e9d3c6", borderStyle: "dashed", backgroundColor: "#fdf6f2" }
          }
        >
          <View className="flex-row items-center justify-between">
            <Eyebrow>Today's nutrition</Eyebrow>
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: nutrition.status === "logged" ? "#eef1e7" : "#f1efed" }}
            >
              <Text
                style={{
                  fontFamily: fonts.sansSemiBold,
                  fontSize: 11,
                  color: nutrition.status === "logged" ? "#4d6142" : "#78716c",
                }}
              >
                {nutrition.status === "logged" ? "✓ Logged" : "Not logged"}
              </Text>
            </View>
          </View>

          {nutrition.status === "logged" ? (
            <View className="mt-3 flex-row gap-3">
              {nutrition.weight !== null && nutrition.weight !== undefined ? (
                <View className="flex-1 rounded-xl bg-white px-3 py-2.5" style={{ borderWidth: 1, borderColor: "#f0ebe6" }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16 }} className="text-stone-700">
                    {nutrition.weight} lb
                  </Text>
                </View>
              ) : null}
              {nutrition.caloriePct !== null ? (
                <View className="flex-1 rounded-xl bg-white px-3 py-2.5" style={{ borderWidth: 1, borderColor: "#f0ebe6" }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16 }} className="text-stone-700">
                    {nutrition.caloriePct}%
                  </Text>
                  <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    of today's target
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <>
              <Text className="mb-3 mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                You haven't logged anything today yet.
              </Text>
              <Pressable onPress={() => router.push("/(member)/nutrition")} className="items-center rounded-lg bg-primary py-3">
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  Log today
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
