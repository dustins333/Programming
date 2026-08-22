import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// The dock: one fixed slot pinned to the bottom-right of a client's column,
// directly under the expanded card, with three interchangeable occupants —
// keypad, calculator, block history. All the same footprint, all dismissable
// with the ⌄, so a column can go back to being just programming without
// collapsing the card it was typing into.
//
// This is what replaced the three-zone card (sets | note | every week side
// by side) from the first pass: that only worked at a 900px column, and
// widening one column means resizing its neighbours — so columns would move
// whenever somebody tapped. Consistency won; the dock is the better answer
// for a 463px column.
//
// Its top border is 2px clay, matching the expanded card above it. That
// pairing is what says "this keypad belongs to THAT lift" on a wall where
// four people are reading at once — alongside the label line
// (BOB · DB BENCH PRESS · SET 2 WEIGHT).

export function HubDock({ label, onDismiss, strip, right, rightWidth, minHeight = 0 }) {
  return (
    <View
      style={{
        borderTopWidth: 2,
        borderTopColor: colors.primary,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 8,
        minHeight,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        {/* Label + whatever that occupant puts under it (Calculator + Next,
            or the totals, or the history explainer). */}
        <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Text
              numberOfLines={3}
              style={{
                flex: 1,
                fontFamily: fonts.sansBold,
                fontSize: 10.5,
                letterSpacing: 0.9,
                lineHeight: 14,
                color: colors.primaryOnWhite,
                textTransform: "uppercase",
              }}
            >
              {label}
            </Text>
            <PressFade
              onPress={onDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: "#f0ddd2",
                backgroundColor: "#fdf6f2",
                alignItems: "center",
                justifyContent: "center",
                marginLeft: 6,
              }}
            >
              <Ionicons name="chevron-down" size={15} color={colors.primaryOnWhite} />
            </PressFade>
          </View>
          <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 8 }}>{strip}</View>
        </View>

        <View style={rightWidth ? { width: rightWidth } : { flexShrink: 1 }}>{right}</View>
      </View>
    </View>
  );
}

// Shared button shapes for the dock's strip. Deliberately real bordered
// buttons at ≥40pt rather than text links — everything in the dock is hit
// with a thumb or a finger on a wall, never a cursor.
export function DockPill({ label, icon, onPress, tone = "outline", disabled = false }) {
  const filled = tone === "filled";
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      style={{
        opacity: disabled ? 0.5 : 1,
        height: 42,
        borderRadius: 12,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled ? colors.primary : "white",
        borderWidth: 1,
        borderColor: filled ? colors.primary : "#e0d9d1",
      }}
    >
      {icon ? <Ionicons name={icon} size={15} color={filled ? "white" : colors.primaryOnWhite} style={{ marginRight: 6 }} /> : null}
      <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: filled ? "white" : "#44403c" }}>
        {label}
      </Text>
    </PressFade>
  );
}
