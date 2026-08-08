// Full-width Custom row — single-per-date, tapping anywhere (tile body or
// checkmark) opens CustomEntryPopup, pre-filled for editing once one
// exists.
import { View, Text } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { formatMoney } from "../../lib/payroll/calc";
import { PayrollTile } from "./PayrollTile";

export function PayrollCustomRow({ custom, onPress }) {
  const checkState = custom ? "solid" : "none";
  return (
    <PayrollTile checkState={checkState} onCheckPress={onPress} onPress={onPress} style={{ minHeight: 80 }}>
      <View className="flex-1 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
            Custom
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
            {custom ? custom.custom_description || "Custom amount" : "Tap to add a custom amount"}
          </Text>
        </View>
        {custom ? <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>{formatMoney(custom.custom_amt)}</Text> : null}
      </View>
    </PayrollTile>
  );
}
