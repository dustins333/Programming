import { Platform, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

// The bell she places on the board. Traced from the plastic kettlebells that
// go on the physical Benchmark Highlight Board: a handle arc over a solid
// body, with the number stickered onto the body. The gym has no vector of the
// real thing, so this is the geometry the prototype used.
//
// react-native-svg has no `filter`, so the CSS `drop-shadow(0 0 7px)` glow is
// produced by the wrapping View's shadow instead. On web that is a box-shadow
// on a square box, which would draw a glowing rectangle around a round bell —
// so `borderRadius` on the wrapper keeps the halo the right shape.
export function Kettlebell({ color, size = 34, glow = false, rgb = null, style }) {
  const shadow = glow
    ? Platform.OS === "android"
      ? { elevation: 6 }
      : {
          shadowColor: rgb ? `rgb(${rgb})` : color,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 7,
          shadowOpacity: 0.95,
        }
    : null;

  return (
    <View
      style={[
        { width: size, height: size, alignItems: "center", justifyContent: "center", borderRadius: size / 2 },
        shadow,
        style,
      ]}
    >
      <Svg viewBox="0 0 24 24" width={size} height={size}>
        <Path d="M8.2 8.4a3.9 3.9 0 0 1 7.6 0" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        <Circle cx={12} cy={15.2} r={6.6} fill={color} />
      </Svg>
    </View>
  );
}
