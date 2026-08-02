import { View, Text, Pressable } from "react-native";
import { fonts } from "../../lib/theme";

const ACCENT = { primary: "#a46a57", accent: "#ad816d", tertiary: "#beac95" };

function CheckBadge() {
  return (
    <View className="items-center justify-center rounded-full" style={{ width: 20, height: 20, backgroundColor: "#a46a57" }}>
      <Text style={{ color: "white", fontSize: 11 }}>✓</Text>
    </View>
  );
}

// A tappable card once its phase is complete; a plain (non-interactive,
// dimmed) card otherwise, so the coach can only tap into data that actually
// exists yet.
export function PhaseCard({ onPress, title, done, subtext, accent = "primary" }) {
  const content = (
    <View className="rounded-lg border border-stone-200 p-4" style={{ borderLeftWidth: 4, borderLeftColor: ACCENT[accent], opacity: done ? 1 : 0.6 }}>
      <View className="mb-1.5 flex-row items-center justify-between gap-2">
        <Text style={{ fontFamily: fonts.sansMedium }}>{title}</Text>
        {done ? <CheckBadge /> : null}
      </View>
      <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        {subtext}
      </Text>
    </View>
  );

  if (!done) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}
