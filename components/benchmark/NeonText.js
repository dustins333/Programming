import { Platform, Text } from "react-native";
import { fonts } from "../../lib/theme";

// The glow is the whole visual identity of Benchmark Day, so it is worth
// saying how it is actually produced.
//
// The design calls for LAYERED glows — `0 0 16px rgba(...,.55), 0 0 42px
// rgba(...,.3)` — a tight core plus a wide halo. React Native's
// textShadowColor/Offset/Radius can only express ONE shadow, so a naive port
// loses the halo and the text reads flat.
//
// react-native-web accepts a raw `textShadow` CSS string as a first-class
// style property (it is in its own allowlist, and its preprocessor
// concatenates it with any derived value — it now warns that the
// `textShadow*` props are the deprecated form). So on web, which is where
// every real user is, we hand it the literal CSS and get the design exactly.
//
// On native we fall back to the single-layer props with the CORE radius: one
// tight glow reads as intentional where one very wide one just reads as
// blurry text. The handoff suggested a duplicated Text behind the real one to
// fake the halo; that was tried against this and rejected — an absolutely
// positioned duplicate has to reproduce the original's line breaking exactly
// or it fringes, and this app has been burned twice by absolutely positioned
// text on Fabric.
export function neonTextShadow(rgb, { core = 16, coreAlpha = 0.55, halo = null, haloAlpha = 0.3 } = {}) {
  if (Platform.OS === "web") {
    const layers = [`0 0 ${core}px rgba(${rgb},${coreAlpha})`];
    if (halo) layers.push(`0 0 ${halo}px rgba(${rgb},${haloAlpha})`);
    return { textShadow: layers.join(", ") };
  }
  return {
    textShadowColor: `rgba(${rgb},${coreAlpha})`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: core,
  };
}

// Protest Strike, glowing. Numbers and titles only — the same rule the rest of
// the app follows for the display face.
export function NeonText({
  children,
  color = "#fff",
  rgb,
  size = 30,
  core = 16,
  coreAlpha = 0.55,
  halo = null,
  haloAlpha = 0.3,
  lineHeight,
  glow = true,
  style,
  numberOfLines,
  // Deliberately pinned by default. These are display numbers inside fixed
  // boxes — a tier number in a 92px column, a value on a 58px kettlebell —
  // and letting them scale with Dynamic Type breaks the board's grid before
  // it helps anyone read it. The body copy around them scales normally.
  maxFontSizeMultiplier = 1,
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        {
          fontFamily: fonts.display,
          fontSize: size,
          lineHeight: lineHeight ?? size,
          color,
        },
        glow && rgb ? neonTextShadow(rgb, { core, coreAlpha, halo, haloAlpha }) : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
