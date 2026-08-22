import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { fonts } from "../../lib/theme";

// A phone-shaped 3×4 pad — 1-2-3 / 4-5-6 / 7-8-9 / .-0-⌫ — not a wide flat
// bank of digits. Stacked number keys are what a hand expects, and cornering
// the pad in the dock's bottom-right leaves the strip to its left for the
// label, the calculator and Next, so Next sits under the typing hand rather
// than stretched across the column.
//
// Sized from the width it's given rather than a hardcoded key size: the same
// pad has to sit in a 463px column at four clients and a 390px phone.
const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "back"],
];

export function HubNumberPad({ onKey, width = 214, keyHeight = 44, gap = 6 }) {
  const keyWidth = (width - gap * 2) / 3;
  return (
    <View style={{ width }}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", marginBottom: ri === KEYS.length - 1 ? 0 : gap }}>
          {row.map((key, ki) => (
            <PressFade
              key={key}
              onPress={() => onKey(key)}
              style={{
                width: keyWidth,
                height: keyHeight,
                marginLeft: ki === 0 ? 0 : gap,
                borderRadius: 10,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "#e0d9d1",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {key === "back" ? (
                <Ionicons name="backspace-outline" size={Math.min(22, keyHeight * 0.48)} color="#57534e" />
              ) : (
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: Math.min(24, keyHeight * 0.52), color: "#292524" }}>{key}</Text>
              )}
            </PressFade>
          ))}
        </View>
      ))}
    </View>
  );
}
