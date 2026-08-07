import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable } from "react-native";
import { createMilestone, updateMilestone, completeMilestone, deleteMilestone } from "../../lib/nutrition/milestones";
import { confirmDeleteMilestone } from "../../lib/confirmDialog";
import { toastError } from "../../lib/toast";
import { MilestoneCompleteCheckbox } from "./MilestoneCompleteCheckbox";
import { fonts, colors } from "../../lib/theme";

const EMPTY = { title: "", details: "", emoji: "" };
const DETAILS_MIN_HEIGHT = 90;
// Quick-pick row for the common case — the text field next to it still
// takes anything typed/pasted (including via the OS emoji keyboard), this
// is just a shortcut for the celebratory ones a coach reaches for most.
const QUICK_EMOJI = ["🎯", "🔥", "💪", "🏆", "🌟", "✅", "🎉", "👏"];

// Creates a new active milestone, or edits an existing one when `milestone`
// is passed — same isEdit-via-optional-prop shape as NewGroupProgramModal.
// This modal is only ever reached for an active milestone (the 3-slot row
// only shows active ones) — completing here always closes it out and closes
// the modal. Also exposes Delete (removes it outright, including from
// history — a plain mistaken-entry fix, distinct from completing).
export function MilestoneFormModal({ visible, milestone, userId, createdBy, onClose, onChanged }) {
  const isEdit = !!milestone;
  const [form, setForm] = useState(EMPTY);
  const [detailsHeight, setDetailsHeight] = useState(DETAILS_MIN_HEIGHT);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(milestone ? { title: milestone.title, details: milestone.details ?? "", emoji: milestone.emoji ?? "" } : EMPTY);
      setDetailsHeight(DETAILS_MIN_HEIGHT);
    }
  }, [visible, milestone]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await updateMilestone(milestone.id, form);
      } else {
        await createMilestone(userId, form, createdBy);
      }
      await onChanged();
      onClose();
    } catch (err) {
      toastError("Failed to save milestone", err);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setBusy(true);
    try {
      await completeMilestone(milestone.id);
      await onChanged();
      onClose();
    } catch (err) {
      toastError("Failed to close out milestone", err);
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmDeleteMilestone(milestone.title);
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteMilestone(milestone.id);
      await onChanged();
      onClose();
    } catch (err) {
      toastError("Failed to delete milestone", err);
    } finally {
      setBusy(false);
    }
  };

  const disabled = saving || busy;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md rounded-2xl bg-white p-6">
          <Text className="mb-4 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
            {isEdit ? "Edit milestone" : "New milestone"}
          </Text>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Title
          </Text>
          <TextInput
            value={form.title}
            onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="e.g. Hit 10,000 steps 5x this week"
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans }}
          />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Details
          </Text>
          <TextInput
            value={form.details}
            onChangeText={(v) => setForm((f) => ({ ...f, details: v }))}
            onContentSizeChange={(e) => setDetailsHeight(Math.max(DETAILS_MIN_HEIGHT, e.nativeEvent.contentSize.height))}
            multiline
            placeholder="Supporting details, visible to the client…"
            className="mb-5 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans, textAlignVertical: "top", height: detailsHeight }}
          />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Emoji (shown when this is completed)
          </Text>
          <View className="mb-2 flex-row flex-wrap gap-2">
            {QUICK_EMOJI.map((e) => (
              <Pressable
                key={e}
                onPress={() => setForm((f) => ({ ...f, emoji: e }))}
                className="items-center justify-center rounded-lg border"
                style={{ width: 38, height: 38, borderColor: form.emoji === e ? colors.primary : "#d9d4cd", backgroundColor: form.emoji === e ? "#fdf6f2" : "white" }}
              >
                <Text style={{ fontSize: 18 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={form.emoji}
            onChangeText={(v) => setForm((f) => ({ ...f, emoji: v }))}
            placeholder="Or type/paste any emoji"
            maxLength={4}
            className="mb-5 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans, width: 140 }}
          />

          {isEdit ? (
            <View className="mb-4 flex-row flex-wrap items-center justify-between gap-4">
              <MilestoneCompleteCheckbox completed={false} onToggle={handleComplete} busy={disabled} />
              <Pressable onPress={handleDelete} disabled={disabled} hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansMedium, color: "#b23a22", fontSize: 13 }}>Delete</Text>
              </Pressable>
            </View>
          ) : null}

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} disabled={disabled} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={disabled || !form.title.trim()}
              className="rounded-lg px-4 py-3 disabled:opacity-50"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
