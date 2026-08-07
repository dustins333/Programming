import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { fonts, colors } from "../../../../lib/theme";

// Print/export is web-only (spec's SPC print template is meant for a real
// printer via the browser) — coaches do this from the web build, same
// precedent as the drag-and-drop builder. The "Print" button that would
// normally get here is web-only too (spc/history/[userId].js), so this is
// only reachable via a stale/direct link — still needs a real way out.
export default function SpcBlockPrintNative() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 items-center justify-center bg-white px-8" style={{ paddingTop: insets.top + 20 }}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/spc"))}
        className="absolute left-6"
        style={{ top: insets.top + 20 }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>
      <Text className="text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
        Open this block on the web app to export/print.
      </Text>
    </View>
  );
}
