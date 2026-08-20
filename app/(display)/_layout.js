import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../../lib/auth/AuthProvider";
import { colors } from "../../lib/theme";

// The gym-floor wall display's route group. Only the dedicated display
// account (core.users.is_gym_display, migration 0071) gets in — everyone
// else bounces back to "/" and lands in their normal member/coach world.
// Deliberately no tabs and none of the member chrome (announcement popups,
// message bubbles): the TV is one screen, the live session board.
export default function DisplayLayout() {
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
  if (!profile.is_gym_display) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
