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
  if (profile.is_gym_display) return <Redirect href="/(display)" />;
  if (profile.role !== "admin" && profile.role !== "coach") {
    return <Redirect href="/(member)" />;
  }

  // Admin always sees every module; a coach's account-level toggle
  // (Settings → Team) hides the Nutrition tab itself when off, matching
  // the underlying RLS gating from migration 0015. SPC/Exercise Library
  // aren't tabs on native (reached via Programs/More instead) — those are
  // filtered in programs.js/more.js.
  const canViewNutrition = profile.role === "admin" || profile.can_view_nutrition;

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
      <Tabs.Screen
        name="nutrition"
        options={{ title: "Nutrition", tabBarIcon: TabIcon("restaurant"), href: canViewNutrition ? undefined : null }}
      />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: TabIcon("ellipsis-horizontal-circle") }} />

      {/* Routable but not shown as their own tab — reached via Programs/More. */}
      <Tabs.Screen name="blocks" options={{ href: null }} />
      <Tabs.Screen name="prep" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="payroll" options={{ href: null }} />
      <Tabs.Screen name="spc" options={{ href: null }} />
      <Tabs.Screen name="builder" options={{ href: null }} />
      <Tabs.Screen name="exercises" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="announcements" options={{ href: null }} />
      <Tabs.Screen name="events" options={{ href: null }} />
      <Tabs.Screen name="my-training" options={{ href: null }} />
      <Tabs.Screen name="ccrew" options={{ href: null }} />
      <Tabs.Screen name="help-videos" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
    </Tabs>
  );
}
