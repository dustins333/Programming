import React from "react";
import { Text } from "react-native";
import { colors, fonts, type } from "../lib/theme";

// The one shared eyebrow — uppercase, letter-spaced section/label text used
// above cards and inside heroes across the member app. Five near-identical
// local copies existed before this (My Week, Nutrition Today, Weekly, Photos,
// StatTile, Settings), at 9.5–10px and #a8a29e, which was the single most
// common "too small to read" pattern in the 2026-08-18 audit. Letter-spaced
// caps read smaller than their number, so the floor is `type.eyebrow` (11)
// and the default colour is `colors.muted`, not the decorative grey.
//
// `color` is still overridable for the dark heroes (cream/ochre on #33251f).
export function Eyebrow({ children, color = colors.muted, size = type.eyebrow, letterSpacing = 1, style, numberOfLines }) {
  return (
    <Text
      maxFontSizeMultiplier={1.1}
      numberOfLines={numberOfLines}
      style={[{ fontFamily: fonts.sansBold, fontSize: size, letterSpacing, textTransform: "uppercase", color }, style]}
    >
      {children}
    </Text>
  );
}
