// Head count for one SPC session — 0 to 4, matching payroll.spc_tiers,
// which has exactly those five rows. SPC pays a flat rate per session by
// head count (not per attendee), so this single choice is what determines
// the session's pay.
//
// Equal-width chips rather than the small circles this used to draw: at 40pt
// they were under the 44pt target and read as radio dots beside a label,
// where the number itself is the whole choice.
import { View, Pressable, Text } from "react-native";
import { fonts, colors } from "../../lib/theme";

const COUNTS = [0, 1, 2, 3, 4];

export function SpcAttendeePicker({ value, onChange }) {
  return (
    <View className="flex-row" style={{ gap: 6 }}>
      {COUNTS.map((n) => {
        const active = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityLabel={`${n} attendee${n === 1 ? "" : "s"}`}
            className="flex-1 items-center"
            style={{
              borderWidth: 1,
              borderColor: active ? colors.primary : "#ece7e1",
              backgroundColor: active ? colors.primary : "white",
              borderRadius: 11,
              paddingVertical: 10,
            }}
          >
            <Text
              maxFontSizeMultiplier={1.15}
              style={{ fontSize: 13.5, fontFamily: active ? fonts.sansBold : fonts.sansSemiBold, color: active ? "white" : "#78716c" }}
            >
              {n}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
