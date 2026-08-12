// Collapsible section card for the payroll Requests tab. Everything on that
// screen is a list that's usually empty or nearly empty, and it's read on a
// phone — stacking four full-height sections meant scrolling past a lot of
// nothing to reach the one that mattered. Same "tap a header row to
// expand/collapse" pattern ClientSettingsModal's ExpandableSection already
// uses, pulled out here since Requests needs several of them.
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";

const TONES = {
  neutral: { bg: "#f5f5f4", text: "#57534e" },
  attention: { bg: "#f4ede3", text: "#8a5a2e" },
  done: { bg: "#eef1e7", text: "#4d6142" },
};

export function ExpandableCard({ title, count, subtitle, open, onToggle, tone = "neutral", children }) {
  const pill = TONES[tone] || TONES.neutral;
  return (
    <View className="mb-3 w-full max-w-xl overflow-hidden rounded-2xl" style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}>
      <Pressable onPress={onToggle} className="flex-row items-center justify-between px-4 py-3.5">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{title}</Text>
            {count != null ? (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: pill.bg }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: pill.text }}>{count}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.primaryOnWhite} />
      </Pressable>
      {open ? (
        <View className="px-4 pb-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: "#f5f5f4" }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
