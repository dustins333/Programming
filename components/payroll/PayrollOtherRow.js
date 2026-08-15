// Full-width "Other" panel on the Log grid. Same tile chrome as everything
// else (PayrollTile's panel mode gives it the label row, count chip and
// submitted tick), with its own body: the items already logged for this
// date, each tappable to edit, then a way to add another.
//
// Repeatable per date. The type dropdown is web's real <select> / native's
// NativePickerField — a tap-to-open modal list, the same pattern used for
// the announcement date/time pickers. An earlier version used a wrapping
// pill row for the 19 other_rates options, which read badly past a couple
// of entries; direct feedback confirmed it had to go. Deliberately doesn't
// show each type's pay rate — a coach can already see that on My Pay, and
// repeating it on the entry form was noise.
//
// Quantity and Notes are collected two different ways, per direct feedback
// that opening a popup just to type a number felt like a detour: a type with
// a quantity gets an inline field right here, no popup at all, while a type
// with notes still opens OtherItemPopup on Add, since free text genuinely
// benefits from the bigger sheet. A type with a quantity and no notes saves
// straight from this row — there'd be nothing left for a popup to collect.
//
// Once something is logged the picker collapses behind "+ Add another item":
// the panel's job at that point is showing what's on the day, and a
// permanently-open dropdown under the list read as an unfinished form.
import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, Platform } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { PayrollTile, tileTone } from "./PayrollTile";
import { NativePickerField } from "../NativePickerField";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { toastError } from "../../lib/toast";
import { formatQuantity } from "../../lib/payroll/calc";

const isWeb = Platform.OS === "web";

function ItemRow({ item, tone, state, onPress }) {
  const isSubmitted = state === "submitted";
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center justify-between"
      style={{
        borderRadius: 11,
        borderWidth: 1,
        borderColor: isSubmitted ? "#cbd6bd" : "#ece7e1",
        backgroundColor: isSubmitted ? "#f7faf3" : "white",
        paddingVertical: 9,
        paddingHorizontal: 11,
      }}
    >
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: isSubmitted ? "#2f3a27" : "#44403c" }}>
          {item.other_type}
          {item.other_qty != null && Number(item.other_qty) !== 1 ? ` ×${formatQuantity(item.other_qty)}` : ""}
        </Text>
        {item.notes ? (
          <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.sans, color: tone.caption, marginTop: 2 }}>
            {item.notes}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, color: tone.caption }}>Edit</Text>
    </Pressable>
  );
}

export function PayrollOtherRow({ otherRates, items, onOpenNewItem, onEditItem, state = "empty" }) {
  const [selectedType, setSelectedType] = useState("");
  const [qty, setQty] = useState("1");
  const [adding, setAdding] = useState(false);

  const tone = tileTone(state);
  const hasItems = items.length > 0;
  const selectedConfig = otherRates.find((r) => r.other_type === selectedType);
  const needsQty = selectedType && selectedConfig?.has_qty !== false;
  // Nothing logged yet means there's no "another" to add — the picker is the
  // panel's whole content, so it opens as itself rather than behind a link.
  const pickerOpen = adding || !hasItems;

  // Reset to "1" whenever the type changes (including back to blank) so a
  // stale quantity from a previous type can never carry over.
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
    setAdding(false);
  };

  return (
    <PayrollTile state={state} label="Other" chipCount={items.length}>
      {hasItems ? (
        <View className="mt-2">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} tone={tone} state={state} onPress={() => onEditItem(item)} />
          ))}
        </View>
      ) : null}

      {pickerOpen ? (
        <View className={hasItems ? "mt-1" : "mt-2"}>
          {isWeb ? (
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              style={{ fontFamily: fonts.sans, fontSize: 13, padding: "9px 11px", borderRadius: 11, border: "1px solid #ece7e1", background: "#fff", width: "100%" }}
            >
              <option value="">Pick a type…</option>
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
              placeholder="Pick a type…"
            />
          )}

          {needsQty ? (
            <View className="mt-2 flex-row items-center" style={{ gap: 8 }}>
              <Text style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, color: tone.label }}>Quantity</Text>
              <TextInput
                value={qty}
                onChangeText={setQty}
                keyboardType="decimal-pad"
                inputAccessoryViewID={NUMERIC_DONE_ID}
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  width: 78,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: "#ece7e1",
                  backgroundColor: "white",
                  paddingVertical: 8,
                  paddingHorizontal: 11,
                }}
              />
            </View>
          ) : null}

          {selectedType ? (
            <Pressable
              onPress={handleConfirm}
              className="mt-2.5 items-center"
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 11 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5 }}>
                Add item
              </Text>
            </Pressable>
          ) : null}

          {hasItems ? (
            <Pressable onPress={() => { setAdding(false); setSelectedType(""); }} hitSlop={6} className="mt-2 self-start">
              <Text style={{ fontSize: 11, fontFamily: fonts.sansMedium, color: "#a8a29e" }}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} hitSlop={6} className="self-start">
          <Text style={{ fontSize: 11, fontFamily: fonts.sansMedium, color: tone.caption }}>+ Add another item</Text>
        </Pressable>
      )}
    </PayrollTile>
  );
}
