import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import {
  addFocusItem,
  editFocusItem,
  toggleFocusItem,
  deleteFocusItem,
  reorderFocusItems,
} from "../../lib/nutrition/coachClient";
import { SortableList } from "../SortableList";
import { fonts, colors } from "../../lib/theme";
import { toastError } from "../../lib/toast";
import { confirmRemoveFocusItem } from "../../lib/confirmDialog";

function FocusItemRow({ item, controls, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    setBusy(true);
    try {
      await toggleFocusItem(item.id, !item.done);
      await onChanged();
    } catch (err) {
      toastError("Failed to update", err);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === item.text) {
      setText(item.text);
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await editFocusItem(item.id, trimmed);
      setEditing(false);
      await onChanged();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!(await confirmRemoveFocusItem(item.text))) return;
    setBusy(true);
    try {
      await deleteFocusItem(item.id);
      await onChanged();
    } catch (err) {
      toastError("Failed to remove", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mb-1.5 flex-row items-center gap-2">
      {controls}
      <Pressable onPress={handleToggle} disabled={busy || editing} hitSlop={8}>
        <View
          className="items-center justify-center rounded border"
          style={{ width: 18, height: 18, borderColor: item.done ? "#4d6142" : "#d6d3d1", backgroundColor: item.done ? "#4d6142" : "transparent" }}
        >
          {item.done ? <Text style={{ color: "white", fontSize: 12, lineHeight: 14 }}>✓</Text> : null}
        </View>
      </Pressable>
      {editing ? (
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={handleSave}
          onSubmitEditing={handleSave}
          autoFocus
          className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
          style={{ fontFamily: fonts.sans }}
        />
      ) : (
        <Text
          className="flex-1"
          style={{ fontFamily: fonts.sans, color: item.done ? "#a8a29e" : "#44403c", textDecorationLine: item.done ? "line-through" : "none" }}
        >
          {item.text}
        </Text>
      )}
      {!editing && (
        <Pressable onPress={() => setEditing(true)} disabled={busy} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>✎</Text>
        </Pressable>
      )}
      <Pressable onPress={handleDelete} disabled={busy} hitSlop={8}>
        <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>✕</Text>
      </Pressable>
    </View>
  );
}

export function FocusChecklist({ userId, items, onChanged }) {
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  // Local mirror of the incoming list purely so a reorder renders instantly.
  // Every other mutation here re-reads through the parent's onChanged(), but
  // that's a full refetch — waiting on it would make a dropped row visibly
  // snap back to where it started first.
  const [order, setOrder] = useState(items);
  useEffect(() => {
    setOrder(items);
  }, [items]);

  const handleReorder = (reordered) => {
    setOrder(reordered);
    reorderFocusItems(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))).catch((err) =>
      toastError("Couldn't save the new order", err)
    );
  };

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      await addFocusItem(userId, newText.trim());
      setNewText("");
      await onChanged();
    } catch (err) {
      toastError("Failed to add focus item", err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <View>
      {order.length === 0 ? (
        <Text className="mb-2 text-sm text-stone-400" style={{ fontFamily: fonts.sans }}>
          No focus items yet.
        </Text>
      ) : (
        <SortableList
          items={order}
          onReorder={handleReorder}
          renderItem={(item, controls) => <FocusItemRow item={item} controls={controls} onChanged={onChanged} />}
        />
      )}
      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={newText}
          onChangeText={setNewText}
          placeholder="New focus item"
          className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
          style={{ fontFamily: fonts.sans }}
        />
        <Pressable onPress={handleAdd} disabled={adding} className="rounded px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
          <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            Add
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
