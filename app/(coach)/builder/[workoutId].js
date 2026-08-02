import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getWorkout, listWarmups, listWorkoutExercises, getSiblingPatterns } from "../../../lib/programming/workouts";
import { PatternTally } from "../../../components/PatternTally";
import { CommentThread } from "../../../components/CommentThread";
import { fonts, colors } from "../../../lib/theme";

// Native is view-only — per direct request, coaches shouldn't be able to
// build/edit programming from the app at all (previously this was a "view +
// quick adjust" surface with add/remove/reorder/publish controls; those all
// moved to web-only). Session content here is read straight off whatever
// the web builder last published/drafted. Comments stay live since that's
// coach-to-coach communication, not programming.
export default function WorkoutBuilderNative() {
  const { workoutId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [workout, setWorkout] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [siblingPatterns, setSiblingPatterns] = useState([]);

  const load = useCallback(async () => {
    const w = await getWorkout(workoutId);
    setWorkout(w);
    const [warmupRows, exerciseRows, siblings] = await Promise.all([
      listWarmups(workoutId),
      listWorkoutExercises(workoutId),
      getSiblingPatterns(w.group_blocks.id, w.week_number, workoutId),
    ]);
    setWarmups(warmupRows);
    setExercises(exerciseRows);
    setSiblingPatterns(siblings);
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!workout) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const currentPatterns = exercises.map((e) => e.exercises?.movement_pattern).filter(Boolean);

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 py-6"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
    >
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.push(`/(coach)/blocks?program=${workout.group_blocks.group_program_id}`)
        }
        className="mb-3 self-start"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>
      <Text className="text-xl text-primary" style={{ fontFamily: fonts.display }}>
        {workout.group_blocks.group_programs.name} — Wk {workout.week_number}, Session {workout.session_number}
      </Text>
      <Text
        className="mb-1 text-xs"
        style={{ fontFamily: fonts.sansMedium, color: workout.status === "published" ? colors.primaryOnWhite : "#a8a29e" }}
      >
        {workout.status}
      </Text>
      {workout.title ? (
        <Text className="mb-4 text-stone-700" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
          {workout.title}
        </Text>
      ) : (
        <View className="mb-4" />
      )}

      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
        Warm-up
      </Text>
      {warmups.length > 0 ? (
        <View className="mb-6 rounded-xl px-3.5" style={{ backgroundColor: "#faf7f4", borderWidth: 1, borderColor: "#f0ebe6" }}>
          {warmups.map((w, i) => (
            <View
              key={w.id}
              className="py-2.5"
              style={i < warmups.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f0ebe6" } : undefined}
            >
              <Text className="text-stone-700" style={{ fontFamily: fonts.sans, fontSize: 14 }}>
                {i + 1}. {w.exercises?.name ?? w.label}
                {w.sets || w.reps ? ` — ${[w.sets, w.reps].filter(Boolean).join(" x ")}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="mb-6 text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          No warm-up set.
        </Text>
      )}

      <Text className="mb-2 text-xs uppercase text-stone-700" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
        Main Session
      </Text>
      {exercises.length === 0 ? (
        <Text className="mb-6 text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          No exercises yet.
        </Text>
      ) : (
        exercises.map((item) => (
          <View key={item.id} className="mb-3 rounded-lg border border-stone-200 px-3 py-3">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="flex-1" style={{ fontFamily: fonts.sansMedium }}>
                {item.exercises?.name}
              </Text>
              {item.exercises?.video_url ? (
                <Pressable
                  onPress={() => Linking.openURL(item.exercises.video_url)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={`Watch video for ${item.exercises.name}`}
                >
                  <Text style={{ color: colors.primaryOnWhite }}>▶</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={{ fontFamily: fonts.sans }} className="text-stone-600">
              {item.sets ?? 0} sets x {item.reps || "—"}
            </Text>
          </View>
        ))
      )}

      <View className="mb-6 mt-3">
        <PatternTally currentPatterns={currentPatterns} siblingPatterns={siblingPatterns} />
      </View>

      <CommentThread groupBlockId={workout.group_blocks.id} />
    </ScrollView>
  );
}
