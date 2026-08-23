import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Eyebrow, BUILDER_CARD_BORDER } from "./SessionBuilderParts";
import { SortableList } from "../SortableList";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// The "Coach Ed" tab of the group builder's right rail.
//
// WEB ONLY — it renders a raw <select>, so only ever import it from a
// .web.js screen. Same convention as SessionBuilderParts, which is a
// plain-named file that imports dnd-kit.
//
// Notes are keyed to (block, session_number), not to the open workout — see
// migration 0079. That's why the caption says "every week": a coach writing
// here is explaining the block's lifts once, and the Coach Prep tab shows it
// against Session N whichever week is being looked at.
//
// Cards are grouped by what they're about and collapse to one line, so a
// session carrying five notes stays scannable in a rail this narrow — the
// same reasoning as the builder's own lift list, where only the row you're
// touching expands.
//
// Saves are debounced-then-persisted through the parent's `track`, so they
// feed the same header "Saved" light every other write on this screen does.
// The debounce timer is deliberately NOT cleared on unmount: a cleanup fires
// on every dep change and would silently drop the last thing typed. A write
// landing after its row was deleted is a harmless no-op update.

const SAVE_DELAY = 700;

// "General warm-up" has no exercise id to carry, so the select needs a
// sentinel for it. It can't collide with a real uuid.
const GENERAL_WARMUP = "__warmup__";

// Same order as the dropdown, so a card sits in the section its own
// selection names.
const SECTIONS = [
  { key: "session", label: "WHOLE SESSION" },
  { key: "warmup", label: "WARM-UPS" },
  { key: "exercise", label: "EXERCISES" },
];

function Field({ label, value, onCommit, multiline = false, placeholder }) {
  const [draft, setDraft] = useState(value ?? "");
  const timer = useRef(null);
  // Re-seed only when the row identity changes upstream (a fresh fetch), not
  // on every keystroke — the parent holds the same string we just sent it.
  const lastExternal = useRef(value ?? "");
  useEffect(() => {
    if ((value ?? "") !== lastExternal.current) {
      lastExternal.current = value ?? "";
      setDraft(value ?? "");
    }
  }, [value]);

  const commit = (next) => {
    lastExternal.current = next;
    onCommit(next);
  };

  return (
    <View style={{ marginTop: 9 }}>
      <Eyebrow style={{ fontSize: 9, marginBottom: 4 }}>{label}</Eyebrow>
      <TextInput
        value={draft}
        placeholder={placeholder}
        placeholderTextColor="#c9c4bd"
        multiline={multiline}
        onChangeText={(t) => {
          setDraft(t);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(t), SAVE_DELAY);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          if (draft !== lastExternal.current) commit(draft);
        }}
        style={{
          fontFamily: fonts.sans,
          fontSize: 12.5,
          color: "#2a211c",
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: BUILDER_CARD_BORDER,
          borderRadius: 8,
          paddingHorizontal: 9,
          paddingVertical: 7,
          minHeight: multiline ? 76 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

function headingFor(item) {
  if (item.exercises?.name) return item.exercises.name;
  return item.scope === "warmup" ? "The whole warm-up" : "Whole session";
}

function EducationCard({ item, groups, expanded, onToggle, onChange, onRemove, controls }) {
  // Flattened only to answer "is this row's exercise still programmed?" —
  // the dropdown itself keeps the groups so warm-ups stay separated.
  const all = groups.flatMap((g) => g.items);
  const note = (item.notes ?? "").trim();
  const hasVideo = Boolean((item.video_url ?? "").trim());

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: expanded ? "#e0b6a5" : BUILDER_CARD_BORDER,
        borderRadius: 12,
        backgroundColor: expanded ? "#fdf6f2" : "#fff",
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 4 }}>
        {controls}
        <Pressable onPress={onToggle} style={{ flex: 1, paddingVertical: 9, paddingRight: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}
            >
              {headingFor(item)}
            </Text>
            {hasVideo ? <Ionicons name="videocam" size={13} color="#a8a29e" /> : null}
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color="#a8a29e" />
          </View>
          {/* Collapsed rows still have to be worth reading, or collapsing
              just hides which note is which. */}
          {!expanded ? (
            <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: note ? "#78716c" : "#c9c4bd", marginTop: 2 }}>
              {note || "No note yet"}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {expanded ? (
        <View style={{ paddingHorizontal: 11, paddingBottom: 11 }}>
          <Eyebrow style={{ fontSize: 9, marginBottom: 4 }}>WHAT IT'S ABOUT</Eyebrow>
          <select
            value={item.exercise_id ?? (item.scope === "warmup" ? GENERAL_WARMUP : "")}
            onChange={(e) => {
              const picked = e.target.value;
              if (picked === GENERAL_WARMUP) return onChange(item.id, { exercise_id: null, scope: "warmup" });
              // scope is written back even when a specific exercise is picked, so
              // clearing the dropdown afterwards can't resurface the old general.
              onChange(item.id, { exercise_id: picked || null, scope: "session" });
            }}
            style={{
              width: "100%",
              fontFamily: fonts.sans,
              fontSize: 12.5,
              color: "#2a211c",
              background: "#fff",
              border: `1px solid ${BUILDER_CARD_BORDER}`,
              borderRadius: 8,
              padding: "7px 8px",
            }}
          >
            {/* Blank is a real, useful choice — a note about the session as a
                whole ("this week's theme is tempo") has nothing to hang on. */}
            <option value="">Whole session (nothing specific)</option>
            {groups
              .filter((g) => g.items.length > 0 || g.general)
              .map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {/* Sits first in its own group so it reads as "this block, in
                      general" rather than as another movement in the list. */}
                  {g.general ? <option value={g.general.value}>{g.general.label}</option> : null}
                  {g.items.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            {/* A lift that's since been pulled from the session keeps its note
                readable rather than the dropdown silently falling back to blank. */}
            {item.exercise_id && !all.some((o) => o.id === item.exercise_id) ? (
              <option value={item.exercise_id}>{item.exercises?.name ?? "Removed lift"} (no longer programmed)</option>
            ) : null}
          </select>

          <Field
            label="NOTES"
            value={item.notes}
            multiline
            placeholder="What should a coach know before they run this?"
            onCommit={(t) => onChange(item.id, { notes: t })}
          />
          <Field
            label="VIDEO LINK"
            value={item.video_url}
            placeholder="https://…"
            onCommit={(t) => onChange(item.id, { video_url: t })}
          />

          <PressFade onPress={() => onRemove(item.id)} hitSlop={8} style={{ marginTop: 9, alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#b23a22" }}>Remove</Text>
          </PressFade>
        </View>
      ) : null}
    </View>
  );
}

export function CoachEducationRail({
  sessionNumber,
  items,
  lifts,
  warmups,
  loading,
  error,
  onAdd,
  onChange,
  onRemove,
  onReorder,
  onRetry,
}) {
  // Single-open, matching the builder's own lift list: the rail is narrow
  // enough that two open forms means neither is readable.
  const [openId, setOpenId] = useState(null);

  // Warm-ups first, then the main session — the order a coach runs it in.
  //
  // Only the warm-up block gets a "general": the main session in general and
  // the whole session are the same note, and offering both would make a coach
  // choose between two options that mean the same thing.
  const groups = [
    {
      label: "Warm-ups",
      items: warmups ?? [],
      general: { value: GENERAL_WARMUP, label: "General — the whole warm-up" },
    },
    { label: "Exercises", items: lifts ?? [] },
  ];

  const warmupIds = new Set((warmups ?? []).map((w) => w.id));
  // A card's section is decided by its own dropdown selection, so changing
  // that moves it — there's no separate "which group is this in" to keep in
  // sync, and no ambiguous drag between sections.
  const kindOf = (item) => {
    if (!item.exercise_id) return item.scope === "warmup" ? "warmup" : "session";
    return warmupIds.has(item.exercise_id) ? "warmup" : "exercise";
  };

  const bySection = { session: [], warmup: [], exercise: [] };
  for (const item of items) bySection[kindOf(item)].push(item);

  // A reorder renumbers the WHOLE list in display order, not just the section
  // that moved — so the stored order and what the rail draws can't drift, and
  // a card that changed section gets tidied up on the next drag.
  const handleSectionReorder = (key, next) => {
    const merged = { ...bySection, [key]: next };
    const flat = [...merged.session, ...merged.warmup, ...merged.exercise];
    onReorder(flat.map((item, i) => ({ ...item, position: i + 1 })));
  };

  const handleAdd = async () => {
    const created = await onAdd();
    // Open the new card straight away — it's empty, and the whole reason to
    // add one is to type in it.
    if (created?.id) setOpenId(created.id);
  };

  const visibleSections = SECTIONS.filter((s) => bySection[s.key].length > 0);

  return (
    <View>
      <Eyebrow>COACH EDUCATION</Eyebrow>
      <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", lineHeight: 16, marginTop: 6, marginBottom: 12 }}>
        Shows on Coach Prep for Session {sessionNumber}, every week of this block.
      </Text>

      {error ? (
        <View style={{ marginBottom: 11 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#b23a22", lineHeight: 17 }}>
            Couldn't load these notes.
          </Text>
          <PressFade onPress={onRetry} hitSlop={8} style={{ marginTop: 5, alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </View>
      ) : null}

      {!error && loading ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Loading…</Text>
      ) : null}

      {!error && !loading && items.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", lineHeight: 17, marginBottom: 11 }}>
          Nothing yet. Not every session needs one.
        </Text>
      ) : null}

      {visibleSections.map((section) => (
        <View key={section.key} style={{ marginBottom: 6 }}>
          <Eyebrow style={{ fontSize: 9, marginBottom: 6 }}>{section.label}</Eyebrow>
          <SortableList
            items={bySection[section.key]}
            onReorder={(next) => handleSectionReorder(section.key, next)}
            renderItem={(item, controls) => (
              <EducationCard
                item={item}
                groups={groups}
                expanded={openId === item.id}
                onToggle={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
                onChange={onChange}
                onRemove={onRemove}
                controls={controls}
              />
            )}
          />
        </View>
      ))}

      {!error ? (
        <Pressable
          onPress={handleAdd}
          style={{
            borderWidth: 1,
            borderColor: "#e0b6a5",
            borderStyle: "dashed",
            borderRadius: 10,
            paddingVertical: 11,
            marginTop: 4,
          }}
        >
          <Text style={{ textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            + Add a note
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
