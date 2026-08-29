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
//
// EVERY EDIT IS OPTIMISTIC AND LOCAL. This list used to call the page's own
// onChanged() after each write, which is a ~14-query reload across three
// sequential waves with listPhases in the LAST one — so typing a phase name
// made it vanish, pause, and reappear, and adding a bullet did the same. The
// component now owns the list, applies the change immediately, persists in
// the background, and hands the updated list up via onPhasesChanged so the
// page stays in sync without refetching anything.

// Temp ids for rows that exist on screen but not yet in the database. A
// counter rather than a timestamp so two bullets added in the same
// millisecond can't collide.
let tempSeq = 0;
const nextTempId = () => `temp-${++tempSeq}`;
const isTemp = (id) => typeof id === "string" && id.startsWith("temp-");

// Saves on blur (or Enter), reverts on failure. Used for every field on a
// card, so there's no save button anywhere in here.
function InlineField({ value, placeholder, onSave, allowEmpty = false, editable = true, textStyle, className, multiline = false }) {
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
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor="#c3bdb4"
      multiline={multiline}
      className={className}
      style={textStyle}
    />
  );
}

function BulletRow({ item, onEdit, onDelete }) {
  const [busy, setBusy] = useState(false);
  // A row still being inserted has no real id to update or delete against,
  // and it's replaced within a round-trip anyway.
  const pending = isTemp(item.id);

  const handleDelete = async () => {
    if (!(await confirmRemovePhaseItem(item.text))) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      toastError("Failed to remove", err);
      setBusy(false);
    }
  };

  return (
    <View className="flex-row items-center" style={pending ? { opacity: 0.55 } : null}>
      <Text style={{ color: "#a8a29e", fontSize: 12.5 }}>– </Text>
      <InlineField
        value={item.text}
        editable={!pending}
        onSave={onEdit}
        className="flex-1 py-0.5"
        textStyle={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#44403c" }}
      />
      <Pressable onPress={handleDelete} disabled={busy || pending} hitSlop={8}>
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

function PhaseCard({ phase, controls, actions }) {
  // null = not adding; a string = a draft bullet being typed.
  const [draftItem, setDraftItem] = useState(null);
  // Enter fires onSubmitEditing and, on some platforms, onBlur as focus
  // moves, so without this guard one Enter could add the bullet twice.
  const committingItem = useRef(false);
  const pending = isTemp(phase.id);

  // `keepOpen` is what makes a list of bullets typeable in one go: Enter
  // commits the line and leaves an empty input focused for the next one,
  // rather than closing and asking the coach to find "+ Add bullet" again.
  // Blur means they've gone somewhere else, so that one closes.
  const commitItem = async (keepOpen) => {
    if (committingItem.current) return;
    const trimmed = (draftItem ?? "").trim();
    // Cleared before the await, so the input is never sitting there
    // half-alive waiting on a round-trip.
    setDraftItem(keepOpen ? "" : null);
    if (!trimmed) return;
    committingItem.current = true;
    try {
      await actions.addItem(phase.id, trimmed);
    } finally {
      committingItem.current = false;
    }
  };

  const handleDeletePhase = async () => {
    if (!(await confirmDeletePhase(phase.title))) return;
    actions.removePhase(phase.id);
  };

  const status = phase.status ?? "planned";
  const statusStyle = PHASE_STATUS_STYLE[status] ?? PHASE_STATUS_STYLE.planned;

  return (
    <View
      className="mb-1.5 rounded-lg px-2.5 py-2"
      style={{
        borderWidth: status === "now" ? 1.5 : 1,
        borderColor: statusStyle.border,
        backgroundColor: statusStyle.background,
        opacity: pending ? 0.6 : 1,
      }}
    >
      <View className="flex-row items-center">
        {controls}
        <PhaseStatusBadge status={status} onPress={() => actions.setStatus(phase.id, NEXT_STATUS[status])} />
        <InlineField
          value={phase.title}
          placeholder="Phase name"
          editable={!pending}
          onSave={(t) => actions.patchPhase(phase.id, { title: t, details: phase.details })}
          className="flex-1 py-0.5"
          textStyle={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}
        />
        <Pressable onPress={handleDeletePhase} disabled={pending} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c3bdb4" }}>✕</Text>
        </Pressable>
      </View>

      <InlineField
        value={phase.details}
        placeholder="Note (optional)"
        allowEmpty
        editable={!pending}
        onSave={(t) => actions.patchPhase(phase.id, { title: phase.title, details: t })}
        className="py-0.5"
        textStyle={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}
      />

      <View className="mt-1">
        {phase.items.map((item) => (
          <BulletRow
            key={item.id}
            item={item}
            onEdit={(t) => actions.editItem(phase.id, item.id, t)}
            onDelete={() => actions.removeItem(phase.id, item.id)}
          />
        ))}
        {draftItem !== null ? (
          <View className="flex-row items-center">
            <Text style={{ color: "#a8a29e", fontSize: 12.5 }}>– </Text>
            <TextInput
              value={draftItem}
              onChangeText={setDraftItem}
              onSubmitEditing={() => commitItem(true)}
              onBlur={() => commitItem(false)}
              // Keeps focus through Enter so the next bullet can be typed
              // straight away. Same prop the login screen uses.
              blurOnSubmit={false}
              autoFocus
              placeholder="Add a bullet — Enter for the next one"
              placeholderTextColor="#c3bdb4"
              className="flex-1 py-0.5"
              style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#44403c" }}
            />
          </View>
        ) : (
          <Pressable onPress={() => setDraftItem("")} disabled={pending} hitSlop={6} className="self-start py-0.5">
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
    // onCreate renders the card immediately and persists behind it, so the
    // draft can close now — the title never blinks out of existence.
    onCreate({ title: trimmed });
    committing.current = false;
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

export function PlanPhases({ userId, coachId, phases, onPhasesChanged }) {
  const [order, setOrder] = useState(phases);
  const [drafting, setDrafting] = useState(false);
  // The list is authoritative while this component is mounted, so it's
  // pushed up rather than refetched. Through a ref so the effect below can
  // depend on `order` alone.
  const notifyRef = useRef(onPhasesChanged);
  notifyRef.current = onPhasesChanged;

  // Re-seed only when the page genuinely hands down a different list (its own
  // reload). An optimistic local edit leaves `phases` untouched, so this
  // can't revert one.
  useEffect(() => {
    setOrder(phases);
  }, [phases]);

  useEffect(() => {
    notifyRef.current?.(order);
  }, [order]);

  // Every mutation below writes to local state first and persists after. On
  // failure the toast fires and the local change is rolled back, so the card
  // never quietly disagrees with the database.
  const actions = {
    patchPhase: async (phaseId, fields) => {
      if (isTemp(phaseId)) return;
      const before = order;
      setOrder((prev) => prev.map((p) => (p.id === phaseId ? { ...p, ...fields } : p)));
      try {
        await updatePhase(phaseId, fields);
      } catch (err) {
        setOrder(before);
        throw err; // InlineField reverts its own text and toasts.
      }
    },

    setStatus: async (phaseId, status) => {
      if (isTemp(phaseId)) return;
      const before = order;
      setOrder((prev) => prev.map((p) => (p.id === phaseId ? { ...p, status } : p)));
      try {
        await setPhaseStatus(phaseId, status);
      } catch (err) {
        setOrder(before);
        toastError("Failed to change the phase status", err);
      }
    },

    removePhase: async (phaseId) => {
      const before = order;
      setOrder((prev) => prev.filter((p) => p.id !== phaseId));
      try {
        await deletePhase(phaseId);
      } catch (err) {
        setOrder(before);
        toastError("Failed to delete phase", err);
      }
    },

    addItem: async (phaseId, text) => {
      const tempId = nextTempId();
      const mapItems = (fn) => setOrder((prev) => prev.map((p) => (p.id === phaseId ? { ...p, items: fn(p.items) } : p)));
      mapItems((items) => [...items, { id: tempId, phase_id: phaseId, text }]);
      try {
        const row = await addPhaseItem(phaseId, text);
        mapItems((items) => items.map((i) => (i.id === tempId ? row : i)));
      } catch (err) {
        mapItems((items) => items.filter((i) => i.id !== tempId));
        toastError("Failed to add", err);
      }
    },

    editItem: async (phaseId, itemId, text) => {
      const before = order;
      setOrder((prev) =>
        prev.map((p) => (p.id === phaseId ? { ...p, items: p.items.map((i) => (i.id === itemId ? { ...i, text } : i)) } : p))
      );
      try {
        await updatePhaseItem(itemId, text);
      } catch (err) {
        setOrder(before);
        throw err; // InlineField reverts its own text and toasts.
      }
    },

    removeItem: async (phaseId, itemId) => {
      const before = order;
      setOrder((prev) => (prev.map((p) => (p.id === phaseId ? { ...p, items: p.items.filter((i) => i.id !== itemId) } : p))));
      try {
        await deletePhaseItem(itemId);
      } catch (err) {
        setOrder(before);
        throw err; // BulletRow toasts and clears its own busy state.
      }
    },
  };

  const handleCreatePhase = async ({ title }) => {
    const tempId = nextTempId();
    setDrafting(false);
    setOrder((prev) => [...prev, { id: tempId, user_id: userId, title, details: null, status: "planned", items: [] }]);
    try {
      const row = await createPhase(userId, { title }, coachId);
      setOrder((prev) => prev.map((p) => (p.id === tempId ? row : p)));
    } catch (err) {
      setOrder((prev) => prev.filter((p) => p.id !== tempId));
      toastError("Failed to add phase", err);
    }
  };

  // Optimistic, same reasoning as FocusChecklist: waiting on the write makes
  // a dropped card snap back first. A list still holding a not-yet-created
  // card can't be reordered — those ids don't exist in the database.
  const handleReorder = (reordered) => {
    setOrder(reordered);
    if (reordered.some((p) => isTemp(p.id))) return;
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
            renderItem={(phase, controls) => <PhaseCard phase={phase} controls={controls} actions={actions} />}
          />
        </>
      ) : !drafting ? (
        <Text className="mb-1.5 text-sm text-stone-400" style={{ fontFamily: fonts.sans }}>
          No phases yet. Map out what this client is working on now and what comes after it.
        </Text>
      ) : null}

      {drafting ? (
        <DraftPhaseCard onCancel={() => setDrafting(false)} onCreate={handleCreatePhase} />
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
