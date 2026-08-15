import { View, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SegmentedControl } from "../SegmentedControl";
import { NUTRITION_TABS } from "../../lib/nutrition/tabs";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// The header every My Nutrition sub-tab shares: title, gear, Kova mark, then
// the segmented control.
//
// Today had all three; Weekly, Check-In and Photos rendered a bare title, so
// switching sub-tab silently dropped the gear and the mark that every other
// member tab (My Week, My Fitness, My History) carries. Extracted rather than
// copied four times so the four screens can't drift apart again.
//
// Deliberately owns no padding or safe-area inset — Today puts this in a
// fixed block above its own ScrollView while the other three put it inside
// theirs, and each screen already handles that itself.
export function NutritionTabHeader({ activeKey, badges = null, children }) {
  const router = useRouter();

  return (
    <>
      <View className="flex-row items-center gap-3">
        <Text
          className="flex-1 text-2xl"
          style={{ fontFamily: fonts.display, color: colors.primary }}
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
        >
          My Nutrition
        </Text>
        <PressFade onPress={() => router.push("/(member)/settings")} hitSlop={10} accessibilityLabel="Settings" style={{}}>
          <Ionicons name="settings-outline" size={22} color="#78716c" />
        </PressFade>
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
      </View>

      {children ?? <View style={{ height: 12 }} />}

      <SegmentedControl
        segments={NUTRITION_TABS}
        activeKey={activeKey}
        badges={badges}
        onSelect={(key) => {
          const seg = NUTRITION_TABS.find((s) => s.key === key);
          if (seg && seg.key !== activeKey) router.push(seg.href);
        }}
      />
    </>
  );
}
