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

export default function Exercises() {
  const { profile } = useAuth();
  const [exercises, setExercises] = useState(null);
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    if (!exercises) return [];
    return exercises.filter((ex) => {
      if (muscleFilter && ex.muscle_group !== muscleFilter) return false;
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [exercises, search, muscleFilter]);

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
    <View className="flex-1 bg-white px-6 py-8" style={{ maxWidth: 900 }}>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
          Exercise Library
        </Text>
        <Pressable
          onPress={() => {
            setEditing(null);
            setModalVisible(true);
          }}
          className="rounded-lg bg-primary px-4 py-2.5"
        >
          <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            + New Exercise
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises…"
        className="mb-3 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: "Montserrat_400Regular" }}
      />

      <View className="mb-4 flex-row flex-wrap gap-2">
        <Pressable
          onPress={() => setMuscleFilter(null)}
          className={`rounded-full border px-3.5 py-2.5 ${!muscleFilter ? "border-primary bg-primary" : "border-stone-300"}`}
        >
          <Text className={!muscleFilter ? "text-white" : "text-stone-700"} style={{ fontFamily: "Montserrat_400Regular" }}>
            all
          </Text>
        </Pressable>
        {MUSCLE_GROUPS.map((mg) => (
          <Pressable
            key={mg}
            onPress={() => setMuscleFilter(mg)}
            className={`rounded-full border px-3.5 py-2.5 ${muscleFilter === mg ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text
              className={muscleFilter === mg ? "text-white" : "text-stone-700"}
              style={{ fontFamily: "Montserrat_400Regular" }}
            >
              {mg.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </View>

      {!exercises ? (
        <ActivityIndicator color="#a46a57" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text className="text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
              No exercises yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3">
              <View className="flex-1">
                <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.name}</Text>
                <Text className="text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                  {item.muscle_group.replace("_", " ")}
                  {item.movement_pattern ? ` · ${item.movement_pattern.replace("_", " ")}` : ""}
                </Text>
              </View>
              {item.video_url ? (
                <Pressable
                  onPress={() => Linking.openURL(item.video_url)}
                  className="mr-3"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={`Watch video for ${item.name}`}
                >
                  <Text style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>▶ video</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setEditing(item);
                  setModalVisible(true);
                }}
                className="mr-3"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={`Edit ${item.name}`}
              >
                <Text style={{ fontFamily: "Montserrat_500Medium", color: "#8a5140" }}>Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => handleArchive(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={`Archive ${item.name}`}
              >
                <Text className="text-stone-400" style={{ fontFamily: "Montserrat_400Regular" }}>
                  Archive
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <ExerciseFormModal
        visible={modalVisible}
        initialExercise={editing}
        onClose={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
    </View>
    </CoachShell>
  );
}
