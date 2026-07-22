import { Text } from "react-native";
import { statusColors, fonts } from "../lib/theme";

// Shared pill for the gym's 5-status system — reused by the SPC roster and
// the Nutrition dashboard so status colors aren't reinvented per screen.
// `tone` picks the bg/text pair; `label` is the full text (including any
// emoji) since status is always a colored pill WITH a text label, never
// color alone.
export function StatusBadge({ tone, label }) {
  const { bg, text } = statusColors[tone] ?? statusColors.paused;
  return (
    <Text
      style={{
        fontFamily: fonts.sansSemiBold,
        backgroundColor: bg,
        color: text,
        fontSize: 12,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}
