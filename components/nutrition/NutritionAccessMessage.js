import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { fonts, colors } from "../../lib/theme";

// Shown by all 4 member nutrition screens in place of their normal content
// whenever the member isn't in the "active, past onboarding" state — see
// lib/nutrition/useNutritionAccess.js.
export function NutritionAccessMessage({ status, error, onRetry }) {
  const insets = useSafeAreaInsets();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "pending") {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8" style={{ paddingTop: insets.top }}>
        <Text className="text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
          Your coach is getting your nutrition program ready — check back soon.
        </Text>
      </View>
    );
  }

  if (status === "active") {
    // Only the onboarding hub ever passes "active" (its gate bounces
    // anyone already approved) — land them on the real tab rather than the
    // "not turned on" fallback below, which used to be flat-out wrong for
    // a just-approved member revisiting the hub.
    return <Redirect href="/(member)/nutrition" />;
  }

  if (status === "onboarding") {
    // Straight to the onboarding hub, no interstitial — once the coach has
    // hit "Send to client," the tasks ARE this tab's content. The old
    // "Continue onboarding" button screen was an extra click that also
    // created a two-screen loop with the hub's own back link (Terra hit
    // both live as a brand-new client).
    return <Redirect href="/(member)/nutrition/onboarding" />;
  }

  const body = status === "error" ? `Something went wrong: ${error}` : "Nutrition isn't turned on for your account yet — check with your coach.";

  return (
    <View className="flex-1 items-center justify-center bg-white px-8" style={{ paddingTop: insets.top }}>
      <Text className="mb-3 text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
        {body}
      </Text>
      {status === "error" && onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
