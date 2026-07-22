import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { fonts, colors } from "../../lib/theme";

export default function More() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  return (
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        More
      </Text>

      <Pressable
        onPress={() => router.push("/(coach)/exercises")}
        className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
      >
        <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
          Exercise Library
        </Text>
        <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          Text + cues
        </Text>
      </Pressable>

      {profile?.role === "admin" ? (
        <Pressable
          onPress={() => router.push("/(coach)/settings")}
          className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
        >
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
            Settings
          </Text>
          <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Admin only
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={signOut}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Sign out"
        className="mt-4 self-start rounded-lg border border-stone-300 px-5 py-3"
      >
        <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
          Sign out
        </Text>
      </Pressable>
    </View>
  );
}
