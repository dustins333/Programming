// Log (or edit) one SPC session for the selected date. The SPC tile's +
// opens this for a new session; tapping a row in the count chip's list
// reopens it pre-filled for that session.
//
// Head count drives everything: pick 4 and four name rows appear, delete a
// row and the count drops with it, so the two can never disagree. Names stay
// optional — a session logs on head count alone, which is the common case
// when a coach is entering three days at once. SPC pay is a flat rate per
// session tiered by that head count, so the number is the thing that has to
// be right; the names are for the coach's own recall.
//
// Stored as newline-joined text in spc_notes, the column the free-text
// "who attended" field already wrote to — the same convention program_notes
// / welcome_notes / strategy_notes use, and no migration.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { PayrollBottomSheet, SheetSaveButton, SheetDeleteButton, SheetLabel, SheetNameRow, SheetTextInput } from "./PayrollBottomSheet";
import { SpcAttendeePicker } from "./SpcAttendeePicker";
import { confirmDeletePayrollEntry } from "../../lib/confirmDialog";
import { toastError } from "../../lib/toast";

// A session's stored text is names first, then anything else the coach
// typed. Only the first `attendees` lines are treated as names so a note
// added when the head count was higher can't silently become one.
function splitNotes(notes, attendees) {
  const lines = (notes || "").split("\n");
  const names = lines.slice(0, Math.max(0, attendees ?? 0));
  const rest = lines.slice(Math.max(0, attendees ?? 0)).join("\n").trim();
  return { names, rest };
}

function joinNotes(names, note) {
  const body = names.map((n) => n.trim()).join("\n");
  if (!note.trim()) return body.trim() ? body : "";
  return body.trim() ? `${body}\n${note.trim()}` : note.trim();
}

export function SpcSessionPopup({ visible, onClose, onSave, onDelete, initial, subtitle }) {
  const [attendees, setAttendees] = useState(null);
  const [names, setNames] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const count = initial?.attendees ?? null;
    const { names: parsed, rest } = splitNotes(initial?.notes, count);
    setAttendees(count);
    setNames(Array.from({ length: count ?? 0 }, (_, i) => parsed[i] || ""));
    setNote(rest);
  }, [visible, initial]);

  // Picking a head count grows or trims the rows to match, keeping whatever
  // was already typed in the rows that survive.
  const pickAttendees = (n) => {
    setAttendees(n);
    setNames((prev) => Array.from({ length: n }, (_, i) => prev[i] || ""));
  };

  // Deleting a row is also how you drop the head count — that's the whole
  // point of tying them together, so it decrements rather than leaving a
  // gap the count no longer matches.
  const removeName = (i) => {
    setNames((prev) => prev.filter((_, idx) => idx !== i));
    setAttendees((prev) => Math.max(0, (prev ?? 1) - 1));
  };

  const handleSave = async () => {
    if (attendees === null) {
      toastError("Pick how many attendees were in this session");
      return;
    }
    setSaving(true);
    try {
      await onSave({ attendees, notes: joinNotes(names, note) });
      onClose();
    } catch (err) {
      toastError("Failed to save SPC session", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmDeletePayrollEntry(`${attendees ?? "?"} attendee${attendees === 1 ? "" : "s"} SPC session`);
    if (!ok) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      toastError("Failed to delete", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={initial ? "Edit SPC session" : "SPC session"} subtitle={subtitle}>
      <SheetLabel>ATTENDEES</SheetLabel>
      <View className="mb-3.5">
        <SpcAttendeePicker value={attendees} onChange={pickAttendees} />
      </View>

      {attendees ? (
        <>
          <SheetLabel trailing="Optional">WHO CAME</SheetLabel>
          {names.map((name, i) => (
            <SheetNameRow
              key={i}
              index={i + 1}
              value={name}
              onChangeText={(v) => setNames((prev) => prev.map((n, idx) => (idx === i ? v : n)))}
              placeholder="Name"
              onRemove={() => removeName(i)}
            />
          ))}
        </>
      ) : null}

      <View className="mb-3.5 mt-1" style={{ borderRadius: 11, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "#faf8f6" }}>
        <SheetTextInput value={note} onChangeText={setNote} placeholder="Note (optional)" multiline />
      </View>

      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : initial ? "Save session" : "Log session"} />
      {initial && onDelete ? (
        <SheetDeleteButton onPress={handleDelete} disabled={deleting} label={deleting ? "Deleting…" : "Delete this session"} />
      ) : null}
    </PayrollBottomSheet>
  );
}
