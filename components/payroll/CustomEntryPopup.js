// Custom amount + description for the selected date — single-per-date by
// design (reopening edits the one existing row).
import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import { fonts } from "../../lib/theme";
import { PayrollBottomSheet, SheetField, SheetSaveButton } from "./PayrollBottomSheet";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { toastError } from "../../lib/toast";

export function CustomEntryPopup({ visible, onClose, initial, onSave }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(initial?.amount != null ? String(initial.amount) : "");
    setDescription(initial?.description ?? "");
  }, [visible, initial]);

  const handleSave = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toastError("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await onSave({ amount: n, description });
      onClose();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title="Custom amount">
      <SheetField label="$ Amount">
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          className="rounded-lg border border-stone-300 px-3 py-2.5"
          style={{ fontFamily: fonts.sans }}
        />
      </SheetField>
      <SheetField label="Description">
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What's this for?"
          className="rounded-lg border border-stone-300 px-3 py-2.5"
          style={{ fontFamily: fonts.sans }}
        />
      </SheetField>
      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : "Save"} />
    </PayrollBottomSheet>
  );
}
