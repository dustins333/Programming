// Generic "here's everything logged so far" list — reused by both SPC
// (each row = one session) and Other (each row = one line item), reached
// by tapping a tile's numbered badge. Tapping a row reopens that specific
// entry's own edit popup.
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";
import { PayrollBottomSheet } from "./PayrollBottomSheet";

export function EntryListPopup({ visible, onClose, title, items, onSelectItem }) {
  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={title}>
      {items.length === 0 ? (
        <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Nothing logged yet.
        </Text>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelectItem(item)}
            className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-4 py-3.5"
            style={{ borderWidth: 1, borderColor: "#ece7e1" }}
          >
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
        ))
      )}
    </PayrollBottomSheet>
  );
}
