import { Redirect, Slot } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../../lib/auth/AuthProvider";
import { colors } from "../../lib/theme";

// Web gets no layout-level chrome at all — CoachShell (components/CoachShell.js)
// supplies the sidebar per-screen instead, so screens that shouldn't have it
// (the full-bleed workout builder) simply don't wrap in it. Same auth gate as
// the native _layout.js, just no <Tabs/>.
export default function CoachLayoutWeb() {
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
  if (profile.is_gym_display) return <Redirect href="/(display)" />;
  if (profile.role !== "admin" && profile.role !== "coach") {
    return <Redirect href="/(member)" />;
  }

  return <Slot />;
}
