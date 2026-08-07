import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, Platform } from "react-native";
import { MUSCLE_GROUPS, MOVEMENT_PATTERNS } from "../lib/programming/exercises";
import { fonts, colors } from "../lib/theme";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";
import { findLikelyDuplicates } from "../lib/stringSimilarity";

const LOOKS_LIKE_VIDEO_LINK = /^https?:\/\/.*(youtube\.|youtu\.be|vimeo\.|instagram\.)/i;

function emptyForm(type) {
  return { name: "", type, muscleGroups: [], movementPatterns: [], parentExerciseId: "", defaultSets: "", defaultReps: "", cues: "", videoUrl: "" };
}

// Single-select against parent-less lift exercises — a variation can't
// itself have variations (enforced here by only ever offering parent-less
// options, not a DB constraint), can't be its own parent, and warm-ups
// don't participate at all.
function ParentExercisePicker({ value, options, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const label = selected ? selected.name : "None (top-level movement)";

  if (Platform.OS === "web") {
    return (
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: "Montserrat_400Regular", borderColor: "#d6d3d1", borderWidth: 1, borderRadius: 8, padding: 12, width: "100%" }}
      >
        <option value="">None (top-level movement)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <Pressable onPress={() => setPickerOpen(true)} className="rounded-lg border border-stone-300 px-4 py-3">
        <Text style={{ fontFamily: "Montserrat_400Regular", color: selected ? "#292524" : "#a8a29e" }}>{label}</Text>
      </Pressable>
      <Modal visible={pickerOpen} animationType="fade" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={() => setPickerOpen(false)}>
          <View className="max-h-[70%] w-full max-w-sm overflow-hidden rounded-2xl bg-white">
            <ScrollView>
              <Pressable
                onPress={() => {
                  onChange("");
                  setPickerOpen(false);
                }}
                className="border-b border-stone-100 px-4 py-3.5"
              >
                <Text style={{ fontFamily: "Montserrat_500Medium" }}>None (top-level movement)</Text>
              </Pressable>
              {options.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => {
                    onChange(o.id);
                    setPickerOpen(false);
                  }}
                  className="border-b border-stone-100 px-4 py-3.5"
                >
                  <Text style={{ fontFamily: o.id === value ? "Montserrat_600SemiBold" : "Montserrat_400Regular" }}>{o.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// initialType: which tab ("lift"/"warmup") the coach was on when they hit
// "+ New Exercise" — only used for a brand-new exercise, an edit always
// reflects the exercise's own stored type regardless of which tab it was
// opened from. allExercises: the full current library, used to build the
// "Variation of" picker's options.
export function ExerciseFormModal({ visible, initialExercise, initialType = "lift", allExercises = [], onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm(initialType));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(
        initialExercise
          ? {
              name: initialExercise.name,
              type: initialExercise.type ?? "lift",
              muscleGroups: initialExercise.muscle_group ?? [],
              movementPatterns: initialExercise.movement_pattern ?? [],
              parentExerciseId: initialExercise.parent_exercise_id ?? "",
              defaultSets: initialExercise.default_sets != null ? String(initialExercise.default_sets) : "",
              defaultReps: initialExercise.default_reps || "",
              cues: initialExercise.cues || "",
              videoUrl: initialExercise.video_url || "",
            }
          : emptyForm(initialType)
      );
    }
  }, [visible, initialExercise, initialType]);

  const isWarmup = form.type === "warmup";
  const videoUrlLooksOff = form.videoUrl && !LOOKS_LIKE_VIDEO_LINK.test(form.videoUrl);
  const noMuscleGroupSelected = !isWarmup && form.muscleGroups.length === 0;
  const likelyDuplicates = findLikelyDuplicates(form.name, allExercises, {
    type: form.type,
    excludeId: initialExercise?.id,
  });

  // Only parent-less lift exercises can be picked as a parent — caps
  // nesting at one level — and an exercise can't be parented to itself.
  const parentOptions = allExercises.filter(
    (ex) => ex.type !== "warmup" && !ex.parent_exercise_id && ex.id !== initialExercise?.id
  );

  const toggleInArray = (field, value) => {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <ScrollView>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 19 }} className="mb-4">
              {initialExercise ? "Edit exercise" : "New exercise"}
            </Text>

            <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
              Type
            </Text>
            <View className="mb-[18px] flex-row gap-2">
              {[
                { key: "lift", label: "Lift" },
                { key: "warmup", label: "Warm-up" },
              ].map((opt) => {
                const active = form.type === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setForm((f) => ({ ...f, type: opt.key }))}
                    className="flex-1 items-center rounded-lg py-2.5"
                    style={{ backgroundColor: active ? colors.primary : "white", borderWidth: active ? 0 : 1, borderColor: "#d9d4cd" }}
                  >
                    <Text style={{ fontFamily: active ? fonts.sansBold : fonts.sansSemiBold, color: active ? "white" : "#57534e", fontSize: 13 }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
              Name
            </Text>
            <TextInput
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              className="rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
            {likelyDuplicates.length > 0 ? (
              <Text className="mb-4 mt-1 text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                Possibly the same as:{" "}
                {likelyDuplicates
                  .slice(0, 2)
                  .map((m) => m.exercise.name)
                  .join(", ")}
              </Text>
            ) : (
              <View className="mb-4" />
            )}

            {isWarmup ? (
              <View className="mb-4 rounded-lg p-3.5" style={{ backgroundColor: "#faf8f6", borderWidth: 1, borderColor: "#ece7e1" }}>
                <Text className="mb-2.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
                  Default sets/reps
                </Text>
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      Sets
                    </Text>
                    <TextInput
                      value={form.defaultSets}
                      onChangeText={(defaultSets) => setForm((f) => ({ ...f, defaultSets }))}
                      keyboardType="numeric"
                      inputAccessoryViewID={NUMERIC_DONE_ID}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2.5"
                      style={{ fontFamily: fonts.sans }}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      Reps
                    </Text>
                    <TextInput
                      value={form.defaultReps}
                      onChangeText={(defaultReps) => setForm((f) => ({ ...f, defaultReps }))}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2.5"
                      style={{ fontFamily: fonts.sans }}
                    />
                  </View>
                </View>
                <Text className="mt-2 text-xs" style={{ fontFamily: fonts.sans, color: "#a8907f" }}>
                  Pre-fills when inserted into a warm-up — coach can still edit per session.
                </Text>
              </View>
            ) : (
              <>
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
                  Muscle group (select all that apply)
                </Text>
                <View className="mb-1 flex-row flex-wrap gap-2">
                  {MUSCLE_GROUPS.map((mg) => {
                    const active = form.muscleGroups.includes(mg);
                    return (
                      <Pressable
                        key={mg}
                        onPress={() => toggleInArray("muscleGroups", mg)}
                        className={`rounded-full border px-3.5 py-2.5 ${active ? "border-primary bg-primary" : "border-stone-300"}`}
                      >
                        <Text className={active ? "text-white" : "text-stone-700"} style={{ fontFamily: "Montserrat_400Regular" }}>
                          {mg.replace("_", " ")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {noMuscleGroupSelected ? (
                  <Text className="mb-4 text-xs" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
                    Pick at least one muscle group.
                  </Text>
                ) : (
                  <View className="mb-4" />
                )}

                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
                  Movement pattern (for the balance tally — optional, select all that apply)
                </Text>
                <View className="mb-4 flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => setForm((f) => ({ ...f, movementPatterns: [] }))}
                    className={`rounded-full border px-3.5 py-2.5 ${
                      form.movementPatterns.length === 0 ? "border-primary bg-primary" : "border-stone-300"
                    }`}
                  >
                    <Text
                      className={form.movementPatterns.length === 0 ? "text-white" : "text-stone-700"}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      none
                    </Text>
                  </Pressable>
                  {MOVEMENT_PATTERNS.map((mp) => {
                    const active = form.movementPatterns.includes(mp);
                    return (
                      <Pressable
                        key={mp}
                        onPress={() => toggleInArray("movementPatterns", mp)}
                        className={`rounded-full border px-3.5 py-2.5 ${active ? "border-primary bg-primary" : "border-stone-300"}`}
                      >
                        <Text className={active ? "text-white" : "text-stone-700"} style={{ fontFamily: "Montserrat_400Regular" }}>
                          {mp.replace("_", " ")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
                  Variation of (optional — groups this under a parent movement in the builder sidebar)
                </Text>
                <View className="mb-4">
                  <ParentExercisePicker
                    value={form.parentExerciseId}
                    options={parentOptions}
                    onChange={(parentExerciseId) => setForm((f) => ({ ...f, parentExerciseId }))}
                  />
                </View>
              </>
            )}

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
              Cues
            </Text>
            <TextInput
              value={form.cues}
              onChangeText={(cues) => setForm((f) => ({ ...f, cues }))}
              multiline
              inputAccessoryViewID={NUMERIC_DONE_ID}
              numberOfLines={3}
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular", textAlignVertical: "top" }}
            />

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
              Video link (YouTube / Vimeo / Instagram)
            </Text>
            <TextInput
              value={form.videoUrl}
              onChangeText={(videoUrl) => setForm((f) => ({ ...f, videoUrl }))}
              autoCapitalize="none"
              keyboardType="url"
              className="mb-1 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
            {videoUrlLooksOff ? (
              <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                Doesn't look like a YouTube/Vimeo/Instagram link — that's fine if it's intentional.
              </Text>
            ) : (
              <View className="mb-4" />
            )}

            <View className="flex-row justify-end gap-3">
              <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
                <Text style={{ fontFamily: "Montserrat_500Medium" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={saving || !form.name || noMuscleGroupSelected}
                className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
              >
                <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  {saving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
