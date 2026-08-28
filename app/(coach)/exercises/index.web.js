import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
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
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";
import { confirmArchiveExercise } from "../../../lib/confirmDialog";

// Exercise Library, coach web (design_handoff_coach_web_v2, 1l).
//
// A library is only as good as the moment you're searching it mid-build,
// so this page is built around the two things that make that search bad:
// near-duplicate entries and missing videos. Usage counts say what's real;
// the video column shows a gap you'd otherwise find out about when a
// member asks. The duplicate banner is only a doorway — merging is its own
// page (exercises/merge.js).
//
// Deliberately NOT shown: the mock has an EQUIPMENT column, and there is no
// equipment field on programming.exercises. Rendering an empty column for
// all 240 entries would be worse than leaving it out; adding one is a real
// feature (migration + form field + tagging 240 rows), not a design pass.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";

function Eyebrow({ children, style }) {
  return <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>{children}</Text>;
}

function Chip({ label, count, active, onPress, tone }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        backgroundColor: active ? "#33251f" : "#fff",
        borderWidth: 1,
        borderColor: active ? "#33251f" : tone === "warn" ? "#eddcd2" : CARD_BORDER,
        borderRadius: 99,
        paddingVertical: 6,
        paddingHorizontal: 13,
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: active ? "#f7f3ee" : tone === "warn" ? colors.primaryOnWhite : "#44403c" }}>
        {label}
        {count != null ? <Text style={{ fontFamily: fonts.sansBold }}> {count}</Text> : null}
      </Text>
    </PressFade>
  );
}

const COLS = { name: 2.6, pattern: 1.1, used: 0.7, video: 0.8, actions: 0.5 };

function HeaderRow() {
  const cell = (key, label, align = "left") => (
    <View key={key} style={{ flex: COLS[key], alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
      {cell("name", "EXERCISE")}
      {cell("pattern", "PATTERN")}
      {cell("used", "USED", "right")}
      {cell("video", "VIDEO", "right")}
      <View style={{ flex: COLS.actions }} />
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
        borderTopColor: "#f4f1ec",
      }}
    >
      <View style={{ flex: COLS.name, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }} numberOfLines={1}>
            {exercise.name}
          </Text>
          {pending ? (
            <View style={{ backgroundColor: "#f5ede4", borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.5, color: "#8a5140" }}>NEEDS REVIEW</Text>
            </View>
          ) : null}
          {duplicate ? (
            <View style={{ backgroundColor: "#fdece5", borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.5, color: "#b23a22" }}>DUPLICATE?</Text>
            </View>
          ) : null}
          {/* Nothing distinguishes a bodyweight lift from a loaded one at a
              glance otherwise — a coach would have to open each to find out. */}
          {!isWarmup && exercise.tracks_weight === false ? (
            <View style={{ backgroundColor: "#eef1e7", borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.5, color: "#4d6142" }}>REPS ONLY</Text>
            </View>
          ) : null}
        </View>
        {parentName ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 2 }}>Variation of {parentName}</Text>
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
        <Text style={{ fontFamily: uses === 0 ? fonts.sans : fonts.sansSemiBold, fontSize: 12.5, color: uses === 0 ? "#c9c4bd" : "#44403c" }}>
          {uses === 0 ? "never" : `${uses}×`}
        </Text>
      </View>

      <View style={{ flex: COLS.video, alignItems: "flex-end" }}>
        {hasVideo ? (
          <Pressable onPress={() => Linking.openURL(exercise.video_url)}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#4d6142" }}>Linked</Text>
          </Pressable>
        ) : (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: uses > 0 ? "#b23a22" : "#c9c4bd" }}>
            {uses > 0 ? "Missing" : "None"}
          </Text>
        )}
      </View>

      <View style={{ flex: COLS.actions, flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
        <Pressable onPress={() => onEdit(exercise)}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>Edit</Text>
        </Pressable>
        {exercise.is_active === false ? (
          <Pressable onPress={() => onUnarchive(exercise)}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#4d6142" }}>Restore</Text>
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

export default function ExercisesWeb() {
  const { profile } = useAuth();
  const router = useRouter();

  const [exercises, setExercises] = useState(null);
  const [usage, setUsage] = useState({});
  const [dismissals, setDismissals] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ kind: "all", value: null });
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [rows, counts] = await Promise.all([
        listExercises({ includeArchived: true }),
        listExerciseUsageCounts().catch(() => ({})),
      ]);
      setExercises(rows);
      setUsage(counts);
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

  const parentNameById = useMemo(() => {
    const map = new Map();
    (exercises ?? []).forEach((ex) => map.set(ex.id, ex.name));
    return map;
  }, [exercises]);

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
  const noVideoCount = useMemo(() => active.filter((e) => !e.video_url).length, [active]);
  const neverUsedCount = useMemo(() => active.filter((e) => (usage[e.id] ?? 0) === 0).length, [active, usage]);
  const pendingCount = useMemo(() => active.filter((e) => !e.approved_at).length, [active]);
  const reviewer = isLibraryReviewer(profile);

  const patternCounts = useMemo(() => {
    const counts = {};
    for (const e of active) {
      if ((e.type ?? "lift") === "warmup") continue;
      for (const p of e.movement_pattern ?? []) counts[p] = (counts[p] ?? 0) + 1;
    }
    return counts;
  }, [active]);

  const warmupCount = useMemo(() => active.filter((e) => (e.type ?? "lift") === "warmup").length, [active]);

  // The filter.kind === "muscle" branch below has always existed but nothing
  // ever emitted it, so the desktop build — where the library is actually
  // curated — had no muscle-group filter while the phone did.
  const muscleCounts = useMemo(() => {
    const counts = {};
    for (const e of active) {
      if ((e.type ?? "lift") === "warmup") continue;
      for (const g of new Set((e.muscle_group ?? []).map(parentMuscleGroup).filter(Boolean))) {
        counts[g] = (counts[g] ?? 0) + 1;
      }
    }
    return counts;
  }, [active]);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    return exercises.filter((ex) => {
      const isArchived = ex.is_active === false;
      if (filter.kind === "archived") {
        if (!isArchived) return false;
      } else if (isArchived) {
        return false;
      }
      if (filter.kind === "pattern" && !(ex.movement_pattern ?? []).includes(filter.value)) return false;
      if (filter.kind === "muscle" && !(ex.muscle_group ?? []).some((mg) => parentMuscleGroup(mg) === filter.value)) return false;
      if (filter.kind === "warmup" && (ex.type ?? "lift") !== "warmup") return false;
      if (filter.kind === "novideo" && ex.video_url) return false;
      if (filter.kind === "neverused" && (usage[ex.id] ?? 0) > 0) return false;
      if (filter.kind === "pending" && ex.approved_at) return false;
      if (filter.kind === "duplicates" && !duplicateIds.has(ex.id)) return false;
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [exercises, filter, search, usage, duplicateIds]);

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
    if (!(await confirmArchiveExercise(exercise.name, usageNote))) return;
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

  const is = (kind, value = null) => filter.kind === kind && filter.value === value;
  const set = (kind, value = null) => setFilter({ kind, value });

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ paddingHorizontal: 36, paddingVertical: 26 }}>
        <View style={{ maxWidth: 1100, width: "100%" }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <View>
              <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>Exercise Library</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 4 }}>
                {active.length} exercises · {noVideoCount} without video
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                style={{
                  width: 220,
                  height: 38,
                  borderWidth: 1,
                  borderColor: "#e2ddd6",
                  borderRadius: 9,
                  backgroundColor: "#fff",
                  paddingHorizontal: 13,
                  fontFamily: fonts.sans,
                  fontSize: 12.5,
                  color: "#2a211c",
                }}
              />
              <PressFade
                onPress={() => {
                  setEditing(null);
                  setModalVisible(true);
                }}
                style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>+ New exercise</Text>
              </PressFade>
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
            <Chip label="All" count={active.length} active={is("all")} onPress={() => set("all")} />
            {MOVEMENT_PATTERNS.filter((p) => patternCounts[p]).map((p) => (
              <Chip
                key={p}
                label={p.replace(/_/g, " ")}
                count={patternCounts[p]}
                active={is("pattern", p)}
                onPress={() => set("pattern", p)}
              />
            ))}
            {warmupCount > 0 ? (
              <Chip label="Warm-up" count={warmupCount} active={is("warmup")} onPress={() => set("warmup")} />
            ) : null}
            <View style={{ width: 1, height: 24, backgroundColor: CARD_BORDER, marginHorizontal: 4 }} />
            {MUSCLE_GROUPS.filter((g) => muscleCounts[g]).map((g) => (
              <Chip
                key={g}
                label={muscleGroupLabel(g)}
                count={muscleCounts[g]}
                active={is("muscle", g)}
                onPress={() => set("muscle", g)}
              />
            ))}
            <View style={{ width: 1, height: 24, backgroundColor: CARD_BORDER, marginHorizontal: 4 }} />
            <Chip label="No video" count={noVideoCount} active={is("novideo")} onPress={() => set("novideo")} tone="warn" />
            <Chip label="Never used" count={neverUsedCount} active={is("neverused")} onPress={() => set("neverused")} tone="warn" />
            {pendingCount > 0 ? (
              <Chip label="Needs review" count={pendingCount} active={is("pending")} onPress={() => set("pending")} tone="warn" />
            ) : null}
            <Chip label="Archived" active={is("archived")} onPress={() => set("archived")} />
          </View>

          {reviewer && pendingCount > 0 ? (
            <PressFade
              onPress={() => router.push("/(coach)/exercises/review")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                marginTop: 18,
                backgroundColor: "#fdf6f2",
                borderWidth: 1,
                borderColor: "#eddcd2",
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 18,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>
                  {pendingCount} exercise{pendingCount === 1 ? "" : "s"} waiting for review
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5140", marginTop: 2 }}>
                  Added by other coaches and already in use — tidy the naming and tagging, then approve.
                </Text>
              </View>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Open review queue →</Text>
            </PressFade>
          ) : null}

          {duplicatePairs.length > 0 ? (
            <PressFade
              onPress={() => router.push("/(coach)/exercises/merge")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                marginTop: 18,
                backgroundColor: "#fdf6f2",
                borderWidth: 1,
                borderColor: "#eddcd2",
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 18,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>
                  {duplicatePairs.length} near-duplicate name{duplicatePairs.length === 1 ? "" : "s"} found
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5140", marginTop: 2 }} numberOfLines={1}>
                  "{duplicatePairs[0].a.name}" and "{duplicatePairs[0].b.name}" both exist
                </Text>
              </View>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Merge exercises →</Text>
            </PressFade>
          ) : null}

          <View style={{ marginTop: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
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
                  parentName={ex.parent_exercise_id ? parentNameById.get(ex.parent_exercise_id) : null}
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
          visible={modalVisible}
          initialExercise={editing}
          allExercises={exercises}
          usage={usage}
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
