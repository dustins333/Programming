import { Redirect, Tabs } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { colors, fonts } from "../../lib/theme";

function TabIcon(name) {
  return ({ focused, color, size }) => (
    <Ionicons name={focused ? name : `${name}-outline`} color={color} size={size} />
  );
}

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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryOnWhite,
        tabBarInactiveTintColor: "#a8a29e",
        tabBarActiveBackgroundColor: "transparent",
        tabBarStyle: { borderTopColor: "#e7e5e4" },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: TabIcon("home") }} />
      <Tabs.Screen name="clients" options={{ title: "Clients", tabBarIcon: TabIcon("people") }} />
      <Tabs.Screen name="programs" options={{ title: "Programs", tabBarIcon: TabIcon("barbell") }} />
      <Tabs.Screen name="nutrition" options={{ title: "Nutrition", tabBarIcon: TabIcon("restaurant") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: TabIcon("ellipsis-horizontal-circle") }} />

      {/* Routable but not shown as their own tab — reached via Programs/More. */}
      <Tabs.Screen name="blocks" options={{ href: null }} />
      <Tabs.Screen name="spc" options={{ href: null }} />
      <Tabs.Screen name="builder" options={{ href: null }} />
      <Tabs.Screen name="exercises" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
