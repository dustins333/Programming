import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Eyebrow, BUILDER_CARD_BORDER } from "./SessionBuilderParts";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// The "coach education" tab of the group builder's right rail.
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
// Saves are debounced-then-persisted through the parent's `track`, so they
// feed the same header "Saved" light every other write on this screen does.
// The debounce timer is deliberately NOT cleared on unmount: a cleanup fires
// on every dep change and would silently drop the last thing typed. A write
// landing after its row was deleted is a harmless no-op update.

const SAVE_DELAY = 700;

// "General warm-up" has no exercise id to carry, so the select needs a
// sentinel for it. It can't collide with a real uuid.
const GENERAL_WARMUP = "__warmup__";

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

function EducationCard({ item, groups, onChange, onRemove }) {
  // Flattened only to answer "is this row's exercise still programmed?" —
  // the dropdown itself keeps the groups so warm-ups stay separated.
  const all = groups.flatMap((g) => g.items);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: BUILDER_CARD_BORDER,
        borderRadius: 12,
        backgroundColor: "#fdf6f2",
        padding: 11,
        marginBottom: 11,
      }}
    >
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
  );
}

export function CoachEducationRail({ sessionNumber, items, lifts, warmups, loading, error, onAdd, onChange, onRemove, onRetry }) {
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

      {items.map((item) => (
        <EducationCard key={item.id} item={item} groups={groups} onChange={onChange} onRemove={onRemove} />
      ))}

      {!error ? (
        <Pressable
          onPress={onAdd}
          style={{
            borderWidth: 1,
            borderColor: "#e0b6a5",
            borderStyle: "dashed",
            borderRadius: 10,
            paddingVertical: 11,
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
