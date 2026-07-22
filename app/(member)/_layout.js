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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryOnWhite,
        tabBarInactiveTintColor: "#a8a29e",
        tabBarStyle: { borderTopColor: "#e7e5e4" },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: TabIcon("today") }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: TabIcon("calendar") }} />
      <Tabs.Screen name="nutrition" options={{ title: "Nutrition", tabBarIcon: TabIcon("restaurant") }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: TabIcon("time") }} />

      {/* Routable but not shown as their own tab — reached from Today. */}
      <Tabs.Screen name="session" options={{ href: null }} />
      <Tabs.Screen name="spc-session" options={{ href: null }} />
    </Tabs>
  );
}
