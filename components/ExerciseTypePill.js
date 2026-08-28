import { View, Text } from "react-native";
import { fonts } from "../lib/theme";

// Says whether a library entry is a lift or a warm-up. Those are two
// separate populations that never mix — the builders' pickers filter
// strictly on type, and merging across them is refused outright
// (lib/programming/exerciseMerge.js) — so anywhere both can appear in one
// list needs to say which is which. Warm-ups get the tan treatment they
// already have in the builder sidebars; lifts are left unmarked in lists
// that are mostly lifts (pass `always` where both are equally likely).
//
// maxFontSizeMultiplier is pinned tight: a 9px badge in a table row has no
// room to reflow at Dynamic Type's larger sizes.
export function ExerciseTypePill({ type, always = false, style }) {
  const isWarmup = (type ?? "lift") === "warmup";
  if (!isWarmup && !always) return null;
  return (
    <View
      style={[
        {
          backgroundColor: isWarmup ? "#f5ede4" : "#f1efec",
          borderRadius: 5,
          paddingVertical: 2,
          paddingHorizontal: 6,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.5, color: isWarmup ? "#8a5140" : "#78716c" }}
      >
        {isWarmup ? "WARM-UP" : "LIFT"}
      </Text>
    </View>
  );
}
