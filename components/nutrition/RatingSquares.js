import { View, Text } from "react-native";
import { PressFade } from "../PressFade";
import { fonts } from "../../lib/theme";

// design_handoff_member_mobile_v5 (1g) — the 1–5 scales (sleep quality,
// hunger, energy) as five tappable squares instead of a dropdown. House
// rule 1 again: dashed outlines while nothing is picked, solid once it is.
// Tapping the already-selected square clears it, so a mis-tap is
// recoverable without a separate "clear" affordance.
//
// Deliberately a new component rather than a rewrite of RatingSelect —
// that one is still the right control inside the coach's own forms, where
// it sits in a shared flex-row with TargetField and has to match its
// height exactly.
const CLAY = "#a46a57";
const UNSELECTED_BG = "#f5f1ec";
const DASHED_EMPTY = "#ddd6cd";

export function RatingSquares({ label, value, onChangeText, size = 26, compact, readOnly }) {
  const empty = value === "" || value === null || value === undefined;
  return (
    <View style={compact ? undefined : { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      {label ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: compact ? fonts.sans : fonts.sansMedium, fontSize: compact ? 10.5 : 13.5, color: compact ? "#a8a29e" : "#44403c", marginBottom: compact ? 4 : 0 }}
        >
          {label}
        </Text>
      ) : null}
      {/* In compact mode (inside the sleep tile) the squares stretch to the
          full width of their card instead of sitting at a fixed size —
          five 20px squares left a dead gap on the right of the tile. */}
      <View style={{ flexDirection: "row", gap: 5, ...(compact ? { alignSelf: "stretch" } : null) }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = !empty && Number(value) === n;
          return (
            <PressFade
              key={n}
              onPress={readOnly ? undefined : () => onChangeText(selected ? "" : String(n))}
              disabled={readOnly}
              accessibilityLabel={`${label ?? "Rating"} ${n} of 5`}
              // The square itself is small by design; hitSlop is what gets
              // the real tap target to 44pt (house rule 6).
              hitSlop={{ top: 9, bottom: 9, left: 3, right: 3 }}
              pressedOpacity={0.6}
              style={{
                ...(compact ? { flex: 1 } : { width: size }),
                height: size,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? CLAY : empty ? "transparent" : UNSELECTED_BG,
                borderWidth: empty ? 1.5 : 0,
                borderStyle: "dashed",
                borderColor: DASHED_EMPTY,

              }}
            >
              <Text
                maxFontSizeMultiplier={1}
                style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: selected ? "#fff" : empty ? "#c9c4bd" : "#8a7f76" }}
              >
                {n}
              </Text>
            </PressFade>
          );
        })}
      </View>
    </View>
  );
}
