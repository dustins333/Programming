import { View, Text, Linking, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { colors, fonts } from "../lib/theme";

export default function Support() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-white px-6 py-16 items-center">
      <View style={{ maxWidth: 480, width: "100%" }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push("/"))}
          className="mb-4 self-start"
          hitSlop={8}
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
        </Pressable>
        <Text
          className="mb-2 text-3xl text-primary"
          style={{ fontFamily: fonts.display }}
        >
          Kova Strength Support
        </Text>
        <Text
          className="mb-8 text-base text-stone-600"
          style={{ fontFamily: fonts.sans }}
        >
          Need help with the Kova Strength app? Reach out and we'll get back to you.
        </Text>

        <View className="mb-6 rounded-2xl border border-stone-200 p-5">
          <Text
            className="mb-1 text-sm text-stone-500"
            style={{ fontFamily: fonts.sansMedium }}
          >
            Email
          </Text>
          <Pressable onPress={() => Linking.openURL("mailto:hello@kovastrength.com")}>
            <Text
              className="text-lg"
              style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}
            >
              hello@kovastrength.com
            </Text>
          </Pressable>
        </View>

        <View className="rounded-2xl border border-stone-200 p-5">
          <Text
            className="mb-1 text-sm text-stone-500"
            style={{ fontFamily: fonts.sansMedium }}
          >
            Phone
          </Text>
          <Pressable onPress={() => Linking.openURL("tel:12089073317")}>
            <Text
              className="text-lg"
              style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}
            >
              (208) 907-3317
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
