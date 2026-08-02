import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { MUSCLE_GROUPS, MOVEMENT_PATTERNS } from "../lib/programming/exercises";
import { fonts, colors } from "../lib/theme";

const LOOKS_LIKE_VIDEO_LINK = /^https?:\/\/.*(youtube\.|youtu\.be|vimeo\.|instagram\.)/i;

function emptyForm(type) {
  return { name: "", type, muscleGroup: MUSCLE_GROUPS[0], movementPattern: "", defaultSets: "", defaultReps: "", cues: "", videoUrl: "" };
}

// initialType: which tab ("lift"/"warmup") the coach was on when they hit
// "+ New Exercise" — only used for a brand-new exercise, an edit always
// reflects the exercise's own stored type regardless of which tab it was
// opened from.
export function ExerciseFormModal({ visible, initialExercise, initialType = "lift", onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm(initialType));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(
        initialExercise
          ? {
              name: initialExercise.name,
              type: initialExercise.type ?? "lift",
              muscleGroup: initialExercise.muscle_group ?? MUSCLE_GROUPS[0],
              movementPattern: initialExercise.movement_pattern || "",
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
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />

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
                  Muscle group
                </Text>
                <View className="mb-4 flex-row flex-wrap gap-2">
                  {MUSCLE_GROUPS.map((mg) => (
                    <Pressable
                      key={mg}
                      onPress={() => setForm((f) => ({ ...f, muscleGroup: mg }))}
                      className={`rounded-full border px-3.5 py-2.5 ${
                        form.muscleGroup === mg ? "border-primary bg-primary" : "border-stone-300"
                      }`}
                    >
                      <Text
                        className={form.muscleGroup === mg ? "text-white" : "text-stone-700"}
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {mg.replace("_", " ")}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
                  Movement pattern (for the balance tally — optional)
                </Text>
                <View className="mb-4 flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => setForm((f) => ({ ...f, movementPattern: "" }))}
                    className={`rounded-full border px-3.5 py-2.5 ${
                      !form.movementPattern ? "border-primary bg-primary" : "border-stone-300"
                    }`}
                  >
                    <Text
                      className={!form.movementPattern ? "text-white" : "text-stone-700"}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      none
                    </Text>
                  </Pressable>
                  {MOVEMENT_PATTERNS.map((mp) => (
                    <Pressable
                      key={mp}
                      onPress={() => setForm((f) => ({ ...f, movementPattern: mp }))}
                      className={`rounded-full border px-3.5 py-2.5 ${
                        form.movementPattern === mp ? "border-primary bg-primary" : "border-stone-300"
                      }`}
                    >
                      <Text
                        className={form.movementPattern === mp ? "text-white" : "text-stone-700"}
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {mp.replace("_", " ")}
                      </Text>
                    </Pressable>
                  ))}
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
                disabled={saving || !form.name}
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
