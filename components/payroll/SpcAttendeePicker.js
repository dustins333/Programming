// Extracted from the old flat entry form so both SpcSessionPopup (new tile
// UI) and any future call site share one implementation.
import { View, Pressable, Text } from "react-native";
import { fonts, colors } from "../../lib/theme";

export function SpcAttendeePicker({ value, onChange }) {
  return (
    <View className="mb-1 flex-row gap-2">
      {[0, 1, 2, 3, 4].map((n) => {
        const active = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            className="h-10 w-10 items-center justify-center rounded-full border"
            style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? "#fdf6f2" : "white" }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, color: active ? colors.primaryOnWhite : "#57534e" }}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
