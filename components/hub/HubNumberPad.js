import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// The hub's big-finger keypad — no OS keyboard on a wall-mounted TV, and even
// on the coach's phone the entry pad is a deliberate "commit on Save" surface
// rather than a live TextInput. Keys ≥72px at TV scale, 56px at phone scale.
const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "back"],
];

export function HubNumberPad({ onKey, onNext, scale = "tv" }) {
  const keySize = scale === "tv" ? 76 : 56;
  const fontSize = scale === "tv" ? 28 : 22;
  const gap = scale === "tv" ? 10 : 8;
  return (
    <View style={{ alignSelf: "center" }}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", marginBottom: gap }}>
          {row.map((key) => (
            <PressFade
              key={key}
              onPress={() => onKey(key)}
              style={{
                width: keySize,
                height: keySize,
                marginHorizontal: gap / 2,
                borderRadius: 14,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "#e0d9d1",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {key === "back" ? (
                <Ionicons name="backspace-outline" size={fontSize} color="#57534e" />
              ) : (
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize, color: "#292524" }}>{key}</Text>
              )}
            </PressFade>
          ))}
        </View>
      ))}
      <PressFade
        onPress={onNext}
        style={{
          height: scale === "tv" ? 60 : 48,
          marginHorizontal: gap / 2,
          borderRadius: 14,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: scale === "tv" ? 20 : 16, color: "white" }}>Next</Text>
      </PressFade>
    </View>
  );
}
