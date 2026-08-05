import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Alert, Linking } from "react-native";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  listExercises,
  createExercise,
  updateExercise,
  setExerciseActive,
  MUSCLE_GROUPS,
} from "../../../lib/programming/exercises";
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };

export default function Exercises() {
  const { profile } = useAuth();
  const [exercises, setExercises] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("lift");
  const [muscleFilter, setMuscleFilter] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const data = await listExercises();
    setExercises(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const parentNameById = useMemo(() => {
    const map = new Map();
    (exercises ?? []).forEach((ex) => map.set(ex.id, ex.name));
    return map;
  }, [exercises]);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    return exercises.filter((ex) => {
      if ((ex.type ?? "lift") !== typeFilter) return false;
      if (typeFilter === "lift" && muscleFilter && !ex.muscle_group?.includes(muscleFilter)) return false;
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [exercises, search, typeFilter, muscleFilter]);

  const handleSubmit = async (form) => {
    try {
      if (editing) {
        await updateExercise(editing.id, form);
      } else {
        await createExercise({ ...form, createdBy: profile.id });
      }
      await load();
    } catch (err) {
      Alert.alert("Failed to save exercise", err.message ?? String(err));
      throw err;
    }
  };

  const handleArchive = async (exercise) => {
    try {
      await setExerciseActive(exercise.id, false);
      await load();
    } catch (err) {
      Alert.alert("Failed to archive", err.message ?? String(err));
    }
  };

  return (
    <CoachShell>
      <View className="flex-1" style={{ backgroundColor: "#faf8f6", padding: 40 }}>
        <View className="mb-5 flex-row items-center justify-between" style={{ maxWidth: 900 }}>
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 24 }}>Exercise Library</Text>
          <Pressable
            onPress={() => {
              setEditing(null);
              setModalVisible(true);
            }}
            className="rounded-lg px-4 py-2.5"
            style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16 }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              + New Exercise
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          className="mb-4 rounded-lg border border-stone-300 bg-white px-4"
          style={{ fontFamily: fonts.sans, fontSize: 13, height: 40, maxWidth: 900 }}
        />

        <View className="mb-3.5 flex-row overflow-hidden self-start rounded-full" style={{ borderWidth: 1, borderColor: colors.primary }}>
          {[
            { key: "lift", label: "Lifts" },
            { key: "warmup", label: "Warm-ups" },
          ].map((opt) => {
            const active = typeFilter === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setTypeFilter(opt.key)}
                className="px-5 py-2.5"
                style={{ backgroundColor: active ? colors.primary : "transparent" }}
              >
                <Text style={{ fontFamily: active ? fonts.sansBold : fonts.sansSemiBold, color: active ? "white" : colors.primaryOnWhite, fontSize: 13 }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {typeFilter === "lift" && (
          <View className="mb-5 flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => setMuscleFilter(null)}
              className="rounded-full px-4 py-[7px]"
              style={{ backgroundColor: !muscleFilter ? colors.primary : "white", borderWidth: !muscleFilter ? 0 : 1, borderColor: "#d9d4cd" }}
            >
              <Text style={{ fontFamily: fonts.sansBold, color: !muscleFilter ? "white" : "#57534e", fontSize: 12.5 }}>All</Text>
            </Pressable>
            {MUSCLE_GROUPS.map((mg) => {
              const active = muscleFilter === mg;
              return (
                <Pressable
                  key={mg}
                  onPress={() => setMuscleFilter(mg)}
                  className="rounded-full px-4 py-[7px]"
                  style={{ backgroundColor: active ? colors.primary : "white", borderWidth: active ? 0 : 1, borderColor: "#d9d4cd" }}
                >
                  <Text style={{ fontFamily: active ? fonts.sansBold : fonts.sansSemiBold, color: active ? "white" : "#57534e", fontSize: 12.5 }}>
                    {mg.replace("_", " ")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {!exercises ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View className="rounded-2xl border bg-white" style={[{ borderColor: "#ece7e1", maxWidth: 900, overflow: "hidden" }, CARD_SHADOW]}>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
                  No {typeFilter === "lift" ? "lift" : "warm-up"} exercises yet.
                </Text>
              }
              renderItem={({ item, index }) => (
                <View
                  className="flex-row items-center justify-between px-[18px] py-3.5"
                  style={index < filtered.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#ece7e1" } : undefined}
                >
                  <View className="flex-1 flex-row items-center gap-2.5" style={{ minWidth: 0 }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                      {item.name}
                    </Text>
                    {item.type === "warmup" ? (
                      <View className="rounded-full px-2.5 py-[3px]" style={{ backgroundColor: "#fdf6ee" }}>
                        <Text style={{ fontFamily: fonts.sansBold, color: "#8a5a2e", fontSize: 10.5 }}>warm-up</Text>
                      </View>
                    ) : (
                      <View>
                        <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
                          {item.muscle_group?.map((mg) => mg.replace("_", " ")).join(", ")}
                          {item.movement_pattern?.length
                            ? ` · ${item.movement_pattern.map((mp) => mp.replace("_", " ")).join(", ")}`
                            : ""}
                        </Text>
                        {item.parent_exercise_id ? (
                          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                            ↳ variation of {parentNameById.get(item.parent_exercise_id) ?? "…"}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center gap-4" style={{ flexShrink: 0 }}>
                    {item.video_url ? (
                      <Pressable
                        onPress={() => Linking.openURL(item.video_url)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityLabel={`Watch video for ${item.name}`}
                      >
                        <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 12.5 }}>▸ video</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        setEditing(item);
                        setModalVisible(true);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={`Edit ${item.name}`}
                    >
                      <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 12.5 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleArchive(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={`Archive ${item.name}`}
                    >
                      <Text style={{ fontFamily: fonts.sansSemiBold, color: "#a8a29e", fontSize: 12.5 }}>Archive</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          </View>
        )}

        <ExerciseFormModal
          visible={modalVisible}
          initialExercise={editing}
          initialType={typeFilter}
          allExercises={exercises ?? []}
          onClose={() => setModalVisible(false)}
          onSubmit={handleSubmit}
        />
      </View>
    </CoachShell>
  );
}
