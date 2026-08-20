import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../lib/auth/AuthProvider";
import { colors } from "../lib/theme";

export default function Index() {
  const { session, profile, ready } = useAuth();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!profile) {
    // Signed in, but no core.users row and not the bootstrap admin email —
    // a real admin needs to finish provisioning this person.
    return <Redirect href="/pending-setup" />;
  }

  if (profile.is_gym_display) {
    // The gym-floor TV's dedicated account — its whole world is the live
    // session board. Checked before the role branches (it's role 'member').
    return <Redirect href="/(display)" />;
  }

  if (profile.role === "admin" || profile.role === "coach") {
    return <Redirect href="/(coach)" />;
  }

  return <Redirect href="/(member)" />;
}
