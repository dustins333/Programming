import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Linking, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  listExercises,
  listExerciseUsageCounts,
  createExercise,
  isLibraryReviewer,
  updateExercise,
  setExerciseActive,
  getExerciseUsageCount,
  MOVEMENT_PATTERNS,
  MUSCLE_GROUPS,
  parentMuscleGroup,
  muscleGroupLabel,
} from "../../../lib/programming/exercises";
import { findDuplicateCandidates, listMergeDismissals, pairKey } from "../../../lib/programming/exerciseMerge";
import { listExerciseParents } from "../../../lib/programming/exerciseParents";
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { ExerciseLibraryMobile } from "../../../components/coach/ExerciseLibraryMobile";
import { CoachShell, MOBILE_BREAKPOINT } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { Eyebrow } from "../../../components/Eyebrow";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";
import { confirmArchiveExercise } from "../../../lib/confirmDialog";
import {
  CARD_BORDER,
  ROW_RULE,
  INPUT_BORDER,
  SEGMENT_TRACK,
  ESPRESSO,
  ESPRESSO_TEXT,
  INK,
  TAN_BG,
  TAN_BORDER,
  BADGE_REVIEW,
  BADGE_DUPLICATE,
  BADGE_REPS_ONLY,
  VIDEO_LINKED,
  VIDEO_MISSING,
  VIDEO_NONE,
} from "../../../components/exercise/tokens";

// Exercise Library, coach web (design_handoff_exercise_library_v1).
//
// A library is only as good as the moment you're searching it mid-build, so
// this page is built around the two things that make that search bad:
// near-duplicate entries and missing videos. Usage counts say what's real;
// the video column shows a gap you'd otherwise find out about when a member
// asks. The duplicate banner is only a doorway — merging is its own page.
//
// The v1 handoff split what used to be one flex-wrap row of ~20 chips into
// three controls with three different jobs, because they were never the same
// kind of thing: the segmented control is the VIEW you're in, the two
// dropdowns NARROW it, and the attention toggles are curation states worth
// acting on. On a 1040px column that chip row wrapped to three lines and the
// table started below the fold.
//
// Deliberately NOT shown: the mock has an EQUIPMENT column, and there is no
// equipment field on programming.exercises. Rendering an empty column for
// every entry would be worse than leaving it out; adding one is a real
// feature (migration + form field + tagging the library), not a design pass.

const CANVAS = colors.canvas;
const COLS = { name: 2.6, pattern: 1.1, used: 0.7, video: 0.8, actions: 0.6 };

/* ----------------------------------------------------------------- pieces */

// The view you're in — Lifts / Warm-ups / Archived. Not a filter: each is a
// different population, and only one can be true at a time.
function SegmentTabs({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: SEGMENT_TRACK, borderRadius: 10, padding: 3 }}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={{
              alignItems: "center",
              paddingVertical: 7,
              paddingHorizontal: 16,
              borderRadius: 8,
              backgroundColor: active ? "#fff" : "transparent",
              ...(active
                ? { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 }
                : null),
            }}
          >
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: active ? INK : "#78716c" }}>
              {opt.label} · {opt.count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A counted dropdown. Options with a zero count are never passed in, same as
// the chips they replace — an option that can only ever show an empty table
// is noise.
function Dropdown({ label, allLabel, options, value, onChange, open, onToggle }) {
  const activeOption = options.find((o) => o.key === value);
  return (
    <View style={{ position: "relative", zIndex: open ? 20 : 1 }}>
      <PressFade
        onPress={onToggle}
        accessibilityLabel={label}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          height: 36,
          paddingHorizontal: 13,
          borderWidth: 1,
          borderColor: value ? colors.primary : INPUT_BORDER,
          borderRadius: 9,
          backgroundColor: value ? TAN_BG : "#fff",
        }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: value ? colors.primaryOnWhite : "#44403c" }}>
          {activeOption ? activeOption.label : allLabel}
        </Text>
        <Text style={{ fontSize: 10, color: "#a8a29e" }}>▾</Text>
      </PressFade>
      {open ? (
        <View
          style={{
            position: "absolute",
            top: 40,
            left: 0,
            zIndex: 30,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: INPUT_BORDER,
            borderRadius: 10,
            padding: 6,
            minWidth: 210,
            shadowColor: "#2a211c",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.14,
            shadowRadius: 28,
          }}
        >
          <PressFade
            onPress={() => onChange(null)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 7, backgroundColor: value ? "transparent" : TAN_BG }}
          >
            <Text style={{ flex: 1, fontFamily: value ? fonts.sans : fonts.sansBold, fontSize: 12.5, color: INK }}>{allLabel}</Text>
          </PressFade>
          {options.map((o) => {
            const active = o.key === value;
            return (
              <PressFade
                key={o.key}
                onPress={() => onChange(active ? null : o.key)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 7, backgroundColor: active ? TAN_BG : "transparent" }}
              >
                <Text style={{ flex: 1, fontFamily: active ? fonts.sansBold : fonts.sans, fontSize: 12.5, color: INK }}>{o.label}</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{o.count}</Text>
              </PressFade>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function AttentionToggle({ label, count, active, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? ESPRESSO : TAN_BORDER,
        backgroundColor: active ? ESPRESSO : "#fff",
        borderRadius: 99,
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: active ? ESPRESSO_TEXT : colors.primaryOnWhite }}>
        {label} <Text style={{ fontFamily: fonts.sansBold }}>{count}</Text>
      </Text>
    </PressFade>
  );
}

// Three equal cards in a row, replacing three stacked full-width banners.
// The sub-lines are gone: the title already carries the number and the CTA
// already says where it goes.
function Doorway({ title, cta, tone, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: tone === "tan" ? TAN_BG : "#fff",
        borderWidth: 1,
        borderColor: tone === "tan" ? TAN_BORDER : CARD_BORDER,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 15,
        gap: 8,
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK, lineHeight: 18 }}>{title}</Text>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>{cta} →</Text>
    </PressFade>
  );
}

function HeaderRow() {
  const cell = (key, label, align = "left") => (
    <View key={key} style={{ flex: COLS[key], alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <Eyebrow size={10} letterSpacing={1.1} color="#a8a29e">
        {label}
      </Eyebrow>
    </View>
  );
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: CARD_BORDER,
      }}
    >
      {cell("name", "EXERCISE")}
      {cell("pattern", "PATTERN")}
      {cell("used", "USED", "right")}
      {cell("video", "VIDEO", "right")}
      <View style={{ flex: COLS.actions }} />
    </View>
  );
}

function Badge({ tone, children }) {
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.5, color: tone.text }}>{children}</Text>
    </View>
  );
}

function Row({ exercise, uses, duplicate, parentName, onEdit, onArchive, onUnarchive, archiving, first }) {
  const patterns = exercise.movement_pattern ?? [];
  const muscles = exercise.muscle_group ?? [];
  const isWarmup = (exercise.type ?? "lift") === "warmup";
  const hasVideo = Boolean(exercise.video_url);
  // Pending is not a warning — the entry is fully usable, it just hasn't
  // been through a reviewer yet. Tan, not red.
  const pending = !exercise.approved_at;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: ROW_RULE,
      }}
    >
      <View style={{ flex: COLS.name, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* nowrap with no ellipsis: at this width the longest name in the
              library is comfortable. If names grow past it, add
              overflow/text-overflow back to this span only. */}
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: INK }} numberOfLines={1}>
            {exercise.name}
          </Text>
          {pending ? <Badge tone={BADGE_REVIEW}>NEEDS REVIEW</Badge> : null}
          {duplicate ? <Badge tone={BADGE_DUPLICATE}>DUPLICATE?</Badge> : null}
          {/* Nothing distinguishes a bodyweight lift from a loaded one at a
              glance otherwise — a coach would have to open each to find out. */}
          {!isWarmup && exercise.tracks_weight === false ? <Badge tone={BADGE_REPS_ONLY}>REPS ONLY</Badge> : null}
        </View>
        {parentName ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 2 }}>↳ under {parentName}</Text>
        ) : exercise.cues ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 2 }} numberOfLines={1}>
            {exercise.cues}
          </Text>
        ) : null}
      </View>

      <View style={{ flex: COLS.pattern, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.6, color: "#a8a29e" }} numberOfLines={1}>
          {isWarmup ? "WARM-UP" : (patterns[0] ?? muscles.map(muscleGroupLabel)[0] ?? "—").toString().replace(/_/g, " ").toUpperCase()}
        </Text>
      </View>

      <View style={{ flex: COLS.used, alignItems: "flex-end" }}>
        <Text style={{ fontFamily: uses === 0 ? fonts.sans : fonts.sansSemiBold, fontSize: 12.5, color: uses === 0 ? VIDEO_NONE : "#44403c" }}>
          {uses === 0 ? "never" : `${uses}×`}
        </Text>
      </View>

      <View style={{ flex: COLS.video, alignItems: "flex-end" }}>
        {hasVideo ? (
          <Pressable onPress={() => Linking.openURL(exercise.video_url)}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: VIDEO_LINKED }}>Linked</Text>
          </Pressable>
        ) : (
          // A missing video only matters for something somebody is actually
          // programming; an unused entry reads as "None", in plain grey.
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: uses > 0 ? VIDEO_MISSING : VIDEO_NONE }}>
            {uses > 0 ? "Missing" : "None"}
          </Text>
        )}
      </View>

      <View style={{ flex: COLS.actions, flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
        <Pressable onPress={() => onEdit(exercise)}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>Edit</Text>
        </Pressable>
        {exercise.is_active === false ? (
          <Pressable onPress={() => onUnarchive(exercise)}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: VIDEO_LINKED }}>Restore</Text>
          </Pressable>
        ) : (
          <Pressable onPress={archiving ? undefined : () => onArchive(exercise)}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>{archiving ? "…" : "Archive"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- screen */

function ExercisesDesktop() {
  const { profile } = useAuth();
  const router = useRouter();

  const [exercises, setExercises] = useState(null);
  const [usage, setUsage] = useState({});
  const [dismissals, setDismissals] = useState([]);
  const [search, setSearch] = useState("");
  // seg is the view; pattern/muscle narrow it; flag is single-select, so
  // picking one attention state replaces another rather than compounding
  // into a filter nobody can read back off the screen.
  const [seg, setSeg] = useState("lift");
  const [pattern, setPattern] = useState(null);
  const [muscle, setMuscle] = useState(null);
  const [flag, setFlag] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [archivingId, setArchivingId] = useState(null);
  const [parents, setParents] = useState([]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [rows, counts, parentRows] = await Promise.all([
        listExercises({ includeArchived: true }),
        listExerciseUsageCounts().catch(() => ({})),
        listExerciseParents().catch(() => []),
      ]);
      setExercises(rows);
      setUsage(counts);
      setParents(parentRows);
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    try {
      setDismissals(await listMergeDismissals());
    } catch {
      setDismissals([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Parent names come off the parent records (0095), not off other
  // exercises — a parent is no longer an exercise, so this can't be
  // resolved from the library list any more.
  const parentNameById = useMemo(() => new Map(parents.map((p) => [p.id, p.name])), [parents]);

  const dismissedKeys = useMemo(
    () => new Set(dismissals.map((d) => pairKey(d.exercise_a_id, d.exercise_b_id))),
    [dismissals]
  );

  const duplicatePairs = useMemo(
    () => (exercises ? findDuplicateCandidates(exercises, dismissedKeys) : []),
    [exercises, dismissedKeys]
  );

  // Only the lesser-used half of each pair is flagged in the table — the
  // established entry isn't the problem, the stray one is.
  const duplicateIds = useMemo(() => {
    const ids = new Set();
    for (const pair of duplicatePairs) {
      const usesA = usage[pair.a.id] ?? 0;
      const usesB = usage[pair.b.id] ?? 0;
      ids.add(usesA >= usesB ? pair.b.id : pair.a.id);
    }
    return ids;
  }, [duplicatePairs, usage]);

  const active = useMemo(() => (exercises ?? []).filter((e) => e.is_active !== false), [exercises]);
  const activeLifts = useMemo(() => active.filter((e) => (e.type ?? "lift") === "lift"), [active]);
  const liftCount = activeLifts.length;
  const warmupCount = useMemo(() => active.filter((e) => (e.type ?? "lift") === "warmup").length, [active]);
  const archivedCount = useMemo(() => (exercises ?? []).filter((e) => e.is_active === false).length, [exercises]);
  const noVideoCount = useMemo(() => active.filter((e) => !e.video_url).length, [active]);
  const neverUsedCount = useMemo(() => active.filter((e) => (usage[e.id] ?? 0) === 0).length, [active, usage]);
  const pendingCount = useMemo(() => active.filter((e) => !e.approved_at).length, [active]);
  const reviewer = isLibraryReviewer(profile);

  const patternCounts = useMemo(() => {
    const counts = {};
    for (const e of activeLifts) for (const p of e.movement_pattern ?? []) counts[p] = (counts[p] ?? 0) + 1;
    return counts;
  }, [activeLifts]);

  const muscleCounts = useMemo(() => {
    const counts = {};
    for (const e of activeLifts) {
      // Counted through parentMuscleGroup, not a bare includes — the eight
      // options are the top-level groups, so "Back" has to also catch an
      // exercise tagged only "lats".
      for (const g of new Set((e.muscle_group ?? []).map(parentMuscleGroup).filter(Boolean))) {
        counts[g] = (counts[g] ?? 0) + 1;
      }
    }
    return counts;
  }, [activeLifts]);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    return exercises.filter((ex) => {
      const isArchived = ex.is_active === false;
      if (seg === "archived") {
        if (!isArchived) return false;
      } else {
        if (isArchived) return false;
        if ((ex.type ?? "lift") !== seg) return false;
      }
      // Neither narrowing control applies to warm-ups or to the archive,
      // which is why they're only rendered on the Lifts segment.
      if (seg === "lift" && pattern && !(ex.movement_pattern ?? []).includes(pattern)) return false;
      if (seg === "lift" && muscle && !(ex.muscle_group ?? []).some((mg) => parentMuscleGroup(mg) === muscle)) return false;
      if (flag === "novideo" && ex.video_url) return false;
      if (flag === "neverused" && (usage[ex.id] ?? 0) > 0) return false;
      if (flag === "pending" && ex.approved_at) return false;
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [exercises, seg, pattern, muscle, flag, search, usage]);

  const handleSubmit = async (form) => {
    try {
      if (editing) await updateExercise(editing.id, form);
      else await createExercise({ ...form, createdBy: profile.id, approved: isLibraryReviewer(profile) });
      await load();
    } catch (err) {
      toastError("Failed to save exercise", err);
      throw err;
    }
  };

  // Returns whether it actually archived, so the form (where this now also
  // lives, at the foot of an edit) knows whether to close itself.
  const handleArchive = async (exercise) => {
    setArchivingId(exercise.id);
    let usageNote;
    try {
      const count = await getExerciseUsageCount(exercise.id);
      if (count > 0) {
        usageNote = `It's currently used in ${count} place${count === 1 ? "" : "s"} across your programming (sessions, warm-ups, and/or templates) — archiving will blank its name out of any live session that still references it.`;
      }
    } catch {
      // Courtesy, not a gate.
    } finally {
      setArchivingId(null);
    }
    if (!(await confirmArchiveExercise(exercise.name, usageNote))) return false;
    try {
      await setExerciseActive(exercise.id, false);
      await load();
      return true;
    } catch (err) {
      toastError("Failed to archive", err);
      return false;
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

  if (loadError) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, padding: 24 }}>
          <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center" }}>{loadError}</Text>
          <Pressable onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  if (!exercises) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  const showLiftControls = seg === "lift";
  const doorways = [
    reviewer && pendingCount > 0
      ? {
          key: "review",
          tone: "tan",
          title: `${pendingCount} exercise${pendingCount === 1 ? "" : "s"} waiting for review`,
          cta: "Open review queue",
          onPress: () => router.push("/(coach)/exercises/review"),
        }
      : null,
    duplicatePairs.length > 0
      ? {
          key: "merge",
          tone: "tan",
          title: `${duplicatePairs.length} near-duplicate name${duplicatePairs.length === 1 ? "" : "s"} found`,
          cta: "Merge exercises",
          onPress: () => router.push("/(coach)/exercises/merge"),
        }
      : null,
    // Always shown for a reviewer, unlike the two above — this one isn't
    // reporting a problem, it's the only way into renaming or removing a
    // parent.
    reviewer
      ? {
          key: "parents",
          tone: "plain",
          title: `${parents.length} parent${parents.length === 1 ? "" : "s"}`,
          cta: "Manage parents",
          onPress: () => router.push("/(coach)/exercises/parents"),
        }
      : null,
  ].filter(Boolean);

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ paddingHorizontal: 36, paddingVertical: 26 }}>
        <View style={{ maxWidth: 1040, width: "100%" }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <View>
              <Text style={{ fontFamily: fonts.display, fontSize: 27, color: colors.primary }}>Exercise Library</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 5 }}>
                {active.length} exercises · {noVideoCount} without video
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                placeholderTextColor={colors.hint}
                style={{
                  width: 230,
                  height: 38,
                  borderWidth: 1,
                  borderColor: INPUT_BORDER,
                  borderRadius: 9,
                  backgroundColor: "#fff",
                  paddingHorizontal: 13,
                  fontFamily: fonts.sans,
                  fontSize: 12.5,
                  color: INK,
                }}
              />
              <PressFade
                onPress={() => {
                  setEditing(null);
                  setModalVisible(true);
                }}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 9,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.25,
                  shadowRadius: 16,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>+ New exercise</Text>
              </PressFade>
            </View>
          </View>

          {/* One control row: view, then narrowing, then curation. The
              spacer between them is what keeps the attention toggles read
              as a separate concern from navigation. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, flexWrap: "wrap", zIndex: 20 }}>
            <SegmentTabs
              options={[
                { key: "lift", label: "Lifts", count: liftCount },
                { key: "warmup", label: "Warm-ups", count: warmupCount },
                { key: "archived", label: "Archived", count: archivedCount },
              ]}
              value={seg}
              onChange={(key) => {
                setSeg(key);
                setOpenDropdown(null);
                if (key !== "lift") {
                  setPattern(null);
                  setMuscle(null);
                }
              }}
            />
            {showLiftControls ? (
              <>
                <Dropdown
                  label="Movement pattern"
                  allLabel="All patterns"
                  options={MOVEMENT_PATTERNS.filter((p) => patternCounts[p]).map((p) => ({
                    key: p,
                    label: p.replace(/_/g, " "),
                    count: patternCounts[p],
                  }))}
                  value={pattern}
                  onChange={(v) => {
                    setPattern(v);
                    setOpenDropdown(null);
                  }}
                  open={openDropdown === "pattern"}
                  onToggle={() => setOpenDropdown((cur) => (cur === "pattern" ? null : "pattern"))}
                />
                <Dropdown
                  label="Muscle group"
                  allLabel="All muscle groups"
                  options={MUSCLE_GROUPS.filter((g) => muscleCounts[g]).map((g) => ({
                    key: g,
                    label: muscleGroupLabel(g),
                    count: muscleCounts[g],
                  }))}
                  value={muscle}
                  onChange={(v) => {
                    setMuscle(v);
                    setOpenDropdown(null);
                  }}
                  open={openDropdown === "muscle"}
                  onToggle={() => setOpenDropdown((cur) => (cur === "muscle" ? null : "muscle"))}
                />
              </>
            ) : null}
            <View style={{ flex: 1, minWidth: 12 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Eyebrow size={9.5} letterSpacing={1} color="#a8a29e">
                Needs attention
              </Eyebrow>
              <AttentionToggle
                label="No video"
                count={noVideoCount}
                active={flag === "novideo"}
                onPress={() => setFlag((cur) => (cur === "novideo" ? null : "novideo"))}
              />
              <AttentionToggle
                label="Never used"
                count={neverUsedCount}
                active={flag === "neverused"}
                onPress={() => setFlag((cur) => (cur === "neverused" ? null : "neverused"))}
              />
              {pendingCount > 0 ? (
                <AttentionToggle
                  label="Needs review"
                  count={pendingCount}
                  active={flag === "pending"}
                  onPress={() => setFlag((cur) => (cur === "pending" ? null : "pending"))}
                />
              ) : null}
            </View>
          </View>

          {doorways.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16, alignItems: "stretch" }}>
              {doorways.map((d) => (
                <Doorway key={d.key} title={d.title} cta={d.cta} tone={d.tone} onPress={d.onPress} />
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
            <HeaderRow />
            {filtered.length === 0 ? (
              <View style={{ padding: 26 }}>
                <Text style={{ textAlign: "center", fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>
                  {search ? `Nothing matches "${search}".` : "Nothing here yet."}
                </Text>
              </View>
            ) : (
              filtered.map((ex, i) => (
                <Row
                  key={ex.id}
                  exercise={ex}
                  uses={usage[ex.id] ?? 0}
                  duplicate={duplicateIds.has(ex.id)}
                  parentName={ex.parent_id ? parentNameById.get(ex.parent_id) : null}
                  onEdit={(e) => {
                    setEditing(e);
                    setModalVisible(true);
                  }}
                  onArchive={handleArchive}
                  onUnarchive={handleUnarchive}
                  archiving={archivingId === ex.id}
                  first={i === 0}
                />
              ))
            )}
          </View>
        </View>

        <ExerciseFormModal
          // A "+ New parent" from inside the form has to reach the "↳ under X"
          // line on this list, which reads off this screen's own parents state.
          onParentsChanged={() => listExerciseParents().then(setParents).catch(() => {})}
          visible={modalVisible}
          initialExercise={editing}
          initialType={seg === "warmup" ? "warmup" : "lift"}
          allExercises={exercises}
          usage={usage}
          onArchive={handleArchive}
          // "Use that one" abandons the new exercise and reopens the form on
          // the existing one.
          onUseExisting={(match) => setEditing(match)}
          onClose={() => setModalVisible(false)}
          onSubmit={handleSubmit}
        />
      </ScrollView>
    </CoachShell>
  );
}

// Below the breakpoint the desktop table would squeeze five fixed columns
// into a phone — and in practice everyone is on the installed PWA, so this
// branch is what makes the mobile design reachable at all. Two components
// with a branch between them, never an early return inside one: the desktop
// half runs a long list of hooks, and only one is ever mounted.
export default function ExercisesWeb() {
  const { width } = useWindowDimensions();
  if (width < MOBILE_BREAKPOINT) {
    return (
      <CoachShell>
        <ExerciseLibraryMobile />
      </CoachShell>
    );
  }
  return <ExercisesDesktop />;
}
