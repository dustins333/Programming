// Generic "here's everything logged so far" list — reused by both SPC
// (each row = one session) and Other (each row = one line item), reached
// by tapping a tile's numbered badge. Tapping a row reopens that specific
// entry's own edit popup; the trailing trash icon deletes it directly —
// neither SPC nor Other has a +/- counter to "delete by decrementing", so
// this is the only way to remove a specific logged session/item.
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";
import { PayrollBottomSheet } from "./PayrollBottomSheet";
import { confirmDeletePayrollEntry } from "../../lib/confirmDialog";
import { toastError } from "../../lib/toast";

export function EntryListPopup({ visible, onClose, title, items, onSelectItem, onDeleteItem }) {
  const handleDelete = async (item) => {
    const ok = await confirmDeletePayrollEntry(item.label);
    if (!ok) return;
    try {
      await onDeleteItem(item);
    } catch (err) {
      toastError("Failed to delete", err);
    }
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={title}>
      {items.length === 0 ? (
        <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Nothing logged yet.
        </Text>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            className="mb-2 flex-row items-center rounded-xl bg-white px-4 py-3.5"
            style={{ borderWidth: 1, borderColor: "#ece7e1" }}
          >
            <Pressable onPress={() => onSelectItem(item)} className="flex-1 flex-row items-center justify-between pr-3">
              <View className="flex-1 pr-3">
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>{item.label}</Text>
                {item.sublabel ? (
                  <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
                    {item.sublabel}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.primaryOnWhite} />
            </Pressable>
            {onDeleteItem ? (
              <Pressable onPress={() => handleDelete(item)} hitSlop={10} className="ml-2 pl-2" style={{ borderLeftWidth: 1, borderLeftColor: "#ece7e1" }}>
                <Ionicons name="trash-outline" size={18} color="#b23a22" />
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </PayrollBottomSheet>
  );
}
