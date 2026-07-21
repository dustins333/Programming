import { Redirect, Slot } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../../lib/auth/AuthProvider";
import { colors } from "../../lib/theme";

export default function CoachLayout() {
  const { session, profile, ready } = useAuth();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/pending-setup" />;
  if (profile.role !== "admin" && profile.role !== "coach") {
    return <Redirect href="/(member)" />;
  }

  return <Slot />;
}
