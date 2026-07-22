import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { SpcSessions } from "./SpcSessions";
import { fonts } from "../../lib/theme";

// Thin wrapper around the existing SpcSessions component (already has its
// own week selector + full logging UI) — Today's "View SPC session" row
// pushes here instead of inlining it, per "Today never contains an input
// field."
export default function SpcSession() {
  const { profile } = useAuth();
  const router = useRouter();

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Pressable onPress={() => router.back()} className="mb-4 self-start" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>‹ Today</Text>
      </Pressable>
      <View className="-mt-6">
        <SpcSessions userId={profile.id} />
      </View>
    </ScrollView>
  );
}
