import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { fonts, colors } from "../../lib/theme";

// Shown by all 4 member nutrition screens in place of their normal content
// whenever the member isn't in the "active, past onboarding" state — see
// lib/nutrition/useNutritionAccess.js.
export function NutritionAccessMessage({ status, error }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

  if (status === "onboarding") {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8" style={{ paddingTop: insets.top }}>
        <Text className="mb-4 text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
          Finish onboarding to start using Nutrition — your coach will review your info and set your targets once
          it's complete.
        </Text>
        <Pressable onPress={() => router.push("/(member)/nutrition/onboarding")} className="rounded-lg bg-primary px-5 py-3">
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            Continue onboarding
          </Text>
        </Pressable>
      </View>
    );
  }

  const body = status === "error" ? `Something went wrong: ${error}` : "Nutrition isn't turned on for your account yet — check with your coach.";

  return (
    <View className="flex-1 items-center justify-center bg-white px-8" style={{ paddingTop: insets.top }}>
      <Text className="text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
        {body}
      </Text>
    </View>
  );
}
