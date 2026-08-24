import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MUSCLE_GROUPS, MUSCLE_SUB_GROUPS, MOVEMENT_PATTERNS, muscleGroupLabel } from "../lib/programming/exercises";
import { fonts, colors } from "../lib/theme";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";
import { KeyboardDoneButton } from "./KeyboardDoneButton";
import { findLikelyDuplicates } from "../lib/stringSimilarity";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../lib/scrollToKeyboard";

const LOOKS_LIKE_VIDEO_LINK = /^https?:\/\/.*(youtube\.|youtu\.be|vimeo\.|instagram\.)/i;

function emptyForm(type) {
  return { name: "", type, muscleGroups: [], movementPatterns: [], parentExerciseId: "", defaultSets: "", defaultReps: "", tracksWeight: true, cues: "", videoUrl: "" };
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

// One collapsed row per top-level group, opening to that group's own
// options. A flat wall of every muscle value would be ~23 chips with no
// structure; this keeps the closed state to eight scannable rows while
// still showing, on each row, what's already picked underneath it.
//
// The first chip in a section is always the top-level group itself, so
// "just chest" stays a valid answer — that's what everything tagged before
// sub-groups existed holds, and it's a legitimate choice for an exercise
// that genuinely doesn't split.
function MuscleGroupPicker({ selected, onToggle }) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggleSection = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <View className="overflow-hidden rounded-xl border" style={{ borderColor: "#e0dcd6" }}>
      {MUSCLE_GROUPS.map((section, i) => {
        const subs = MUSCLE_SUB_GROUPS[section];
        const options = [section, ...subs];
        const picked = options.filter((o) => selected.includes(o));
        const isOpen = expanded.has(section);
        return (
          <View key={section} style={i > 0 ? { borderTopWidth: 1, borderTopColor: "#f0ece6" } : undefined}>
            <Pressable
              onPress={() => toggleSection(section)}
              className="flex-row items-center justify-between px-3 py-2.5"
              accessibilityLabel={`${muscleGroupLabel(section)} options`}
            >
              <View className="flex-1 pr-2">
                <Text
                  className="text-xs uppercase"
                  style={{
                    fontFamily: fonts.sansBold,
                    letterSpacing: 0.4,
                    color: picked.length ? colors.primaryOnWhite : "#78716c",
                  }}
                >
                  {muscleGroupLabel(section)}
                </Text>
                {picked.length ? (
                  <Text numberOfLines={1} className="text-xs" style={{ fontFamily: fonts.sans, color: "#78716c" }}>
                    {picked.map(muscleGroupLabel).join(", ")}
                  </Text>
                ) : null}
              </View>
              <Ionicons name={isOpen ? "chevron-down" : "chevron-forward"} size={16} color="#a8a29e" />
            </Pressable>
            {isOpen ? (
              <View className="flex-row flex-wrap gap-2 px-3 pb-3">
                {options.map((o) => {
                  const active = selected.includes(o);
                  const isSectionItself = o === section;
                  return (
                    <Pressable
                      key={o}
                      onPress={() => onToggle(o)}
                      className={`rounded-full border px-3 py-2 ${active ? "border-primary bg-primary" : "border-stone-300"}`}
                    >
                      <Text
                        className={active ? "text-white" : "text-stone-700"}
                        style={{ fontFamily: fonts.sans, fontSize: 13 }}
                      >
                        {isSectionItself && subs.length > 0
                          ? `${muscleGroupLabel(section)} (general)`
                          : muscleGroupLabel(o)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// initialType: which tab ("lift"/"warmup") the coach was on when they hit
// "+ New Exercise" — only used for a brand-new exercise, an edit always
// reflects the exercise's own stored type regardless of which tab it was
// opened from. allExercises: the full current library, used to build the
// "Variation of" picker's options.
// initialName: pre-fills the Name field for a brand-new exercise — the
// picker's "+ New" hands over whatever the coach had already typed into its
// search box. submitLabel: overrides the save button's text ("Save & insert"
// when the created exercise is going straight into a session).
export function ExerciseFormModal({
  visible,
  initialExercise,
  initialType = "lift",
  initialName = "",
  submitLabel,
  allExercises = [],
  usage,
  onUseExisting,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(emptyForm(initialType));
  const [saving, setSaving] = useState(false);
  // "Keep both" is a per-open decision, not stored — the pairs a coach
  // wants remembered forever are dismissed on the Merge page, which has a
  // real table behind it.
  const [duplicateAccepted, setDuplicateAccepted] = useState(false);
  // True while the muscle group / movement pattern below were filled in
  // from the picked parent rather than typed by the coach. It's what lets
  // switching from one parent to another re-pull the new parent's tags,
  // while never clobbering a set the coach has since edited by hand.
  const [taggedFromParent, setTaggedFromParent] = useState(false);

  // Real risk here: Cues and Video link sit near the bottom of a dense
  // form inside a fixed max-h-[85vh] Modal — no automatic keyboard
  // avoidance in this app (see lib/scrollToKeyboard.js), so without this
  // there's not always enough scrollable room below them to clear the
  // keyboard. A Modal presents above the tab bar entirely, so no
  // tabBarHeight subtraction is needed here (unlike a Tabs.Screen).
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const nameRef = useRef(null);
  const defaultSetsRef = useRef(null);
  const defaultRepsRef = useRef(null);
  const cuesRef = useRef(null);
  const videoUrlRef = useRef(null);
  const keyboardHeight = useKeyboardHeight();
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;

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
              tracksWeight: initialExercise.tracks_weight !== false,
              cues: initialExercise.cues || "",
              videoUrl: initialExercise.video_url || "",
            }
          : { ...emptyForm(initialType), name: initialName || "" }
      );
      setDuplicateAccepted(false);
      setTaggedFromParent(false);
    }
  }, [visible, initialExercise, initialType, initialName]);

  const isWarmup = form.type === "warmup";
  const videoUrlLooksOff = form.videoUrl && !LOOKS_LIKE_VIDEO_LINK.test(form.videoUrl);
  const noMuscleGroupSelected = !isWarmup && form.muscleGroups.length === 0;
  const likelyDuplicates = findLikelyDuplicates(form.name, allExercises, {
    type: form.type,
    excludeId: initialExercise?.id,
  });

  // Only parent-less lift exercises can be picked as a parent — caps
  // nesting at one level — and an exercise can't be parented to itself.
  // Archived exercises are excluded too: the Exercise Library page loads
  // with includeArchived so its own "Show archived" toggle has something to
  // show, and that same full list is what gets handed here, so without this
  // filter every retired movement showed up as a pickable parent.
  const parentOptions = allExercises.filter(
    (ex) => ex.type !== "warmup" && !ex.parent_exercise_id && ex.is_active !== false && ex.id !== initialExercise?.id
  );

  const toggleInArray = (field, value) => {
    setTaggedFromParent(false);
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));
  };

  // Picking a parent pulls its muscle group and movement pattern down, so
  // a variation doesn't have to be re-tagged by hand — a Goblet Squat is
  // a squat hitting the same muscles as the Squat it hangs under, and
  // that's true of nearly every variation. Both stay fully editable
  // below, and anything the coach has already picked is left alone: we
  // only fill a field that's empty, or one we filled ourselves from a
  // previously-picked parent.
  const handleParentChange = (parentExerciseId) => {
    const parent = parentOptions.find((ex) => ex.id === parentExerciseId);
    if (!parent) {
      // Clearing the parent deliberately leaves the tags in place —
      // wiping a set of muscle groups as a side effect of unlinking would
      // be a surprise, and they're very likely still right.
      setForm((f) => ({ ...f, parentExerciseId }));
      return;
    }
    const muscle = parent.muscle_group ?? [];
    const movement = parent.movement_pattern ?? [];
    const takeMuscle = taggedFromParent || form.muscleGroups.length === 0;
    const takeMovement = taggedFromParent || form.movementPatterns.length === 0;
    setForm((f) => ({
      ...f,
      parentExerciseId,
      muscleGroups: takeMuscle ? [...muscle] : f.muscleGroups,
      movementPatterns: takeMovement ? [...movement] : f.movementPatterns,
    }));
    if ((takeMuscle && muscle.length > 0) || (takeMovement && movement.length > 0)) {
      setTaggedFromParent(true);
    }
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
          {/* Sibling of the ScrollView, not inside it, so it stays pinned to
              the card corner instead of scrolling away with the form. The
              Cancel button at the bottom does the same thing — this is the
              close affordance you expect to find without scrolling. */}
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 10,
              padding: 4,
              // Opaque backdrop so it never reads as sitting on top of the
              // form's own scrollbar/content behind it.
              backgroundColor: "white",
              borderRadius: 999,
            }}
          >
            <Ionicons name="close" size={22} color="#a8a29e" />
          </Pressable>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ paddingBottom: occludedHeight }}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
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
              ref={nameRef}
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              onFocus={() => scrollFieldIntoView(nameRef.current)}
              className="rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
            {/* Live duplicate check, right under the name field rather
                than after you submit (design_handoff_coach_web_v2, 1p).
                It's actionable now: the old version listed the near-match
                as grey text, which told you about the problem without
                giving you either way out of it. */}
            {likelyDuplicates.length > 0 && !duplicateAccepted ? (
              <View
                className="mb-4 mt-1 rounded-xl p-3.5"
                style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#eddcd2" }}
              >
                <Text className="text-xs" style={{ fontFamily: fonts.sans, color: "#8a5140" }}>
                  Close to{" "}
                  <Text style={{ fontFamily: fonts.sansBold }}>&ldquo;{likelyDuplicates[0].exercise.name}&rdquo;</Text>
                </Text>
                <Text className="mt-0.5 text-xs" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                  {(() => {
                    const match = likelyDuplicates[0].exercise;
                    const uses = usage?.[match.id];
                    const usePart = uses == null ? null : uses === 0 ? "never used" : `${uses} use${uses === 1 ? "" : "s"}`;
                    return [usePart, match.video_url ? "video linked" : "no video"].filter(Boolean).join(" · ");
                  })()}
                </Text>
                <View className="mt-2.5 flex-row items-center gap-4">
                  {onUseExisting ? (
                    <Pressable
                      onPress={() => onUseExisting(likelyDuplicates[0].exercise)}
                    >
                      <Text className="text-xs" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
                        Use that one
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => setDuplicateAccepted(true)}>
                    <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: "#78716c" }}>
                      Keep both
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="mb-4" />
            )}

            {isWarmup ? null : (
              <>
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
                  Variation of (optional — groups this under a parent movement in the builder sidebar)
                </Text>
                <View className="mb-4">
                  <ParentExercisePicker
                    value={form.parentExerciseId}
                    options={parentOptions}
                    onChange={handleParentChange}
                  />
                </View>
                {taggedFromParent ? (
                  <Text className="-mt-3 mb-4 text-xs" style={{ fontFamily: fonts.sans, color: "#a8907f" }}>
                    Muscle group and movement pattern pulled from{" "}
                    {parentOptions.find((ex) => ex.id === form.parentExerciseId)?.name ?? "the parent"} — change either below if
                    this variation differs.
                  </Text>
                ) : null}
              </>
            )}

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
                    ref={defaultSetsRef}
                    value={form.defaultSets}
                    onChangeText={(defaultSets) => setForm((f) => ({ ...f, defaultSets }))}
                    onFocus={() => scrollFieldIntoView(defaultSetsRef.current)}
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
                    ref={defaultRepsRef}
                    value={form.defaultReps}
                    onChangeText={(defaultReps) => setForm((f) => ({ ...f, defaultReps }))}
                    onFocus={() => scrollFieldIntoView(defaultRepsRef.current)}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-2.5"
                    style={{ fontFamily: fonts.sans }}
                  />
                </View>
              </View>
              <Text className="mt-2 text-xs" style={{ fontFamily: fonts.sans, color: "#a8907f" }}>
                Pre-fills when inserted into a {isWarmup ? "warm-up" : "session"} — coach can still edit per session.
              </Text>
            </View>

            {isWarmup ? null : (
              <>
                <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
                  Weight
                </Text>
                <View className="mb-1 flex-row gap-2">
                  {[
                    { key: true, label: "Track weight" },
                    { key: false, label: "Reps only" },
                  ].map((opt) => {
                    const active = form.tracksWeight === opt.key;
                    return (
                      <Pressable
                        key={String(opt.key)}
                        onPress={() => setForm((f) => ({ ...f, tracksWeight: opt.key }))}
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
                <Text className="mb-4 text-xs" style={{ fontFamily: fonts.sans, color: "#a8907f" }}>
                  {form.tracksWeight
                    ? "The member logs reps and weight for every set."
                    : "For lifts with nothing to load — an inverted row, a push-up, a plank. The member logs reps only, with no weight box, and this lift is left out of personal records."}
                </Text>

                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
                  Muscle group (select all that apply)
                </Text>
                <View className="mb-1">
                  <MuscleGroupPicker
                    selected={form.muscleGroups}
                    onToggle={(value) => toggleInArray("muscleGroups", value)}
                  />
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
                    onPress={() => {
                      setTaggedFromParent(false);
                      setForm((f) => ({ ...f, movementPatterns: [] }));
                    }}
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
              </>
            )}


            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
              Cues
            </Text>
            <TextInput
              ref={cuesRef}
              value={form.cues}
              onChangeText={(cues) => setForm((f) => ({ ...f, cues }))}
              onFocus={() => scrollFieldIntoView(cuesRef.current)}
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
              ref={videoUrlRef}
              value={form.videoUrl}
              onChangeText={(videoUrl) => setForm((f) => ({ ...f, videoUrl }))}
              onFocus={() => scrollFieldIntoView(videoUrlRef.current)}
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
                disabled={saving || !form.name || noMuscleGroupSelected} style={{ opacity: saving || !form.name || noMuscleGroupSelected ? 0.5 : 1 }}
                className="rounded-lg bg-primary px-4 py-3"
              >
                <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  {saving ? "Saving…" : submitLabel ?? "Save"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
      <KeyboardDoneButton />
    </Modal>
  );
}
