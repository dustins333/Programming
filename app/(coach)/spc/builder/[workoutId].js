import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getUser } from "../../../../lib/programming/clients";
import { getSpcWorkout, listSpcWarmups, listSpcWorkoutExercises, getSpcSiblingLifts } from "../../../../lib/programming/spcWorkouts";
import { summarizeRepScheme } from "../../../../lib/programming/exercises";
import { CommentThread } from "../../../../components/CommentThread";
import { PatternTally } from "../../../../components/PatternTally";
import { fonts, colors } from "../../../../lib/theme";

// Native is view-only — same policy as the group builder's native screen
// (see its header comment): coaches shouldn't be able to build/edit
// programming from the app, so this just reads whatever the web builder
// last published/drafted. Comments stay live (communication, not
// programming).
export default function SpcWorkoutBuilderNative() {
  const { workoutId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [workout, setWorkout] = useState(null);
  const [member, setMember] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [siblingLifts, setSiblingLifts] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const w = await getSpcWorkout(workoutId);
      setWorkout(w);
      const [memberRow, warmupRows, exerciseRows, siblings] = await Promise.all([
        getUser(w.spc_blocks.spc_client_id),
        listSpcWarmups(workoutId),
        listSpcWorkoutExercises(workoutId),
        getSpcSiblingLifts(w.spc_blocks.id, w.week_number, workoutId),
      ]);
      setMember(memberRow);
      setWarmups(warmupRows);
      setExercises(exerciseRows);
      setSiblingLifts(siblings);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Couldn't load this workout: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!workout || !member) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const currentLifts = exercises.map((e) => ({ name: e.exercises?.name ?? "Unknown exercise", patterns: e.exercises?.movement_pattern ?? [] }));

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 py-6"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
    >
      <Pressable
        onPress={() =>
          router.canGoBack() ? router.back() : router.push(`/(coach)/spc/blocks/${workout.spc_blocks.id}`)
        }
        className="mb-3 self-start"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>
      <Text className="text-xl text-primary" style={{ fontFamily: fonts.display }}>
        {member.name} — Wk {workout.week_number}, Session {workout.session_number}
      </Text>
      <Text
        className="mb-1 text-xs"
        style={{ fontFamily: fonts.sansMedium, color: workout.status === "published" ? colors.primaryOnWhite : "#a8a29e" }}
      >
        {workout.status === "published" ? "Published" : "Draft"}
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
              {item.superset_group_id ? (
                <View className="mr-2 rounded-full px-2.5 py-1" style={{ backgroundColor: "#fdece5" }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: "#b23a22" }}>⚭ Superset</Text>
                </View>
              ) : null}
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
              {item.sets ?? 0} sets x {summarizeRepScheme(item.rep_scheme ?? []) || item.reps || "—"}
              {item.rest ? ` · rest ${item.rest}` : ""}
            </Text>
          </View>
        ))
      )}

      <View className="mb-6 mt-3">
        <PatternTally currentLifts={currentLifts} siblingLifts={siblingLifts} />
      </View>

      <CommentThread spcBlockId={workout.spc_blocks.id} />
    </ScrollView>
  );
}
