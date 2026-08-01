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
      <Tabs.Screen name="index" options={{ title: "My Week", tabBarIcon: TabIcon("today") }} />
      <Tabs.Screen name="plan" options={{ title: "My Fitness", tabBarIcon: TabIcon("barbell") }} />
      <Tabs.Screen name="nutrition" options={{ title: "My Nutrition", tabBarIcon: TabIcon("restaurant") }} />
      <Tabs.Screen name="history" options={{ title: "My History", tabBarIcon: TabIcon("time") }} />

      {/* Routable but not shown as their own tab — reached from My Fitness's
          "View block" links. */}
      <Tabs.Screen name="plan-block" options={{ href: null }} />
      <Tabs.Screen name="plan-spc-block" options={{ href: null }} />

      {/* Nested screens inside the nutrition/history folders have no nested
          _layout of their own, so expo-router flattens them as siblings —
          without these, each one leaks into the tab bar as its own item. */}
      <Tabs.Screen name="nutrition/checkin" options={{ href: null }} />
      <Tabs.Screen name="nutrition/history" options={{ href: null }} />
      <Tabs.Screen name="history/[exerciseId]" options={{ href: null }} />
    </Tabs>
  );
}
