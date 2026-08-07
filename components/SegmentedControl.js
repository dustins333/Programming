import { View, Text, Pressable } from "react-native";
import { fonts } from "../lib/theme";

// Simple 2-4 way segmented nav — used by the member Nutrition tab's
// Today/Weekly/Check-In/Photos switcher (each segment is a real route, this
// just renders as tabs and highlights whichever one is active).
export function SegmentedControl({ segments, activeKey, onSelect }) {
  return (
    <View className="mb-6 flex-row rounded-xl bg-stone-100 p-1">
      {segments.map((seg) => {
        const active = seg.key === activeKey;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onSelect(seg.key)}
            className="flex-1 items-center rounded-lg py-2.5"
            style={active ? { backgroundColor: "white", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 } : undefined}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
              style={{ fontFamily: fonts.sansMedium, color: active ? "#8a5140" : "#78716c", fontSize: 13 }}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
