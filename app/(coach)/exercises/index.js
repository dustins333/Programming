import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Linking, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  listExercises,
  createExercise,
  isLibraryReviewer,
  updateExercise,
  setExerciseActive,
  getExerciseUsageCount,
  MUSCLE_GROUPS,
  parentMuscleGroup,
  muscleGroupLabel,
} from "../../../lib/programming/exercises";
import { listExerciseParents } from "../../../lib/programming/exerciseParents";
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";
import { confirmArchiveExercise } from "../../../lib/confirmDialog";

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };

export default function Exercises() {
  const { profile } = useAuth();
  const router = useRouter();
  const [exercises, setExercises] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("lift");
  const [muscleFilter, setMuscleFilter] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [archivingId, setArchivingId] = useState(null);
  const [parents, setParents] = useState([]);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await listExercises({ includeArchived: true });
      setExercises(data);
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    // Isolated: parents only supply the "↳ under X" line, so a failed
    // load costs that line rather than the whole library.
    try {
      setParents(await listExerciseParents());
    } catch {
      setParents([]);
    }
  }, []);

  // Tab root, kept mounted across tab switches on native — refetch on
  // every focus so an edit made a moment ago (e.g. from the form modal on
  // this same screen reloading, or a future cross-screen edit) is current.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Parent names come off the parent records (0095), not off other
  // exercises — a parent is no longer an exercise, so this can't be
  // resolved from the library list any more.
  const parentNameById = useMemo(() => new Map(parents.map((p) => [p.id, p.name])), [parents]);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    return exercises.filter((ex) => {
      if (showArchived ? ex.is_active : !ex.is_active) return false;
      if ((ex.type ?? "lift") !== typeFilter) return false;
      // Matched through parentMuscleGroup, not a bare includes — the chips
      // are the eight top-level groups, so "Back" has to also catch an
      // exercise tagged only "lats".
      if (
        typeFilter === "lift" &&
        muscleFilter &&
        !ex.muscle_group?.some((mg) => parentMuscleGroup(mg) === muscleFilter)
      )
        return false;
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [exercises, search, typeFilter, muscleFilter, showArchived]);

  const handleSubmit = async (form) => {
    try {
      if (editing) {
        await updateExercise(editing.id, form);
      } else {
        await createExercise({ ...form, createdBy: profile.id, approved: isLibraryReviewer(profile) });
      }
      await load();
    } catch (err) {
      toastError("Failed to save exercise", err);
      throw err;
    }
  };

  const handleArchive = async (exercise) => {
    setArchivingId(exercise.id);
    let usageNote;
    try {
      const count = await getExerciseUsageCount(exercise.id);
      if (count > 0) {
        usageNote = `It's currently used in ${count} place${count === 1 ? "" : "s"} across your programming (sessions, warm-ups, and/or templates) — archiving will blank its name out of any live session that still references it.`;
      }
    } catch {
      // Usage count is a courtesy, not a gate — if it fails to load, fall
      // back to the plain confirm rather than blocking the archive entirely.
    } finally {
      setArchivingId(null);
    }
    const proceed = await confirmArchiveExercise(exercise.name, usageNote);
    if (!proceed) return;
    try {
      await setExerciseActive(exercise.id, false);
      await load();
    } catch (err) {
      toastError("Failed to archive", err);
    }
  };

  const handleUnarchive = async (exercise) => {
    try {
      await setExerciseActive(exercise.id, true);
      await load();
    } catch (err) {
      toastError("Failed to un-archive", err);
    }
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerStyle={{ padding: 40 }}>
        {Platform.OS !== "web" ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))}
            className="mb-4 self-start"
          >
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
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

        <View className="mb-3.5 flex-row items-center gap-3">
          <View className="flex-row overflow-hidden self-start rounded-full" style={{ borderWidth: 1, borderColor: colors.primary }}>
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

          <Pressable
            onPress={() => setShowArchived((v) => !v)}
            className="rounded-full px-4 py-2"
            style={{ backgroundColor: showArchived ? "#f1efed" : "transparent", borderWidth: 1, borderColor: showArchived ? "#d9d4cd" : "transparent" }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, color: showArchived ? "#57534e" : "#a8a29e", fontSize: 12.5 }}>
              {showArchived ? "Showing archived" : "Show archived"}
            </Text>
          </Pressable>
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
                    {muscleGroupLabel(mg)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {loadError ? (
          <View className="items-start">
            <Text className="mb-2 text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load exercises: {loadError}
            </Text>
            <Pressable onPress={load}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </Pressable>
          </View>
        ) : !exercises ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View className="rounded-2xl border bg-white" style={[{ borderColor: "#ece7e1", maxWidth: 900, overflow: "hidden" }, CARD_SHADOW]}>
            {filtered.length === 0 ? (
              <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
                {showArchived
                  ? `No archived ${typeFilter === "lift" ? "lift" : "warm-up"} exercises.`
                  : `No ${typeFilter === "lift" ? "lift" : "warm-up"} exercises yet.`}
              </Text>
            ) : (
              filtered.map((item, index) => (
                <View
                  key={item.id}
                  className="flex-row items-center justify-between px-[18px] py-3.5"
                  style={index < filtered.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#ece7e1" } : undefined}
                >
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <View className="flex-row items-center gap-2.5">
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                        {item.name}
                      </Text>
                      {item.type === "warmup" ? (
                        <View className="rounded-full px-2.5 py-[3px]" style={{ backgroundColor: "#fdf6ee" }}>
                          <Text style={{ fontFamily: fonts.sansBold, color: "#8a5a2e", fontSize: 10.5 }}>warm-up</Text>
                        </View>
                      ) : (
                        <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
                          {item.muscle_group?.map(muscleGroupLabel).join(", ")}
                          {item.movement_pattern?.length
                            ? ` · ${item.movement_pattern.map((mp) => mp.replace("_", " ")).join(", ")}`
                            : ""}
                        </Text>
                      )}
                      {/* Not a warning — a pending entry is fully usable in
                          a program, it just hasn't been past a reviewer
                          yet. Tan, matching the review queue's own tone. */}
                      {!item.approved_at ? (
                        <View className="rounded-full px-2.5 py-[3px]" style={{ backgroundColor: "#f5ede4" }}>
                          <Text style={{ fontFamily: fonts.sansBold, color: "#8a5140", fontSize: 10.5 }}>needs review</Text>
                        </View>
                      ) : null}
                      {/* Nothing distinguishes a bodyweight lift from a
                          loaded one at a glance otherwise — a coach would
                          have to open each to find out. */}
                      {item.type !== "warmup" && item.tracks_weight === false ? (
                        <View className="rounded-full px-2.5 py-[3px]" style={{ backgroundColor: "#eef1e7" }}>
                          <Text style={{ fontFamily: fonts.sansBold, color: "#4d6142", fontSize: 10.5 }}>reps only</Text>
                        </View>
                      ) : null}
                    </View>
                    {item.type !== "warmup" && item.parent_id ? (
                      <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                        ↳ under {parentNameById.get(item.parent_id) ?? "…"}
                      </Text>
                    ) : null}
                    {item.cues ? (
                      <Text
                        style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2, fontStyle: "italic" }}
                        numberOfLines={2}
                      >
                        {item.cues}
                      </Text>
                    ) : null}
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
                    {showArchived ? (
                      <Pressable
                        onPress={() => handleUnarchive(item)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityLabel={`Un-archive ${item.name}`}
                      >
                        <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 12.5 }}>Un-archive</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => handleArchive(item)}
                        disabled={archivingId === item.id}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityLabel={`Archive ${item.name}`}
                      >
                        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#a8a29e", fontSize: 12.5 }}>
                          {archivingId === item.id ? "Checking…" : "Archive"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <ExerciseFormModal
          // A "+ New parent" from inside the form has to reach the
          // "↳ under X" line on this list, which reads off this screen's
          // own parents state.
          onParentsChanged={() => listExerciseParents().then(setParents).catch(() => {})}
          visible={modalVisible}
          initialExercise={editing}
          initialType={typeFilter}
          allExercises={exercises ?? []}
          // "Use that one" abandons the new exercise and reopens the form
          // on the existing one — previously this affordance rendered only
          // if a caller passed the handler, and none did, so a coach warned
          // about a duplicate could only keep both or cancel.
          onUseExisting={(match) => setEditing(match)}
          onClose={() => setModalVisible(false)}
          onSubmit={handleSubmit}
        />
      </ScrollView>
    </CoachShell>
  );
}
