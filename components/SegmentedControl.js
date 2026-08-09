import { View, Text, Pressable } from "react-native";
import { fonts } from "../lib/theme";

// Simple 2-4 way segmented nav — used by the member Nutrition tab's
// Today/Weekly/Check-In/Photos switcher (each segment is a real route, this
// just renders as tabs and highlights whichever one is active).
// `badges` (optional, array/Set of segment keys) renders a small rust dot
// on those segments — e.g. Check-In when this week's isn't submitted yet.
export function SegmentedControl({ segments, activeKey, onSelect, badges }) {
  const badgeSet = badges ? new Set(badges) : null;
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
            {badgeSet?.has(seg.key) ? (
              <View style={{ position: "absolute", top: 5, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: "#b23a22" }} />
            ) : null}
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
