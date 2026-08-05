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

// Always tappable, dimmed only for visual "not done yet" affordance — the
// destination pages (onboarding/tracking.js, questionnaire.js) are exactly
// where a coach takes the actions that make a phase done in the first place
// (assigning tracking dates, copying questionnaire questions from the
// template), so gating the tap on `done` made those phases permanently
// unreachable: no other screen in the app links to them.
export function PhaseCard({ onPress, title, done, subtext, accent = "primary" }) {
  return (
    <Pressable onPress={onPress}>
      <View className="rounded-lg border border-stone-200 p-4" style={{ borderLeftWidth: 4, borderLeftColor: ACCENT[accent], opacity: done ? 1 : 0.6 }}>
        <View className="mb-1.5 flex-row items-center justify-between gap-2">
          <Text style={{ fontFamily: fonts.sansMedium }}>{title}</Text>
          {done ? <CheckBadge /> : null}
        </View>
        <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          {subtext}
        </Text>
      </View>
    </Pressable>
  );
}
