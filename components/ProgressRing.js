import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fonts, colors } from "../lib/theme";

// Progress ring for My Week's program cards (design_handoff_member_mobile_v5,
// house rule 2): ring fill = completed ÷ target, count in Protest Strike
// inside. Olive ONLY when the target is met; clay while in progress — olive
// means good, never a neutral count.
//
// react-native-svg rather than a conic-gradient (the mock's technique) —
// there's no conic-gradient in RN, and this is the same library TrendChart
// already pulls in, so no new dependency.
const CLAY = "#a46a57";
const OLIVE = "#4d6142";
const TRACK = "#f0ece6";

export function ProgressRing({ size = 38, stroke = 4, completed = 0, target = 0, label }) {
  const met = target > 0 && completed >= target;
  const progress = target > 0 ? Math.max(0, Math.min(1, completed / target)) : 0;
  const color = met ? OLIVE : CLAY;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={center} cy={center} r={radius} stroke={TRACK} strokeWidth={stroke} fill="none" />
        {progress > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference * progress} ${circumference}`}
            strokeLinecap="round"
            // Start the arc at 12 o'clock instead of 3 o'clock.
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <Text
        maxFontSizeMultiplier={1}
        // The count itself reads in the darker brand text while in progress —
        // clay at 11–12px is under 3:1 on white. The ring keeps clay.
        style={{ fontFamily: fonts.display, fontSize: size <= 34 ? 11 : 12, color: met ? OLIVE : colors.primaryOnWhite, includeFontPadding: false }}
      >
        {label ?? `${completed}/${target}`}
      </Text>
    </View>
  );
}
