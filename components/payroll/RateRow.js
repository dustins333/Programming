// Extracted from the old admin Pay Periods page so both admin/settings.js
// (core_rates/spc_tiers, edit-only) and its own other_rates section share
// one inline-edit implementation. Every save routes through
// confirmRateChange first — rate edits are retroactive within the
// currently open period (see 0041_payroll_redesign.sql), worth a real
// acknowledgment before it fires.
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { confirmRateChange } from "../../lib/confirmDialog";
import { toastError } from "../../lib/toast";

export function RateRow({ label, unit, value, onSave }) {
  const [editing, setEditing] = useState(null);
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
      <View>
        <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>{label}</Text>
        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          per {unit}
        </Text>
      </View>
      {editing !== null ? (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={editing}
            onChangeText={setEditing}
            keyboardType="decimal-pad"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            className="rounded-lg border border-stone-300 px-2 py-1.5"
            style={{ fontFamily: fonts.sans, width: 70 }}
          />
          <Pressable
            onPress={async () => {
              const n = Number(editing);
              if (!Number.isFinite(n) || n < 0) {
                toastError("Enter a valid rate");
                return;
              }
              const ok = await confirmRateChange(label, value, n);
              if (!ok) return;
              await onSave(n);
              setEditing(null);
            }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setEditing(String(value))}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>${Number(value).toFixed(2)}</Text>
        </Pressable>
      )}
    </View>
  );
}
