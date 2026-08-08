// Qty + Notes for one "Other" line item — the type itself is chosen on the
// Other row before this opens (see PayrollOtherRow in entries.js); this
// popup only ever edits qty/notes, whether for a brand-new item or an
// existing one reopened from EntryListPopup.
import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { fonts } from "../../lib/theme";
import { PayrollBottomSheet, SheetField, SheetSaveButton } from "./PayrollBottomSheet";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { toastError } from "../../lib/toast";

export function OtherItemPopup({ visible, onClose, otherTypeLabel, initial, onSave }) {
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQty(String(initial?.qty ?? 1));
    setNotes(initial?.notes ?? "");
  }, [visible, initial]);

  const handleSave = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      toastError("Enter a valid quantity");
      return;
    }
    setSaving(true);
    try {
      await onSave({ qty: n, notes });
      onClose();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={otherTypeLabel || "Other"}>
      <SheetField label="Quantity">
        <TextInput
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          className="rounded-lg border border-stone-300 px-3 py-2.5"
          style={{ fontFamily: fonts.sans, maxWidth: 120 }}
        />
      </SheetField>
      <SheetField label="Notes (optional)">
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          className="rounded-lg border border-stone-300 px-3 py-2.5"
          style={{ fontFamily: fonts.sans }}
        />
      </SheetField>
      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : "Save"} />
    </PayrollBottomSheet>
  );
}
