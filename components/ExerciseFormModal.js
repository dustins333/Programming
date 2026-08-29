import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOVEMENT_PATTERNS, isLibraryReviewer } from "../lib/programming/exercises";
import { listExerciseParents, createExerciseParent } from "../lib/programming/exerciseParents";
import { useAuth } from "../lib/auth/AuthProvider";
import { REP_UNITS, DEFAULT_REP_UNIT, repUnitHeader } from "../lib/programming/repUnit";
import { fonts, colors } from "../lib/theme";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";
import { KeyboardDoneButton } from "./KeyboardDoneButton";
import { PressFade } from "./PressFade";
import { MOBILE_BREAKPOINT } from "./CoachShell";
import { Eyebrow } from "./Eyebrow";
import { findLikelyDuplicates } from "../lib/stringSimilarity";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../lib/scrollToKeyboard";
import { MuscleGroupPicker } from "./exercise/MuscleGroupPicker";
import { ParentPicker } from "./exercise/ParentPicker";
import {
  CARD_BORDER,
  INPUT_BORDER,
  CHIP_BORDER,
  SEGMENT_TRACK,
  INK,
  DANGER,
  TAN_BG,
  TAN_BORDER,
  TAN_BORDER_SOFT,
  TAN_TEXT,
} from "./exercise/tokens";

// The exercise form (design_handoff_exercise_library_v1, §3).
//
// Same ten fields it has always had, grouped into four cards in the order a
// coach actually answers them — Identity, Classification, How it's logged,
// Teaching. Before this they ran in one flat vertical list where related
// things sat far apart: Default sets/reps was ABOVE "Measured in", which is
// the field that decides what the reps number even means.
//
// Presentation is chosen by WIDTH, not by platform. Wide gets a 460px right
// drawer so the library stays visible behind it — a coach is usually adding
// an exercise *because* of something they just saw in the table, and the
// same is true of the builders, which open this over a session they're
// mid-way through building. Narrow gets a full-screen page, because 390px
// has no room for ten fields and this used to scroll inside its own 85vh
// box. Width rather than platform because the installed PWA is a phone
// running the web build: keying this to Platform.OS would hand a coach on
// their phone the mobile library and then a desktop drawer to edit from.
//
// Six call sites (both library screens, the review queue, and the three web
// builders) share this, and none of them had to change: every new prop is
// optional.

const LOOKS_LIKE_VIDEO_LINK = /^https?:\/\/.*(youtube\.|youtu\.be|vimeo\.|instagram\.)/i;

function emptyForm(type) {
  return {
    name: "",
    type,
    muscleGroups: [],
    movementPatterns: [],
    parentId: "",
    defaultSets: "",
    defaultReps: "",
    repUnit: DEFAULT_REP_UNIT,
    tracksWeight: true,
    cues: "",
    videoUrl: "",
  };
}

/* ------------------------------------------------------------- form pieces */

function FieldLabel({ children, style }) {
  return <Eyebrow size={10} letterSpacing={1.1} color="#a8a29e" style={style}>{children}</Eyebrow>;
}

// A card is only a card on a narrow screen, where each group is a real white
// panel on the canvas. Inside the 460px drawer the groups read as one
// continuous column, so they're just spacing — a stack of bordered boxes in
// a column that narrow reads as clutter.
function Card({ children, style, wide }) {
  if (wide) return <View style={[{ marginTop: 16 }, style]}>{children}</View>;
  return (
    <View
      style={[
        {
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: CARD_BORDER,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 15,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// The pill-on-a-track control, matching the library's own segmented nav.
function SegmentTabs({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: SEGMENT_TRACK, borderRadius: 10, padding: 3 }}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={String(opt.key)}
            onPress={() => onChange(opt.key)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: active ? "#fff" : "transparent",
              ...(active
                ? { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 }
                : null),
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
              style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: active ? INK : "#78716c" }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Equal bordered tabs — Measured in, Weight. Distinct from SegmentTabs on
// purpose: those switch what the form IS (a lift or a warm-up), these are
// two ordinary fields whose answer happens to be one of three.
// Measured in (3 options) and Weight (2) sit side by side inside a 460px
// drawer, so the longest label in each — "Distance" and "Track weight" —
// is what sizes them. Measured in the browser rather than guessed: at
// 11px/700 those are 51px and 76px, and the geometry below clears both.
function OptionTabs({ options, value, onChange, wide }) {
  return (
    <View style={{ flexDirection: "row", gap: wide ? 6 : 7 }}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={String(opt.key)}
            onPress={() => onChange(opt.key)}
            style={{
              flex: 1,
              alignItems: "center",
              borderWidth: 1,
              borderColor: active ? colors.primary : CHIP_BORDER,
              backgroundColor: active ? TAN_BG : "#fff",
              borderRadius: 9,
              paddingVertical: wide ? 8 : 9,
              paddingHorizontal: wide ? 3 : 4,
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{
                fontFamily: active ? fonts.sansBold : fonts.sansSemiBold,
                fontSize: wide ? 11 : 12.5,
                color: active ? colors.primaryOnWhite : "#57534e",
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Chip({ label, active, onPress, wide }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? colors.primary : CHIP_BORDER,
        backgroundColor: active ? colors.primary : "#fff",
        borderRadius: 99,
        paddingVertical: wide ? 6 : 7,
        paddingHorizontal: wide ? 11 : 12,
      }}
    >
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: active ? "#fff" : INK }}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextField({ inputRef, style, ...rest }) {
  return (
    <TextInput
      ref={inputRef}
      placeholderTextColor={colors.hint}
      style={[
        {
          borderWidth: 1,
          borderColor: INPUT_BORDER,
          borderRadius: 10,
          backgroundColor: "#fff",
          paddingHorizontal: 12,
          fontFamily: fonts.sans,
          fontSize: 13,
          color: INK,
        },
        style,
      ]}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------------- form */

// initialType: which tab ("lift"/"warmup") the coach was on when they hit
// "+ New" — only used for a brand-new exercise; an edit always reflects the
// exercise's own stored type regardless of which tab it was opened from.
// allExercises: the full current library, for the duplicate-name check.
// initialName: pre-fills Name for a brand-new exercise — the builder
// picker's "+ New" hands over whatever was already typed into its search.
// submitLabel: overrides the save button ("Save & insert" when the created
// exercise is going straight into a session).
// onArchive: renders the archive action at the foot of an EDIT. Optional —
// the builders and the review queue don't pass it, so they don't show it.
// backLabel: what native's back link says, e.g. "Library".
export function ExerciseFormModal({
  visible,
  initialExercise,
  initialType = "lift",
  initialName = "",
  submitLabel,
  allExercises = [],
  usage,
  onUseExisting,
  onArchive,
  backLabel = "Back",
  onClose,
  onSubmit,
  onParentsChanged,
}) {
  const [form, setForm] = useState(emptyForm(initialType));
  const [saving, setSaving] = useState(false);
  // Parents are loaded here rather than threaded in from all six call
  // sites — it's ~18 name-only rows, and every one of those hosts would
  // otherwise need its own fetch, its own state and its own refresh after
  // "+ New parent" for a list none of them otherwise care about.
  const [parents, setParents] = useState([]);
  // "Keep both" is a per-open decision, not stored — the pairs a coach
  // wants remembered forever are dismissed on the Merge page, which has a
  // real table behind it.
  const [duplicateAccepted, setDuplicateAccepted] = useState(false);
  // Whether this coach's new entry lands in the review queue. Read here
  // rather than passed in, because all six call sites would otherwise have
  // to thread the same value through for a single line of copy.
  const { profile } = useAuth();
  const goesToReview = !initialExercise && !isLibraryReviewer(profile);
  // True while the muscle group / movement pattern below were filled in
  // from the picked parent rather than typed by the coach. It's what lets
  // switching from one parent to another re-pull the new parent's tags,
  // while never clobbering a set the coach has since edited by hand.
  const [taggedFromParent, setTaggedFromParent] = useState(false);
  const insets = useSafeAreaInsets();
  // Width, not Platform.OS: the installed PWA is a phone running the web
  // build, so a coach there gets the mobile library and must get the mobile
  // form to match. A tablet gets the drawer, which is what it has room for.
  const { width } = useWindowDimensions();
  const wide = width >= MOBILE_BREAKPOINT;

  // Cues and Video sit near the bottom of a dense form and this app has no
  // automatic keyboard avoidance (see lib/scrollToKeyboard.js), so without
  // this there isn't always scrollable room below them to clear the
  // keyboard. A Modal presents above the tab bar entirely, so no
  // tabBarHeight subtraction is needed (unlike a Tabs.Screen).
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
              parentId: initialExercise.parent_id ?? "",
              defaultSets: initialExercise.default_sets != null ? String(initialExercise.default_sets) : "",
              defaultReps: initialExercise.default_reps || "",
              repUnit: initialExercise.rep_unit ?? DEFAULT_REP_UNIT,
              tracksWeight: initialExercise.tracks_weight !== false,
              cues: initialExercise.cues || "",
              videoUrl: initialExercise.video_url || "",
            }
          : { ...emptyForm(initialType), name: initialName || "" }
      );
      setDuplicateAccepted(false);
      setTaggedFromParent(false);
      // Best-effort: a failed load costs the picker its options, not the
      // ability to add the exercise. The field reads "None" and the
      // exercise saves unparented, which is recoverable by editing it.
      listExerciseParents()
        .then(setParents)
        .catch(() => setParents([]));
    }
  }, [visible, initialExercise, initialType, initialName]);

  const isWarmup = form.type === "warmup";
  const videoUrlLooksOff = form.videoUrl && !LOOKS_LIKE_VIDEO_LINK.test(form.videoUrl);
  const noMuscleGroupSelected = !isWarmup && form.muscleGroups.length === 0;
  const likelyDuplicates = findLikelyDuplicates(form.name, allExercises, {
    type: form.type,
    excludeId: initialExercise?.id,
  });
  const duplicate = !duplicateAccepted && likelyDuplicates.length > 0 ? likelyDuplicates[0].exercise : null;
  const canSave = Boolean(form.name.trim()) && !noMuscleGroupSelected;

  // Every parent is offerable — a parent can't be a variation of another
  // parent, so unlike the old exercise-to-exercise version there is no
  // self-reference or nesting to filter out here.
  const parentOptions = parents;

  const handleCreateParent = async (name) => {
    const created = await createExerciseParent({ name, createdBy: profile?.id });
    setParents((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    onParentsChanged?.();
    return created;
  };

  const toggleInArray = (field, value) => {
    setTaggedFromParent(false);
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));
  };

  // Picking a parent pulls its muscle group and movement pattern down, so a
  // variation doesn't have to be re-tagged by hand — a Goblet Squat is a
  // squat hitting the same muscles as the Squat it hangs under, and that's
  // true of nearly every variation. Both stay fully editable below, and
  // anything the coach has already picked is left alone: we only fill a
  // field that's empty, or one we filled ourselves from a previous parent.
  const handleParentChange = (parentId) => {
    const parent = parentOptions.find((ex) => ex.id === parentId);
    if (!parent) {
      // Clearing the parent deliberately leaves the tags in place — wiping
      // a set of muscle groups as a side effect of unlinking would be a
      // surprise, and they're very likely still right.
      setForm((f) => ({ ...f, parentId }));
      return;
    }
    const muscle = parent.muscle_group ?? [];
    const movement = parent.movement_pattern ?? [];
    const takeMuscle = taggedFromParent || form.muscleGroups.length === 0;
    const takeMovement = taggedFromParent || form.movementPatterns.length === 0;
    setForm((f) => ({
      ...f,
      parentId,
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

  const handleArchive = async () => {
    // The host owns the confirm and the usage-count sentence — it's the one
    // that already knows how to count references and how to reload after.
    const archived = await onArchive(initialExercise);
    if (archived) onClose();
  };

  const title = initialExercise ? "Edit exercise" : "New exercise";
  const subtitle = initialExercise
    ? "Changes show everywhere this exercise is used."
    : "Adding to the shared library — every program pulls from it.";
  const saveLabel = saving ? "Saving…" : submitLabel ?? (initialExercise ? "Save changes" : "Add exercise");

  /* ------------------------------------------------------------- the body */

  const body = (
    <>
      {/* 1 — Identity. Type first because it decides which of the cards
          below even exist, then the name, then the live duplicate check
          right underneath the field that triggers it. */}
      <Card wide={wide} style={wide ? { marginTop: 0 } : null}>
        <FieldLabel style={{ marginBottom: 8 }}>Type</FieldLabel>
        <SegmentTabs
          options={[
            { key: "lift", label: "Lift" },
            { key: "warmup", label: "Warm-up" },
          ]}
          value={form.type}
          onChange={(type) => setForm((f) => ({ ...f, type }))}
        />

        <FieldLabel style={{ marginTop: 14, marginBottom: 6 }}>Name</FieldLabel>
        <TextField
          inputRef={nameRef}
          value={form.name}
          onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          onFocus={() => scrollFieldIntoView(nameRef.current)}
          placeholder="e.g. Goblet Squat"
          style={{ height: 42, fontFamily: fonts.sansSemiBold, fontSize: 14 }}
        />
        {duplicate ? (
          <View style={{ marginTop: 9, backgroundColor: TAN_BG, borderWidth: 1, borderColor: TAN_BORDER, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13 }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.primaryOnWhite }}>
              Close to <Text style={{ fontFamily: fonts.sansBold }}>&ldquo;{duplicate.name}&rdquo;</Text>
            </Text>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11, color: TAN_TEXT, marginTop: 2 }}>
              {(() => {
                const uses = usage?.[duplicate.id];
                const usePart = uses == null ? null : uses === 0 ? "never used" : `${uses} use${uses === 1 ? "" : "s"}`;
                return [usePart, duplicate.video_url ? "video linked" : "no video"].filter(Boolean).join(" · ");
              })()}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 }}>
              {onUseExisting ? (
                <PressFade onPress={() => onUseExisting(duplicate)} hitSlop={6}>
                  <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>
                    Use that one
                  </Text>
                </PressFade>
              ) : null}
              <PressFade onPress={() => setDuplicateAccepted(true)} hitSlop={6}>
                <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted }}>
                  Keep both
                </Text>
              </PressFade>
            </View>
          </View>
        ) : null}
      </Card>

      {/* 2 — Classification. Parent leads because picking one fills in the
          two fields under it. */}
      {isWarmup ? null : (
        <Card wide={wide}>
          <FieldLabel style={{ marginBottom: 6 }}>Parent movement · optional</FieldLabel>
          <ParentPicker
            wide={wide}
            value={form.parentId}
            options={parentOptions}
            onChange={handleParentChange}
            onCreate={handleCreateParent}
          />
          {/* Web keeps the hint; the native form drops it (and two other
              explanatory sub-lines) as filler on a small screen. */}
          {wide ? (
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 5 }}>
              Files this under a movement in the builder sidebar.
            </Text>
          ) : null}
          {taggedFromParent ? (
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: TAN_TEXT, marginTop: 7 }}>
              Pulled from {parentOptions.find((ex) => ex.id === form.parentId)?.name ?? "the parent"} — change either below
              if this variation differs.
            </Text>
          ) : null}

          <FieldLabel style={{ marginTop: 16, marginBottom: 6 }}>Muscle group · all that apply</FieldLabel>
          <MuscleGroupPicker selected={form.muscleGroups} onToggle={(value) => toggleInArray("muscleGroups", value)} />
          {/* Only once there's a name to save — an empty form shouldn't
              open with an error on it. */}
          {noMuscleGroupSelected && form.name.trim() ? (
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: DANGER, marginTop: 6 }}>
              Pick at least one muscle group.
            </Text>
          ) : null}

          <FieldLabel style={{ marginTop: 16, marginBottom: 8 }}>Movement pattern · for the balance tally, optional</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            <Chip
              wide={wide}
              label="none"
              active={form.movementPatterns.length === 0}
              onPress={() => {
                setTaggedFromParent(false);
                setForm((f) => ({ ...f, movementPatterns: [] }));
              }}
            />
            {MOVEMENT_PATTERNS.map((mp) => (
              <Chip
                key={mp}
                wide={wide}
                label={mp.replace(/_/g, " ")}
                active={form.movementPatterns.includes(mp)}
                onPress={() => toggleInArray("movementPatterns", mp)}
              />
            ))}
          </View>
        </Card>
      )}

      {/* 3 — How it's logged. "Measured in" sits directly above the
          prescription and renames the reps input, so you say what the
          number is before you type it. */}
      <Card wide={wide}>
        {isWarmup ? null : (
          // Side by side on web, where 460px fits both; stacked on a phone,
          // where three "Measured in" tabs already fill the row.
          <View style={wide ? { flexDirection: "row", gap: 14 } : null}>
            <View style={wide ? { flex: 1 } : { marginBottom: 14 }}>
              <FieldLabel style={{ marginBottom: 8 }}>Measured in</FieldLabel>
              <OptionTabs
                wide={wide}
                options={REP_UNITS.map((u) => ({ key: u.key, label: u.label }))}
                value={form.repUnit ?? DEFAULT_REP_UNIT}
                onChange={(repUnit) => setForm((f) => ({ ...f, repUnit }))}
              />
            </View>
            <View style={wide ? { flex: 1 } : { marginBottom: 14 }}>
              <FieldLabel style={{ marginBottom: 8 }}>Weight</FieldLabel>
              <OptionTabs
                wide={wide}
                options={[
                  { key: true, label: "Track weight" },
                  { key: false, label: "Reps only" },
                ]}
                value={form.tracksWeight}
                onChange={(tracksWeight) => setForm((f) => ({ ...f, tracksWeight }))}
              />
            </View>
          </View>
        )}

        {/* Native's Weight block already carries its own bottom margin. */}
        <FieldLabel style={{ marginTop: isWarmup || !wide ? 0 : 16, marginBottom: 8 }}>Default prescription</FieldLabel>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <View style={{ flex: 1 }}>
            <Text
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, letterSpacing: 0.5, color: "#a8a29e", marginBottom: 4 }}
            >
              SETS
            </Text>
            <TextField
              inputRef={defaultSetsRef}
              value={form.defaultSets}
              onChangeText={(defaultSets) => setForm((f) => ({ ...f, defaultSets }))}
              onFocus={() => scrollFieldIntoView(defaultSetsRef.current)}
              keyboardType="numeric"
              inputAccessoryViewID={NUMERIC_DONE_ID}
              style={{ height: wide ? 38 : 40, borderRadius: 9 }}
            />
          </View>
          <View style={{ flex: 1 }}>
            {/* The reps label follows "Measured in" — REPS / TIME (SEC) /
                DISTANCE (FT). A warm-up has no unit field, so it's reps. */}
            <Text
              maxFontSizeMultiplier={1.1}
              numberOfLines={1}
              style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, letterSpacing: 0.5, color: "#a8a29e", marginBottom: 4 }}
            >
              {isWarmup ? "REPS" : repUnitHeader(form.repUnit ?? DEFAULT_REP_UNIT)}
            </Text>
            <TextField
              inputRef={defaultRepsRef}
              value={form.defaultReps}
              onChangeText={(defaultReps) => setForm((f) => ({ ...f, defaultReps }))}
              onFocus={() => scrollFieldIntoView(defaultRepsRef.current)}
              style={{ height: wide ? 38 : 40, borderRadius: 9 }}
            />
          </View>
        </View>
        {wide ? (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11, color: TAN_TEXT, marginTop: 6 }}>
            Pre-fills when inserted into a {isWarmup ? "warm-up" : "session"} — still editable per session.
          </Text>
        ) : null}
      </Card>

      {/* 4 — Teaching. */}
      <Card wide={wide}>
        <FieldLabel style={{ marginBottom: 6 }}>Cues</FieldLabel>
        <TextField
          inputRef={cuesRef}
          value={form.cues}
          onChangeText={(cues) => setForm((f) => ({ ...f, cues }))}
          onFocus={() => scrollFieldIntoView(cuesRef.current)}
          multiline
          numberOfLines={3}
          inputAccessoryViewID={NUMERIC_DONE_ID}
          placeholder="Short coaching cues, as they'd go on the printed sheet"
          style={{ minHeight: 74, paddingTop: 10, paddingBottom: 10, textAlignVertical: "top", lineHeight: 19 }}
        />

        <FieldLabel style={{ marginTop: 14, marginBottom: 6 }}>Video link · YouTube / Vimeo / Instagram</FieldLabel>
        <TextField
          inputRef={videoUrlRef}
          value={form.videoUrl}
          onChangeText={(videoUrl) => setForm((f) => ({ ...f, videoUrl }))}
          onFocus={() => scrollFieldIntoView(videoUrlRef.current)}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://"
          style={{ height: wide ? 38 : 40, fontSize: 12.5, borderRadius: 9 }}
        />
        {videoUrlLooksOff ? (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 5 }}>
            Doesn't look like a YouTube/Vimeo/Instagram link — that's fine if it's intentional.
          </Text>
        ) : null}
      </Card>

      {/* Said up front, not after the fact: a coach who doesn't know the
          entry gets reviewed can't tell whether "needs review" on it later
          means they did something wrong. */}
      {goesToReview ? (
        <View
          style={{
            backgroundColor: TAN_BG,
            borderWidth: 1,
            borderColor: TAN_BORDER_SOFT,
            borderRadius: 10,
            paddingVertical: 11,
            paddingHorizontal: 13,
            marginTop: wide ? 16 : 2,
            marginBottom: wide ? 0 : 12,
          }}
        >
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.primaryOnWhite, lineHeight: 18 }}>
            This goes into the library straight away — use it in a program right now. A library reviewer will tidy up the
            naming and tagging afterwards.
          </Text>
        </View>
      ) : null}

      {/* Archive lives with the thing being archived, rather than as a link
          in a list row next to Edit. Quiet, red, and last. */}
      {initialExercise && onArchive ? (
        <PressFade onPress={handleArchive} style={{ alignItems: "center", paddingTop: 14, paddingBottom: 2 }}>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: DANGER }}>
            Archive this exercise
          </Text>
        </PressFade>
      ) : null}
    </>
  );

  const footer = (
    <View style={{ flexDirection: "row", gap: 9 }}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          alignItems: "center",
          borderWidth: 1,
          borderColor: CHIP_BORDER,
          borderRadius: 10,
          backgroundColor: "#fff",
          paddingVertical: wide ? 11 : 12,
        }}
      >
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>
          Cancel
        </Text>
      </Pressable>
      <Pressable
        onPress={handleSubmit}
        disabled={saving || !canSave}
        style={{
          flex: 2,
          alignItems: "center",
          borderRadius: 10,
          backgroundColor: colors.primary,
          paddingVertical: wide ? 11 : 12,
          opacity: saving || !canSave ? 0.45 : 1,
        }}
      >
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
          {saveLabel}
        </Text>
      </Pressable>
    </View>
  );

  const scroller = (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: wide ? 22 : 18,
        paddingTop: wide ? 16 : 14,
        paddingBottom: (wide ? 22 : 20) + occludedHeight,
      }}
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
    >
      {body}
    </ScrollView>
  );

  /* ------------------------------------------------------------- the shell */

  if (wide) {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(42,33,28,0.35)" }}
          />
          <View
            style={{
              width: 460,
              maxWidth: "100%",
              backgroundColor: colors.canvas,
              borderLeftWidth: 1,
              borderLeftColor: CARD_BORDER,
              shadowColor: "#2a211c",
              shadowOffset: { width: -16, height: 0 },
              shadowOpacity: 0.18,
              shadowRadius: 40,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                paddingTop: 18,
                paddingBottom: 14,
                paddingHorizontal: 22,
                borderBottomWidth: 1,
                borderBottomColor: CARD_BORDER,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 21, color: colors.primary }}>{title}</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.muted, marginTop: 4 }}>{subtitle}</Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityLabel="Close"
                hitSlop={8}
                style={{ width: 26, height: 26, borderRadius: 99, backgroundColor: SEGMENT_TRACK, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={14} color="#78716c" />
              </Pressable>
            </View>
            {scroller}
            <View style={{ paddingTop: 12, paddingBottom: 16, paddingHorizontal: 22, borderTopWidth: 1, borderTopColor: CARD_BORDER }}>
              {footer}
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        <View style={{ paddingTop: 16, paddingBottom: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
          <PressFade onPress={onClose} hitSlop={10} style={{ alignSelf: "flex-start", paddingVertical: 2 }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
              ‹ {backLabel}
            </Text>
          </PressFade>
          <Text style={{ fontFamily: fonts.display, fontSize: 24, color: INK, marginTop: 5 }}>{title}</Text>
        </View>
        {scroller}
        <View
          style={{
            paddingTop: 12,
            paddingBottom: 12 + insets.bottom,
            paddingHorizontal: 18,
            borderTopWidth: 1,
            borderTopColor: CARD_BORDER,
            backgroundColor: colors.canvas,
          }}
        >
          {footer}
        </View>
      </View>
      {Platform.OS === "web" ? null : <KeyboardDoneButton />}
    </Modal>
  );
}
