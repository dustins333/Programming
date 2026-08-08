// Log (or edit) one SPC session for the selected date — the SPC tile's
// plus button opens this directly for a new session; tapping a row inside
// EntryListPopup reopens it pre-filled for editing that specific session.
import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { fonts } from "../../lib/theme";
import { PayrollBottomSheet, SheetField, SheetSaveButton } from "./PayrollBottomSheet";
import { SpcAttendeePicker } from "./SpcAttendeePicker";
import { toastError } from "../../lib/toast";

export function SpcSessionPopup({ visible, onClose, onSave, initial }) {
  const [attendees, setAttendees] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAttendees(initial?.attendees ?? null);
    setNotes(initial?.notes ?? "");
  }, [visible, initial]);

  const handleSave = async () => {
    if (attendees === null) {
      toastError("Pick how many attendees were in this session");
      return;
    }
    setSaving(true);
    try {
      await onSave({ attendees, notes });
      onClose();
    } catch (err) {
      toastError("Failed to save SPC session", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={initial ? "Edit SPC session" : "Log an SPC session"}>
      <SheetField label="How many attendees?">
        <SpcAttendeePicker value={attendees} onChange={setAttendees} />
      </SheetField>
      <SheetField label="Who attended (optional)">
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Names"
          multiline
          className="rounded-lg border border-stone-300 px-3 py-2.5"
          style={{ fontFamily: fonts.sans, minHeight: 60, textAlignVertical: "top" }}
        />
      </SheetField>
      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : "Save"} />
    </PayrollBottomSheet>
  );
}
