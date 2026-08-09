// Full-width "Other" row — a type dropdown (defaults blank; web gets a
// real <select>, native gets NativePickerField — a tap-to-open modal list,
// same pattern already used for the announcement date/time pickers. An
// earlier version used a wrapping pill row for the 19 other_rates options
// on native, which read badly once there were more than a couple — direct
// feedback confirmed it needed to go). Repeatable per date: the dropdown
// resets to blank after each save, ready to pick another type immediately;
// the badge (top-right, via the shared PayrollTile chrome) shows how many
// are already logged and opens the list to review/edit them. Deliberately
// doesn't show each type's pay rate — per direct ask, a staff member can
// already see that on their own paystub/report page, it doesn't need
// repeating on the entry form itself.
//
// Quantity vs. Notes are handled two different ways, per direct feedback
// that opening a popup just to type a number felt like an unnecessary
// detour: a type with a quantity gets an inline field right in this row
// (expands the moment a type with has_qty is picked, no popup involved at
// all) — but a type with notes still waits for the checkmark tap to open
// OtherItemPopup for that, since a free-text note genuinely benefits from
// the bigger popup and this flow already worked fine. Confirming (the
// checkmark) skips the popup entirely for a type with no notes at all —
// there'd be nothing left for the popup to collect once qty's already been
// typed here.
import { useState, useEffect } from "react";
import { View, Text, TextInput, Platform } from "react-native";
import { fonts } from "../../lib/theme";
import { TileBadge, TileCheckmark } from "./PayrollTile";
import { NativePickerField } from "../NativePickerField";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { toastError } from "../../lib/toast";

const isWeb = Platform.OS === "web";

export function PayrollOtherRow({ otherRates, items, onOpenNewItem, onViewList }) {
  const [selectedType, setSelectedType] = useState("");
  const [qty, setQty] = useState("1");

  const selectedConfig = otherRates.find((r) => r.other_type === selectedType);
  const needsQty = selectedType && selectedConfig?.has_qty !== false;

  // Reset back to "1" whenever the type changes (including clearing back
  // to blank) so a stale quantity from a previous type never carries over.
  useEffect(() => {
    setQty("1");
  }, [selectedType]);

  const handleConfirm = () => {
    if (!selectedType) return;
    const n = needsQty ? Number(qty) : 1;
    if (needsQty && (!Number.isFinite(n) || n <= 0)) {
      toastError("Enter a valid quantity");
      return;
    }
    onOpenNewItem(selectedType, n);
    setSelectedType("");
  };

  return (
    <View
      style={{
        position: "relative",
        borderWidth: items.length > 0 ? 2 : 1,
        borderColor: items.length > 0 ? "#4d6142" : "#f0ddd2",
        borderRadius: 18,
        backgroundColor: items.length > 0 ? "#eef1e7" : "#fdf6f2",
        padding: 16,
        paddingBottom: selectedType ? 30 : 16,
      }}
    >
      {items.length > 0 ? <TileBadge count={items.length} onPress={onViewList} /> : null}
      <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        Other
      </Text>
      {isWeb ? (
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1" }}
        >
          <option value="">— Select —</option>
          {otherRates.map((r) => (
            <option key={r.other_type} value={r.other_type}>
              {r.other_type}
            </option>
          ))}
        </select>
      ) : (
        <NativePickerField
          options={otherRates.map((r) => ({ value: r.other_type, label: r.other_type }))}
          value={selectedType}
          onChange={setSelectedType}
          placeholder="— Select —"
        />
      )}
      {needsQty ? (
        <View className="mt-3 flex-row items-center gap-2">
          <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
            Quantity
          </Text>
          <TextInput
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            className="rounded-lg border border-stone-300 px-3 py-2"
            style={{ fontFamily: fonts.sans, width: 90 }}
          />
        </View>
      ) : null}
      {selectedType ? <TileCheckmark solid={false} onPress={handleConfirm} /> : null}
    </View>
  );
}
