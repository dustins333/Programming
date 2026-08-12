// Opened from the "+ Add names" line under the Welcome/Strategy/Programs
// Written counters — one name box per session counted on the tile (count
// comes from that tile's own counter, not stored separately). Names are
// joined newline-separated into the core row's welcome_notes/
// strategy_notes/program_notes column, same free-text convention spc_notes
// already used.
import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { fonts } from "../../lib/theme";
import { PayrollBottomSheet, SheetSaveButton } from "./PayrollBottomSheet";
import { toastError } from "../../lib/toast";

export function NamesListPopup({ visible, onClose, title, count, initialNotes, onSave }) {
  const [names, setNames] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const existing = (initialNotes || "").split("\n").filter(Boolean);
    setNames(Array.from({ length: count }, (_, i) => existing[i] || ""));
  }, [visible, count, initialNotes]);

  const updateName = (i, value) => {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(names.filter(Boolean).join("\n"));
      onClose();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={title}>
      {names.map((name, i) => (
        <View key={i} className="mb-3">
          <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
            Name {i + 1}
          </Text>
          <TextInput
            value={name}
            onChangeText={(v) => updateName(i, v)}
            placeholder="Client name"
            className="rounded-lg border border-stone-300 px-3 py-2.5"
            style={{ fontFamily: fonts.sans }}
          />
        </View>
      ))}
      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : "Save"} />
    </PayrollBottomSheet>
  );
}
