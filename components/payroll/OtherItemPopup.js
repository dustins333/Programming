// Qty + Notes for one "Other" line item — the type itself is chosen on the
// Other row before this opens (see PayrollOtherRow in entries.js); this
// popup only ever edits qty/notes, whether for a brand-new item or an
// existing one reopened from EntryListPopup.
import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import { fonts } from "../../lib/theme";
import { PayrollBottomSheet, SheetField, SheetSaveButton, SheetDeleteButton } from "./PayrollBottomSheet";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { confirmDeletePayrollEntry } from "../../lib/confirmDialog";
import { toastError } from "../../lib/toast";

// `config` is the matching payroll.other_rates row (has_qty/has_notes,
// admin-set on the Payroll Settings tab) — a type with has_qty off always
// saves qty=1 without ever showing the field; has_notes off skips notes
// entirely (saved as null). `hideQtyField` is separate from config: set true
// when opened from PayrollOtherRow's "brand-new item" flow, since that row
// already collects quantity inline before this popup ever opens (per
// direct feedback that waiting on a popup just to type a number was
// unnecessary friction) — `initial.qty` carries that already-collected
// value through untouched. Editing an existing item via EntryListPopup has
// no such inline field, so it leaves this false and shows Quantity here as
// before whenever the type's own config calls for it.
export function OtherItemPopup({ visible, onClose, otherTypeLabel, config, hideQtyField, initial, onSave, onDelete }) {
  const showQty = !hideQtyField && config?.has_qty !== false;
  const showNotes = config?.has_notes !== false;
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      await onSave({ qty: n, notes: showNotes ? notes : "" });
      onClose();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmDeletePayrollEntry(otherTypeLabel || "this item");
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
    <PayrollBottomSheet visible={visible} onClose={onClose} title={otherTypeLabel || "Other"}>
      {showQty ? (
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
      ) : null}
      {showNotes ? (
        <SheetField label="Notes (optional)">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            className="rounded-lg border border-stone-300 px-3 py-2.5"
            style={{ fontFamily: fonts.sans }}
          />
        </SheetField>
      ) : null}
      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : "Save"} />
      {initial && onDelete ? <SheetDeleteButton onPress={handleDelete} disabled={deleting} label={deleting ? "Deleting…" : "Delete this item"} /> : null}
    </PayrollBottomSheet>
  );
}
