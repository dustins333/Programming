import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// The five places a coach goes constantly, inside the app bar so they're
// always there and the dashboard scrolls under them
// (design_handoff_coach_dashboard, 4a).
//
// Tiles are flex:1, so gating is pure absence: a nutrition-only coach gets
// three tiles at a third of the width each rather than five with two dead
// ones. Nothing is disabled, nothing leaves a gap.
//
// State is a DOT, never a count — it matches the hamburger badge directly
// above it, where a dot is used precisely because there's no room for a
// number and several badged things would make one number ambiguous.

const VARIANTS = {
  // The coach's own thing, not a client's — every other tile opens somebody
  // else's work, so this one is tinted rather than white.
  tint: { bg: "#fdf6f2", border: "#ecd9cf", icon: colors.primaryOnWhite, label: colors.primaryOnWhite },
  ink: { bg: colors.ink, border: null, icon: "#f7f3ee", label: "#f7f3ee" },
  plain: { bg: "white", border: "#e1dad1", icon: "#78716c", label: "#44403c" },
};

export function QuickPickBar({ tiles, onPress }) {
  if (!tiles.length) return null;
  return (
    <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 12 }}>
      {tiles.map((tile) => {
        const skin = VARIANTS[tile.variant] ?? VARIANTS.plain;
        return (
          <PressFade
            key={tile.key}
            onPress={() => onPress(tile)}
            accessibilityLabel={tile.label}
            style={{
              flex: 1,
              minWidth: 0,
              alignItems: "center",
              gap: 5,
              paddingVertical: 10,
              paddingHorizontal: 3,
              borderRadius: 12,
              backgroundColor: skin.bg,
              borderWidth: skin.border ? 1 : 0,
              borderColor: skin.border ?? undefined,
            }}
          >
            {tile.dot ? (
              <View
                pointerEvents="none"
                style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 99, backgroundColor: tile.dot }}
              />
            ) : null}
            <Ionicons name={tile.icon} size={19} color={skin.icon} />
            <Text
              numberOfLines={1}
              // Pinned: five tiles share one phone width, and there is no
              // slack for a scaled label. The icon above it carries the
              // meaning either way.
              maxFontSizeMultiplier={1}
              style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, color: skin.label }}
            >
              {tile.label}
            </Text>
          </PressFade>
        );
      })}
    </View>
  );
}
