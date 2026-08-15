// Opened from the caption under the Welcome / Strategy / Programs Written
// counters — one row per session, holding who it was for. Names are joined
// newline-separated into the core row's welcome_notes / strategy_notes /
// program_notes column, the same free-text convention spc_notes already
// uses.
//
// The rows ARE the count. Adding a row increments the tile's counter and
// removing one decrements it, so the two can never disagree — previously
// the sheet rendered exactly `count` fixed inputs and the only way to log a
// fourth session was to close the sheet, tap +, and come back. Names stay
// optional: a blank row still counts, so "three sessions, I only remember
// two names" is a row left empty rather than a count that's now wrong.
import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { fonts } from "../../lib/theme";
import { PayrollBottomSheet, SheetSaveButton, SheetNameRow } from "./PayrollBottomSheet";
import { toastError } from "../../lib/toast";

export function NamesListPopup({ visible, onClose, title, subtitle, count, initialNotes, onSave }) {
  const [names, setNames] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const existing = (initialNotes || "").split("\n").filter(Boolean);
    // The counter is what's authoritative on open — a coach who tapped the
    // tile up to 3 gets three rows even with only two names saved.
    setNames(Array.from({ length: Math.max(count, existing.length) }, (_, i) => existing[i] || ""));
  }, [visible, count, initialNotes]);

  const updateName = (i, value) => setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  const removeName = (i) => setNames((prev) => prev.filter((_, idx) => idx !== i));
  const addName = () => setNames((prev) => [...prev, ""]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Trailing blanks are dropped from the count as well as the text — a
      // row you added and then didn't use isn't a session you ran.
      let effective = [...names];
      while (effective.length && !effective[effective.length - 1].trim()) effective.pop();
      await onSave(effective.map((n) => n.trim()).filter(Boolean).join("\n"), effective.length);
      onClose();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const filled = names.filter((n) => n.trim()).length;

  return (
    <PayrollBottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxHeight="80%"
    >
      <View className="mb-1 flex-row items-baseline justify-between">
        <Text style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, color: "#a8a29e" }}>
          {names.length} {names.length === 1 ? "session" : "sessions"}
        </Text>
        <Text style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, color: "#a8a29e" }}>
          {filled} of {names.length} named
        </Text>
      </View>

      {names.map((name, i) => (
        <SheetNameRow
          key={i}
          index={i + 1}
          value={name}
          onChangeText={(v) => updateName(i, v)}
          placeholder="Client name"
          onRemove={() => removeName(i)}
        />
      ))}

      <SheetNameRow index={names.length + 1} placeholder="Add a name" onAdd={addName} />

      <Text style={{ fontSize: 10.5, lineHeight: 15, color: "#b5aea7", fontFamily: fonts.sans, marginTop: 4, marginBottom: 12 }}>
        Adding or removing a row moves the count on the tile with it — the two never disagree. A row can stay blank if you
        don't want to name it.
      </Text>

      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : "Save names"} />
    </PayrollBottomSheet>
  );
}
