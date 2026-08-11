import { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MUSCLE_GROUPS, MOVEMENT_PATTERNS, groupExercisesByParent, parentMuscleGroup, muscleGroupLabel } from "../lib/programming/exercises";
import { fonts } from "../lib/theme";

// The left-hand library column shared by all three web builders (group,
// SPC, SPC templates). Used to be three near-identical copies inlined in
// those files; extracted when the "group by movement pattern OR muscle
// group" toggle was added, so that lives in one place instead of drifting
// three ways.
//
// Click-to-insert only — no drag-from-library. Used to be a dnd-kit
// draggable row with the "expand variations" chevron nested inside it —
// that's nested interactive content (a focusable draggable wrapper
// containing its own focusable button), which caused a real bug: clicking
// the chevron while scrolled down shifted the sidebar's scroll position out
// from under the click. Fixed at the root by making the chevron a sibling
// of the insert button, not nested inside it, and dropping the drag wiring
// entirely — plain click-to-insert already covers the same functionality.

const UNGROUPED_KEY = "__ungrouped__";

function LibraryExercise({ exercise, onInsertClick, hasChildren, expanded, onToggleExpand, indented }) {
  return (
    <View
      className="mb-1.5 flex-row items-center rounded-lg border border-stone-200 px-3 py-2"
      style={{ marginLeft: indented ? 14 : 0 }}
    >
      <Pressable onPress={() => onInsertClick(exercise)} className="flex-1 flex-row items-center active:opacity-70">
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text style={{ fontFamily: fonts.sansMedium }}>{exercise.name}</Text>
            {exercise.type === "warmup" ? (
              <View className="rounded-full px-2 py-[2px]" style={{ backgroundColor: "#fdf6ee" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#8a5a2e", fontSize: 9.5 }}>warm-up</Text>
              </View>
            ) : null}
          </View>
          {exercise.movement_pattern?.length ? (
            <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              {exercise.movement_pattern.map((p) => p.replace("_", " ")).join(", ")}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {hasChildren ? (
        <Pressable
          onPress={onToggleExpand}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={expanded ? `Collapse ${exercise.name} variations` : `Show ${exercise.name} variations`}
        >
          <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={16} color="#78716c" />
        </Pressable>
      ) : null}
    </View>
  );
}

// A real bordered header row rather than the old bare uppercase label with a
// 10px "▸" glyph beside it — every section starts collapsed now, so the
// header *is* the whole control most of the time and has to read as a
// tappable card, not a caption.
function CollapsibleSection({ title, count, collapsed, onToggle, tint, children }) {
  return (
    <View className="mb-2">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between rounded-lg px-3 py-2.5"
        style={{ borderWidth: 1, borderColor: tint ? "#e3d5c2" : "#e0dcd6", backgroundColor: collapsed ? "#faf8f6" : "#ffffff" }}
      >
        <Text className="text-xs uppercase" style={{ fontFamily: fonts.sansBold, color: tint ?? "#57534e", letterSpacing: 0.4 }}>
          {title}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#a8a29e" }}>
            {count}
          </Text>
          <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={18} color="#78716c" />
        </View>
      </Pressable>
      {collapsed ? null : <View className="mt-1.5">{children}</View>}
    </View>
  );
}

function GroupByToggle({ value, onChange }) {
  return (
    <View className="mb-3 flex-row rounded-lg bg-stone-100 p-1">
      {[
        { key: "muscle", label: "Muscle group" },
        { key: "pattern", label: "Movement" },
      ].map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            className="flex-1 items-center rounded-md py-1.5"
            style={active ? { backgroundColor: "white" } : undefined}
          >
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, color: active ? "#8a5140" : "#78716c", fontSize: 11.5 }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ExerciseLibrarySidebar({
  library,
  search,
  onSearchChange,
  onNewExercise,
  onInsertLift,
  onInsertWarmup,
  onBack,
  backLabel = "‹ Back",
}) {
  const [groupBy, setGroupBy] = useState("muscle");
  // Tracked as the *expanded* set, not the collapsed one, so "everything
  // starts closed" is just an empty set — with a real library this column
  // was an unscannable wall of every lift in the gym on open. (Tracking
  // collapsed instead needs the initial state seeded with every bucket key,
  // and those keys change when the grouping toggle flips.)
  const [expandedSections, setExpandedSections] = useState(() => new Set());
  const [expandedParents, setExpandedParents] = useState(() => new Set());

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleParent = (id) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const isCollapsed = (key) => !expandedSections.has(key);

  const filteredLibrary = useMemo(() => {
    if (!search) return library;
    return library.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  }, [library, search]);

  const isSearching = search.length > 0;

  // Warm-ups are pinned above the grouped lifts, not bucketed alongside
  // them — a warm-up exercise has no muscle_group (null since migration
  // 0012), and mixing warm-up movements into the lift buckets would make it
  // ambiguous which exercises are meant for a session's warm-up slot.
  const warmupLibrary = useMemo(() => filteredLibrary.filter((e) => e.type === "warmup"), [filteredLibrary]);

  // Only top-level (parent-less) exercises get bucketed — variations render
  // nested under their parent instead. While actively searching, the flat
  // filteredLibrary is used directly (see render), so a direct search for a
  // variation's name always surfaces it without expanding its parent first.
  const { childrenByParent } = useMemo(() => groupExercisesByParent(library), [library]);

  // One shape for both groupings: an ordered list of {key, title, items}.
  // Anything with no value for the active grouping falls into a trailing
  // "no {grouping}" bucket rather than silently vanishing from the sidebar
  // — a real risk for movement_pattern, which is optional on the form.
  const sections = useMemo(() => {
    const isMuscle = groupBy === "muscle";
    const keys = isMuscle ? MUSCLE_GROUPS : MOVEMENT_PATTERNS;
    const field = isMuscle ? "muscle_group" : "movement_pattern";
    const buckets = new Map(keys.map((k) => [k, []]));
    const ungrouped = [];

    filteredLibrary.forEach((e) => {
      if (e.type === "warmup" || e.parent_exercise_id) return;
      const values = e[field] ?? [];
      if (!values.length) {
        ungrouped.push(e);
        return;
      }
      // Muscle sub-groups roll up to their top-level section here rather
      // than each becoming its own bucket — ~23 sections would make this
      // column unscannable, which is the whole reason it collapses. The
      // dedupe matters: an exercise tagged both "chest" and "upper_chest"
      // maps to "chest" twice and would otherwise list twice in it.
      const bucketKeys = isMuscle
        ? [...new Set(values.map(parentMuscleGroup).filter(Boolean))]
        : values;
      if (isMuscle && bucketKeys.length === 0) {
        ungrouped.push(e);
        return;
      }
      bucketKeys.forEach((v) => {
        if (!buckets.has(v)) buckets.set(v, []);
        buckets.get(v).push(e);
      });
    });

    const out = [...buckets.entries()]
      .filter(([, items]) => items.length > 0)
      .map(([key, items]) => ({ key, title: isMuscle ? muscleGroupLabel(key) : key.replace(/_/g, " "), items }));
    if (ungrouped.length) {
      out.push({ key: UNGROUPED_KEY, title: groupBy === "muscle" ? "no muscle group" : "no movement pattern", items: ungrouped });
    }
    return out;
  }, [filteredLibrary, groupBy]);

  return (
    <View
      className="flex-col border-r border-stone-200"
      style={{ width: 288, flexGrow: 0, flexShrink: 0, height: "100%", minHeight: 0 }}
    >
      <View className="px-4 pb-3 pt-6">
        {/* Back lives here, in the sidebar's fixed header, rather than atop
            the content column — over there it sat above the client/week
            heading and scrolled out of reach the moment a coach started
            working down a session. This column never scrolls. */}
        {onBack ? (
          <Pressable onPress={onBack} className="mb-3 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>{backLabel}</Text>
          </Pressable>
        ) : null}
        <Text className="mb-3 text-lg text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
          Exercise Library
        </Text>
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search…"
          className="mb-3 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans }}
        />
        {isSearching ? null : <GroupByToggle value={groupBy} onChange={setGroupBy} />}
        <Pressable onPress={onNewExercise} className="rounded-lg border border-primary px-3 py-2.5">
          <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
            + New Exercise
          </Text>
        </Pressable>
      </View>

      <ScrollView className="px-4 pb-6" style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
        {isSearching ? (
          <View className="mb-4">
            <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
              Results
            </Text>
            {filteredLibrary
              .filter((e) => e.type !== "warmup")
              .map((exercise) => (
                <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={onInsertLift} />
              ))}
            {warmupLibrary.map((exercise) => (
              <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={onInsertWarmup} />
            ))}
          </View>
        ) : (
          <>
            {warmupLibrary.length > 0 ? (
              <CollapsibleSection
                title="Warm-ups"
                count={warmupLibrary.length}
                collapsed={isCollapsed("warmups")}
                onToggle={() => toggleSection("warmups")}
                tint="#8a5a2e"
              >
                {warmupLibrary.map((exercise) => (
                  <LibraryExercise key={exercise.id} exercise={exercise} onInsertClick={onInsertWarmup} />
                ))}
              </CollapsibleSection>
            ) : null}
            {sections.map((section) => (
              <CollapsibleSection
                key={section.key}
                title={section.title}
                count={section.items.length}
                collapsed={isCollapsed(section.key)}
                onToggle={() => toggleSection(section.key)}
              >
                {section.items.map((exercise) => {
                  const children = childrenByParent.get(exercise.id) ?? [];
                  const expanded = expandedParents.has(exercise.id);
                  return (
                    <View key={exercise.id}>
                      <LibraryExercise
                        exercise={exercise}
                        onInsertClick={onInsertLift}
                        hasChildren={children.length > 0}
                        expanded={expanded}
                        onToggleExpand={() => toggleParent(exercise.id)}
                      />
                      {expanded
                        ? children.map((child) => (
                            <LibraryExercise key={child.id} exercise={child} onInsertClick={onInsertLift} indented />
                          ))
                        : null}
                    </View>
                  );
                })}
              </CollapsibleSection>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
