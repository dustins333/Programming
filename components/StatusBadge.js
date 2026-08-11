import { Text } from "react-native";
import { statusColors, fonts } from "../lib/theme";

// Shared pill for the gym's 5-status system — reused by the SPC roster and
// the Nutrition dashboard so status colors aren't reinvented per screen.
// `tone` picks the bg/text pair; `label` is the full text (including any
// emoji) since status is always a colored pill WITH a text label, never
// color alone. `lines` opens it up to wrap — the roster's filter tiles use
// it at phone width, where a single line truncates the longer labels down
// to "Awaiting client c…" and the chips stop being readable.
export function StatusBadge({ tone, label, lines = 1 }) {
  const { bg, text } = statusColors[tone] ?? statusColors.paused;
  return (
    <Text
      numberOfLines={lines}
      maxFontSizeMultiplier={1.2}
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
