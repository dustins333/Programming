// Full-width "Other" row — a type dropdown (defaults blank; web gets a
// real <select>, native gets NativePickerField — a tap-to-open modal list,
// same pattern already used for the announcement date/time pickers. An
// earlier version used a wrapping pill row for the 19 other_rates options
// on native, which read badly once there were more than a couple — direct
// feedback confirmed it needed to go) plus a checkmark that opens
// OtherItemPopup for a brand-new line item. Repeatable per date: the
// dropdown resets to blank after each save, ready to pick another type
// immediately; the badge (top-right, via the shared PayrollTile chrome)
// shows how many are already logged and opens the list to review/edit
// them.
import { useState } from "react";
import { View, Text, Platform } from "react-native";
import { fonts } from "../../lib/theme";
import { TileBadge, TileCheckmark } from "./PayrollTile";
import { NativePickerField } from "../NativePickerField";

const isWeb = Platform.OS === "web";

export function PayrollOtherRow({ otherRates, items, onOpenNewItem, onViewList }) {
  const [selectedType, setSelectedType] = useState("");

  const handleConfirm = () => {
    if (!selectedType) return;
    onOpenNewItem(selectedType);
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
              {r.other_type} (${Number(r.rate).toFixed(2)}/{r.unit})
            </option>
          ))}
        </select>
      ) : (
        <NativePickerField
          options={otherRates.map((r) => ({ value: r.other_type, label: `${r.other_type} ($${Number(r.rate).toFixed(2)}/${r.unit})` }))}
          value={selectedType}
          onChange={setSelectedType}
          placeholder="— Select —"
        />
      )}
      {selectedType ? <TileCheckmark solid={false} onPress={handleConfirm} /> : null}
    </View>
  );
}
