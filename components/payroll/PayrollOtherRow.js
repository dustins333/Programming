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
// all) — but a type with notes still waits for the Add tap to open
// OtherItemPopup for that, since a free-text note genuinely benefits from
// the bigger popup and this flow already worked fine. Adding skips the
// popup entirely for a type with no notes at all — there'd be nothing left
// for the popup to collect once qty's already been typed here.
//
// The "add this line item" action is an explicit Add button, not the
// checkmark it used to be: since the day-submit rework the checkmark means
// one thing everywhere on this screen — hollow once entered, solid once the
// whole day has been submitted — so it can't double as this row's own
// action button.
import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, Platform } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { TileBadge, TileCheckmark, TILE_BG, TILE_BORDER } from "./PayrollTile";
import { NativePickerField } from "../NativePickerField";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { toastError } from "../../lib/toast";

const isWeb = Platform.OS === "web";

export function PayrollOtherRow({ otherRates, items, onOpenNewItem, onViewList, submitted = false }) {
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

  const hasItems = items.length > 0;

  return (
    <View
      style={{
        position: "relative",
        borderWidth: submitted ? 2 : 1,
        borderColor: submitted ? TILE_BORDER.solid : TILE_BORDER.idle,
        borderRadius: 18,
        backgroundColor: submitted ? TILE_BG.solid : TILE_BG.idle,
        padding: 16,
        paddingBottom: hasItems ? 28 : 16,
      }}
    >
      {hasItems ? <TileBadge count={items.length} onPress={onViewList} /> : null}
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
      {selectedType ? (
        <Pressable onPress={handleConfirm} className="mt-3 items-center rounded-xl px-4 py-2.5" style={{ backgroundColor: colors.primary }}>
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
            Add
          </Text>
        </Pressable>
      ) : null}
      {/* The badge already says how many are logged — this is only here to
          make it obvious you can add more than one, same reasoning as the
          SPC tile's caption. */}
      {hasItems ? (
        <Text className="mt-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          Pick another type above to add another
        </Text>
      ) : null}
      {hasItems ? <TileCheckmark solid={submitted} /> : null}
    </View>
  );
}
