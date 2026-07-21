import { Redirect, Slot } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../../lib/auth/AuthProvider";
import { colors } from "../../lib/theme";

export default function MemberLayout() {
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
  // Coaches/admins land in the (coach) group instead — a member route
  // group has nothing for them.
  if (profile.role !== "member") return <Redirect href="/(coach)" />;

  return <Slot />;
}
