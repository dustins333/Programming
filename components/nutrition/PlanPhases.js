import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import {
  createPhase,
  updatePhase,
  deletePhase,
  addPhaseItem,
  updatePhaseItem,
  deletePhaseItem,
  reorderPhases,
  setPhaseStatus,
} from "../../lib/nutrition/planPhases";
import { SortableList } from "../SortableList";
import { confirmDeletePhase, confirmRemovePhaseItem } from "../../lib/confirmDialog";
import { fonts, colors } from "../../lib/theme";
import { toastError } from "../../lib/toast";

// Coach-side editor for a client's plan phases (migration 0050).
//
// Everything is edited in place on the card — no form modal. "+ New phase"
// drops a blank card in and the coach types straight into it. Only whole
// phase cards drag (SortableList); the bullets under them are a plain list,
// deliberately not reorderable, so a drag can never be ambiguous about
// whether it's moving a phase or a line inside one.
//
// Phases aren't dated: top of the list is what's happening now, and dragging
// a card is how the coach says "this one's next".

// Saves on blur (or Enter), reverts on failure. Used for every field on a
// card, so there's no save button anywhere in here.
function InlineField({ value, placeholder, onSave, allowEmpty = false, textStyle, className, multiline = false }) {
  const [text, setText] = useState(value ?? "");
  // Enter fires onSubmitEditing and then onBlur, so without this a single
  // Enter would write the same value twice.
  const committing = useRef(false);

  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  const commit = async () => {
    if (committing.current) return;
    const trimmed = text.trim();
    if (trimmed === (value ?? "")) return;
    if (!trimmed && !allowEmpty) {
      setText(value ?? "");
      return;
    }
    committing.current = true;
    try {
      await onSave(trimmed);
    } catch (err) {
      toastError("Failed to save", err);
      setText(value ?? "");
    } finally {
      committing.current = false;
    }
  };

  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder={placeholder}
      placeholderTextColor="#c3bdb4"
      multiline={multiline}
      className={className}
      style={textStyle}
    />
  );
}

function BulletRow({ item, onChanged }) {
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!(await confirmRemovePhaseItem(item.text))) return;
    setBusy(true);
    try {
      await deletePhaseItem(item.id);
      await onChanged();
    } catch (err) {
      toastError("Failed to remove", err);
      setBusy(false);
    }
  };

  return (
    <View className="flex-row items-center">
      <Text style={{ color: "#a8a29e", fontSize: 12.5 }}>– </Text>
      <InlineField
        value={item.text}
        onSave={async (t) => {
          await updatePhaseItem(item.id, t);
          await onChanged();
        }}
        className="flex-1 py-0.5"
        textStyle={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#44403c" }}
      />
      <Pressable onPress={handleDelete} disabled={busy} hitSlop={8}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c3bdb4" }}>✕</Text>
      </Pressable>
    </View>
  );
}

// planned → now → done → planned. A badge rather than a menu because it has
// three states and cycling one card is a single click; the card's own colour
// follows it, so which phase she's actually in is readable without reading
// any of the text. `planned` shows nothing at all — an unbadged card is the
// normal case and badging every one of them would be noise.
const PHASE_STATUS_STYLE = {
  planned: { label: null, border: "#f0ddd2", background: "#fdf6f2", badgeBg: null, badgeText: null },
  now: { label: "NOW", border: colors.primary, background: "#fdf6f2", badgeBg: "#f4ddd2", badgeText: "#b23a22" },
  done: { label: "DONE", border: "#dbe8cf", background: "#f4f6f0", badgeBg: "#dbe8cf", badgeText: "#4d6142" },
};
const NEXT_STATUS = { planned: "now", now: "done", done: "planned" };

function PhaseStatusBadge({ status, onPress }) {
  const style = PHASE_STATUS_STYLE[status] ?? PHASE_STATUS_STYLE.planned;
  return (
    <Pressable onPress={onPress} hitSlop={6} className="mr-1.5">
      {style.label ? (
        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: style.badgeBg }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, color: style.badgeText, letterSpacing: 0.4 }}>{style.label}</Text>
        </View>
      ) : (
        <View className="rounded-full px-2 py-0.5" style={{ borderWidth: 1, borderColor: "#e4dcd4" }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 9, color: "#c3bdb4", letterSpacing: 0.4 }}>SET</Text>
        </View>
      )}
    </Pressable>
  );
}

function PhaseCard({ phase, controls, onChanged }) {
  // null = not adding; a string = a draft bullet being typed. Opened by the
  // "+" button rather than sitting there as a permanent empty input: a
  // persistent input fought the refetch that follows every save, so pressing
  // Enter paused, dropped focus, and needed a second click to carry on.
  const [draftItem, setDraftItem] = useState(null);
  const committingItem = useRef(false);

  // Enter fires onSubmitEditing *and* then onBlur as the field unmounts, so
  // without this guard a single Enter adds the bullet twice.
  const commitItem = async () => {
    if (committingItem.current) return;
    committingItem.current = true;
    const trimmed = (draftItem ?? "").trim();
    // Closed before the await, so the row never sits there half-alive
    // waiting on the round-trip.
    setDraftItem(null);
    if (!trimmed) {
      committingItem.current = false;
      return;
    }
    try {
      await addPhaseItem(phase.id, trimmed);
      await onChanged();
    } catch (err) {
      toastError("Failed to add", err);
    } finally {
      committingItem.current = false;
    }
  };

  const handleDeletePhase = async () => {
    if (!(await confirmDeletePhase(phase.title))) return;
    try {
      await deletePhase(phase.id);
      await onChanged();
    } catch (err) {
      toastError("Failed to delete phase", err);
    }
  };

  const status = phase.status ?? "planned";
  const statusStyle = PHASE_STATUS_STYLE[status] ?? PHASE_STATUS_STYLE.planned;

  const handleCycleStatus = async () => {
    try {
      await setPhaseStatus(phase.id, NEXT_STATUS[status]);
      await onChanged();
    } catch (err) {
      toastError("Failed to change the phase status", err);
    }
  };

  return (
    <View
      className="mb-1.5 rounded-lg px-2.5 py-2"
      style={{ borderWidth: status === "now" ? 1.5 : 1, borderColor: statusStyle.border, backgroundColor: statusStyle.background }}
    >
      <View className="flex-row items-center">
        {controls}
        <PhaseStatusBadge status={status} onPress={handleCycleStatus} />
        <InlineField
          value={phase.title}
          placeholder="Phase name"
          onSave={async (t) => {
            await updatePhase(phase.id, { title: t, details: phase.details });
            await onChanged();
          }}
          className="flex-1 py-0.5"
          textStyle={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}
        />
        <Pressable onPress={handleDeletePhase} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c3bdb4" }}>✕</Text>
        </Pressable>
      </View>

      <InlineField
        value={phase.details}
        placeholder="Note (optional)"
        allowEmpty
        onSave={async (t) => {
          await updatePhase(phase.id, { title: phase.title, details: t });
          await onChanged();
        }}
        className="py-0.5"
        textStyle={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}
      />

      <View className="mt-1">
        {phase.items.map((item) => (
          <BulletRow key={item.id} item={item} onChanged={onChanged} />
        ))}
        {draftItem !== null ? (
          <View className="flex-row items-center">
            <Text style={{ color: "#a8a29e", fontSize: 12.5 }}>– </Text>
            <TextInput
              value={draftItem}
              onChangeText={setDraftItem}
              onSubmitEditing={commitItem}
              onBlur={commitItem}
              autoFocus
              placeholderTextColor="#c3bdb4"
              className="flex-1 py-0.5"
              style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#44403c" }}
            />
          </View>
        ) : (
          <Pressable onPress={() => setDraftItem("")} hitSlop={6} className="self-start py-0.5">
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primaryOnWhite }}>+ Add bullet</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// A card that doesn't exist in the database yet — "+ New phase" shows this
// blank, and it becomes a real phase the moment the name is filled in.
// Bullets can only be added once it's real (they need a phase_id), which
// falls out naturally: name it, then it turns into a normal card.
function DraftPhaseCard({ onCreate, onCancel }) {
  const [title, setTitle] = useState("");
  // Same Enter-then-blur double-fire guard as the bullet draft above — a ref,
  // not state, because both handlers run before a setState would apply.
  const committing = useRef(false);

  const commit = async () => {
    if (committing.current) return;
    committing.current = true;
    const trimmed = title.trim();
    if (!trimmed) {
      onCancel();
      committing.current = false;
      return;
    }
    try {
      await onCreate({ title: trimmed });
    } catch (err) {
      toastError("Failed to add phase", err);
      committing.current = false;
    }
  };

  return (
    <View className="mb-1.5 rounded-lg border px-2.5 py-2" style={{ borderColor: "#f0ddd2", backgroundColor: "#fdf6f2" }}>
      <View className="flex-row items-center">
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={commit}
          onBlur={commit}
          autoFocus
          placeholder="Phase name"
          placeholderTextColor="#c3bdb4"
          className="flex-1 py-0.5"
          style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}
        />
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c3bdb4" }}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PlanPhases({ userId, coachId, phases, onChanged }) {
  const [order, setOrder] = useState(phases);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    setOrder(phases);
  }, [phases]);

  // Optimistic, same reasoning as FocusChecklist: onChanged() is a full page
  // refetch, and waiting on it makes a dropped card snap back first.
  const handleReorder = (reordered) => {
    setOrder(reordered);
    reorderPhases(reordered.map((p, i) => ({ id: p.id, position: i + 1 }))).catch((err) =>
      toastError("Couldn't save the new order", err)
    );
  };

  return (
    <View>
      {order.length > 0 ? (
        <>
          <Text className="mb-1.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            Top of the list is what&apos;s happening now. Drag a card to move it.
          </Text>
          <SortableList
            items={order}
            onReorder={handleReorder}
            renderItem={(phase, controls) => <PhaseCard phase={phase} controls={controls} onChanged={onChanged} />}
          />
        </>
      ) : !drafting ? (
        <Text className="mb-1.5 text-sm text-stone-400" style={{ fontFamily: fonts.sans }}>
          No phases yet. Map out what this client is working on now and what comes after it.
        </Text>
      ) : null}

      {drafting ? (
        <DraftPhaseCard
          onCancel={() => setDrafting(false)}
          onCreate={async (fields) => {
            await createPhase(userId, fields, coachId);
            setDrafting(false);
            await onChanged();
          }}
        />
      ) : (
        <Pressable onPress={() => setDrafting(true)} className="self-start rounded border border-stone-300 px-2.5 py-1">
          <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
            + New phase
          </Text>
        </Pressable>
      )}
    </View>
  );
}
