import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
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
} from "../../lib/programming/exercises";
import { listExerciseParents } from "../../lib/programming/exerciseParents";
import { ExerciseFormModal } from "../ExerciseFormModal";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { fonts, colors, type } from "../../lib/theme";
import { toastError } from "../../lib/toast";
import { confirmArchiveExercise } from "../../lib/confirmDialog";
import {
  CARD_BORDER,
  ROW_RULE,
  INPUT_BORDER,
  CHIP_BORDER,
  SEGMENT_TRACK,
  ESPRESSO,
  ESPRESSO_TEXT,
  ESPRESSO_SUB,
  INK,
  TAN_BG,
  BADGE_REVIEW,
  BADGE_REPS_ONLY,
} from "../exercise/tokens";

// The coach's Exercise Library on a phone (design_handoff_exercise_library_v1).
//
// The screen used to open with its filters rather than its content: a
// Lifts/Warm-ups segment, a "Show archived" toggle and eight muscle-group
// pills — three rows of chrome before the first exercise name. The muscle
// pills and the archived toggle moved into a filter sheet, which is also
// where they can carry live counts, and applied filters echo back as
// dismissable tokens. Same gesture the SPC roster already uses, so filtering
// is one consistent thing across the coach app.
//
// Lives here rather than in app/(coach)/exercises/index.js so that
// index.web.js can render it below the mobile breakpoint — which matters,
// because in practice everyone is on the installed PWA. It CANNOT be
// imported from the route file: Metro applies platform-extension resolution
// to plain imports, not just routes, so `import … from "./index"` inside
// index.web.js resolves straight back to index.web.js — a self-import that
// silently keeps the desktop table on a phone.

// A–Z headers are a deliberate keeper from the handoff (which flags them as
// optional): the library is ~150 entries and alphabetical, so the letter
// band is the only thing that says where you are while scrolling.
const SHOW_LETTER_HEADERS = true;

function letterOf(name) {
  const ch = (name ?? "").trim()[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(ch) ? ch : "#";
}

/* ----------------------------------------------------------------- pieces */

function SegmentTabs({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: SEGMENT_TRACK, borderRadius: 10, padding: 3, marginTop: 14 }}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
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

function FilterToken({ label, onClear }) {
  return (
    <PressFade
      onPress={onClear}
      accessibilityLabel={`Clear filter ${label}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: ESPRESSO,
        borderRadius: 99,
        paddingVertical: 5,
        paddingHorizontal: 11,
      }}
    >
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: ESPRESSO_TEXT }}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: ESPRESSO_SUB }}>
        ×
      </Text>
    </PressFade>
  );
}

function FilterOption({ label, count, selected, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 11,
        paddingHorizontal: 2,
        borderBottomWidth: 1,
        borderBottomColor: ROW_RULE,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        style={{ flex: 1, fontFamily: selected ? fonts.sansBold : fonts.sansMedium, fontSize: 13.5, color: INK }}
      >
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
        {count}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ width: 16, fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>
        {selected ? "✓" : ""}
      </Text>
    </PressFade>
  );
}

function FilterSheet({ visible, onClose, showMuscle, muscleCounts, muscleFilter, onMuscle, allCount, showArchived, archivedCount, onToggleArchived, onClearAll, shownCount }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <PressFade
        onPress={onClose}
        pressedOpacity={1}
        accessibilityLabel="Close filters"
        style={{ flex: 1, backgroundColor: "rgba(42,33,28,0.4)", justifyContent: "flex-end" }}
      >
        {/* An inner non-closing press target: without it, a tap anywhere on
            the sheet bubbles to the backdrop and shuts it. */}
        <PressFade
          onPress={() => {}}
          pressedOpacity={1}
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: 26,
            maxHeight: "75%",
          }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#e0dbd4" }} />

          <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* Muscle groups don't apply to warm-ups, so on that segment the
                sheet is just the archived switch. */}
            {showMuscle ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <Eyebrow>Muscle group</Eyebrow>
                  <PressFade onPress={onClearAll} hitSlop={8}>
                    <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>
                      Clear all
                    </Text>
                  </PressFade>
                </View>
                <FilterOption label="All muscle groups" count={allCount} selected={!muscleFilter} onPress={() => onMuscle(null)} />
                {MUSCLE_GROUPS.map((mg) => (
                  <FilterOption
                    key={mg}
                    label={muscleGroupLabel(mg)}
                    count={muscleCounts[mg] ?? 0}
                    selected={muscleFilter === mg}
                    onPress={() => onMuscle(mg)}
                  />
                ))}
              </>
            ) : null}

            <View style={{ marginTop: showMuscle ? 16 : 0, marginBottom: 6 }}>
              <Eyebrow>Library</Eyebrow>
            </View>
            <FilterOption
              label="Show archived instead"
              count={archivedCount}
              selected={showArchived}
              onPress={onToggleArchived}
            />
          </ScrollView>

          <PressFade
            onPress={onClose}
            style={{ backgroundColor: ESPRESSO, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 10 }}
          >
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: ESPRESSO_TEXT }}>
              Show {shownCount} exercise{shownCount === 1 ? "" : "s"}
            </Text>
          </PressFade>
        </PressFade>
      </PressFade>
    </Modal>
  );
}

function Badge({ tone, children }) {
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 8 }}>
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase", color: tone.text }}
      >
        {children}
      </Text>
    </View>
  );
}

function ExerciseRow({ exercise, parentName, archived, onOpen, onUnarchive }) {
  const isWarmup = (exercise.type ?? "lift") === "warmup";
  const sub = isWarmup
    ? "Warm-up"
    : [
        exercise.muscle_group?.map(muscleGroupLabel).join(", "),
        exercise.movement_pattern?.map((mp) => mp.replace(/_/g, " ")).join(", "),
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <PressFade
      // An archived row has nothing to edit into — the one action it offers
      // is getting it back, which is the pill on the right.
      onPress={archived ? undefined : onOpen}
      pressedOpacity={archived ? 1 : 0.6}
      accessibilityLabel={archived ? exercise.name : `Edit ${exercise.name}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: ROW_RULE,
        minHeight: 44,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 14, color: INK }}>
            {exercise.name}
          </Text>
          {/* Not a warning — a pending entry is fully usable in a program,
              it just hasn't been past a reviewer yet. */}
          {!exercise.approved_at ? <Badge tone={BADGE_REVIEW}>needs review</Badge> : null}
          {/* Nothing distinguishes a bodyweight lift from a loaded one at a
              glance otherwise — a coach would have to open each to find out. */}
          {!isWarmup && exercise.tracks_weight === false ? <Badge tone={BADGE_REPS_ONLY}>reps only</Badge> : null}
        </View>
        {sub ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.muted, marginTop: 2 }}
          >
            {sub}
          </Text>
        ) : null}
        {parentName ? (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 2 }}>
            ↳ under {parentName}
          </Text>
        ) : null}
        {exercise.cues ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", fontStyle: "italic", marginTop: 2 }}
          >
            “{exercise.cues}”
          </Text>
        ) : null}
      </View>

      {exercise.video_url && !archived ? (
        <Pressable
          onPress={(e) => {
            // The row itself opens the editor; the video button must not
            // also do that on its way to the link.
            e.stopPropagation?.();
            Linking.openURL(exercise.video_url);
          }}
          hitSlop={8}
          accessibilityLabel={`Watch video for ${exercise.name}`}
          style={{
            width: 28,
            height: 28,
            borderWidth: 1.5,
            borderColor: "#e8ded7",
            borderRadius: 99,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: TAN_BG,
          }}
        >
          <Ionicons name="play" size={11} color={colors.primaryOnWhite} />
        </Pressable>
      ) : null}

      {archived ? (
        <PressFade
          onPress={onUnarchive}
          accessibilityLabel={`Un-archive ${exercise.name}`}
          style={{ borderWidth: 1, borderColor: CHIP_BORDER, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#fff" }}
        >
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#44403c" }}>
            Un-archive
          </Text>
        </PressFade>
      ) : (
        <Text maxFontSizeMultiplier={1} style={{ fontSize: 16, color: "#d6d1ca" }}>
          ›
        </Text>
      )}
    </PressFade>
  );
}

/* ---------------------------------------------------------------- screen */

export function ExerciseLibraryMobile({ header }) {
  const { profile } = useAuth();
  const [exercises, setExercises] = useState(null);
  const [parents, setParents] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("lift");
  const [muscleFilter, setMuscleFilter] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setExercises(await listExercises({ includeArchived: true }));
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    // Isolated: parents only supply the "↳ under X" line, so a failed load
    // costs that line rather than the whole library.
    try {
      setParents(await listExerciseParents());
    } catch {
      setParents([]);
    }
  }, []);

  // Tab root, kept mounted across tab switches on native — refetch on every
  // focus so an edit made a moment ago is current.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Parent names come off the parent records (0095), not off other
  // exercises — a parent is no longer an exercise, so this can't be
  // resolved from the library list any more.
  const parentNameById = useMemo(() => new Map(parents.map((p) => [p.id, p.name])), [parents]);

  const active = useMemo(() => (exercises ?? []).filter((e) => e.is_active !== false), [exercises]);
  const archived = useMemo(() => (exercises ?? []).filter((e) => e.is_active === false), [exercises]);
  const liftCount = useMemo(() => active.filter((e) => (e.type ?? "lift") === "lift").length, [active]);
  const warmupCount = useMemo(() => active.filter((e) => (e.type ?? "lift") === "warmup").length, [active]);

  // Counts are computed against everything the current segment shows before
  // the muscle filter, not the whole library — otherwise the sheet offers
  // "Chest 5" and then shows one exercise once a search is typed.
  const searched = useMemo(() => {
    const pool = showArchived ? archived : active;
    const term = search.trim().toLowerCase();
    return pool.filter((ex) => {
      if ((ex.type ?? "lift") !== typeFilter) return false;
      if (term && !ex.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [active, archived, showArchived, typeFilter, search]);

  const muscleCounts = useMemo(() => {
    const counts = {};
    for (const e of searched) {
      // Counted through parentMuscleGroup, not a bare includes — the eight
      // options are the top-level groups, so "Back" has to also catch an
      // exercise tagged only "lats".
      for (const g of new Set((e.muscle_group ?? []).map(parentMuscleGroup).filter(Boolean))) {
        counts[g] = (counts[g] ?? 0) + 1;
      }
    }
    return counts;
  }, [searched]);

  const filtered = useMemo(() => {
    if (typeFilter !== "lift" || !muscleFilter) return searched;
    return searched.filter((ex) => ex.muscle_group?.some((mg) => parentMuscleGroup(mg) === muscleFilter));
  }, [searched, typeFilter, muscleFilter]);

  // One flat list of letter headers and rows, so the card renders in a
  // single pass rather than nesting a group per letter.
  const listItems = useMemo(() => {
    const items = [];
    let letter = null;
    for (const ex of filtered) {
      if (SHOW_LETTER_HEADERS) {
        const next = letterOf(ex.name);
        if (next !== letter) {
          letter = next;
          items.push({ kind: "header", key: `h-${next}`, letter: next });
        }
      }
      items.push({ kind: "row", key: ex.id, exercise: ex });
    }
    return items;
  }, [filtered]);

  const activeFilterCount = (muscleFilter ? 1 : 0) + (showArchived ? 1 : 0);

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

  // Returns whether it actually archived, so the form knows whether to
  // close itself.
  const handleArchive = async (exercise) => {
    let usageNote;
    try {
      const count = await getExerciseUsageCount(exercise.id);
      if (count > 0) {
        usageNote = `It's currently used in ${count} place${count === 1 ? "" : "s"} across your programming (sessions, warm-ups, and/or templates) — archiving will blank its name out of any live session that still references it.`;
      }
    } catch {
      // Usage count is a courtesy, not a gate — if it fails to load, fall
      // back to the plain confirm rather than blocking the archive.
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
        {header}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.primary }}>Exercise Library</Text>
          <PressFade
            onPress={() => {
              setEditing(null);
              setModalVisible(true);
            }}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 99,
              paddingVertical: 8,
              paddingHorizontal: 15,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
            }}
          >
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>
              + New
            </Text>
          </PressFade>
        </View>
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 4 }}>
          {exercises ? `${liftCount} lift${liftCount === 1 ? "" : "s"} · ${warmupCount} warm-up${warmupCount === 1 ? "" : "s"}` : "Loading…"}
        </Text>

        <SegmentTabs
          options={[
            { key: "lift", label: `Lifts · ${liftCount}` },
            { key: "warmup", label: `Warm-ups · ${warmupCount}` },
          ]}
          value={typeFilter}
          onChange={(key) => {
            setTypeFilter(key);
            // The muscle filter is a lift-only concept; carrying it onto the
            // warm-up segment would leave a token showing that filters nothing.
            if (key !== "lift") setMuscleFilter(null);
          }}
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises"
            placeholderTextColor={colors.hint}
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: INPUT_BORDER,
              borderRadius: 10,
              paddingHorizontal: 13,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: INK,
            }}
          />
          <PressFade
            onPress={() => setSheetOpen(true)}
            accessibilityLabel="Filter exercises"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              height: 40,
              paddingHorizontal: 13,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: INPUT_BORDER,
              borderRadius: 10,
            }}
          >
            <Ionicons name="filter-outline" size={14} color="#57534e" />
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>
              Filter
            </Text>
            {activeFilterCount > 0 ? (
              <View
                style={{
                  minWidth: 17,
                  height: 17,
                  borderRadius: 9,
                  paddingHorizontal: 4,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#fff" }}>
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </PressFade>
        </View>

        {activeFilterCount > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {muscleFilter ? <FilterToken label={muscleGroupLabel(muscleFilter)} onClear={() => setMuscleFilter(null)} /> : null}
            {showArchived ? <FilterToken label="Archived" onClear={() => setShowArchived(false)} /> : null}
          </View>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 }}>
        {loadError ? (
          <View style={{ alignItems: "flex-start", paddingVertical: 12 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22", marginBottom: 8 }}>
              Couldn't load exercises: {loadError}
            </Text>
            <PressFade onPress={load} hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>Retry</Text>
            </PressFade>
          </View>
        ) : !exercises ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
            {listItems.length === 0 ? (
              <Text
                style={{ paddingVertical: 30, paddingHorizontal: 20, textAlign: "center", fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}
              >
                {search.trim()
                  ? `Nothing matches "${search.trim()}".`
                  : showArchived
                    ? `No archived ${typeFilter === "lift" ? "lifts" : "warm-ups"}.`
                    : `No ${typeFilter === "lift" ? "lifts" : "warm-ups"} yet.`}
              </Text>
            ) : (
              listItems.map((item) =>
                item.kind === "header" ? (
                  <View
                    key={item.key}
                    style={{ paddingTop: 9, paddingBottom: 5, paddingHorizontal: 14, backgroundColor: colors.canvas, borderBottomWidth: 1, borderBottomColor: ROW_RULE }}
                  >
                    <Eyebrow size={10} letterSpacing={1.1} color="#a8a29e">
                      {item.letter}
                    </Eyebrow>
                  </View>
                ) : (
                  <ExerciseRow
                    key={item.key}
                    exercise={item.exercise}
                    parentName={item.exercise.parent_id ? parentNameById.get(item.exercise.parent_id) : null}
                    archived={showArchived}
                    onOpen={() => {
                      setEditing(item.exercise);
                      setModalVisible(true);
                    }}
                    onUnarchive={() => handleUnarchive(item.exercise)}
                  />
                )
              )
            )}
          </View>
        )}
      </ScrollView>

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        showMuscle={typeFilter === "lift"}
        muscleCounts={muscleCounts}
        muscleFilter={muscleFilter}
        onMuscle={(mg) => setMuscleFilter((cur) => (cur === mg ? null : mg))}
        allCount={searched.length}
        showArchived={showArchived}
        archivedCount={archived.length}
        onToggleArchived={() => setShowArchived((v) => !v)}
        onClearAll={() => {
          setMuscleFilter(null);
          setShowArchived(false);
        }}
        shownCount={filtered.length}
      />

      <ExerciseFormModal
        // A "+ New parent" from inside the form has to reach the "↳ under X"
        // line on this list, which reads off this screen's own parents state.
        onParentsChanged={() => listExerciseParents().then(setParents).catch(() => {})}
        visible={modalVisible}
        initialExercise={editing}
        initialType={typeFilter}
        allExercises={exercises ?? []}
        backLabel="Library"
        onArchive={handleArchive}
        // "Use that one" abandons the new exercise and reopens the form on
        // the existing one.
        onUseExisting={(match) => setEditing(match)}
        onClose={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
    </View>
  );
}
