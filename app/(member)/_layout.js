import { Redirect, Tabs } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { colors, fonts } from "../../lib/theme";

// 21px line icons regardless of whatever size the navigator would
// otherwise pass — design_handoff_visual_pass_v4/README.md's nav bar spec.
function TabIcon(name) {
  return ({ focused, color }) => (
    <Ionicons name={focused ? name : `${name}-outline`} color={color} size={21} />
  );
}

// Active label is 700-weight, inactive is 500 — react-navigation's
// tabBarLabelStyle is static and can't vary by focus state on its own, so
// this renders the label itself and swaps fontFamily off the `focused` arg.
function TabLabel(title) {
  return ({ focused, color }) => (
    <Text style={{ fontFamily: focused ? fonts.sansBold : fonts.sansMedium, fontSize: 11, color }}>{title}</Text>
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
  // Members always land here (app/index.js sends them straight to this
  // group on sign-in). Coaches/admins land in (coach) by default instead,
  // but — since a coach/admin is also a real training client, per explicit
  // ask — they're allowed through here too rather than bounced back out:
  // this is how CoachShell's "My Training" link and each Team row's
  // "Manage own training" link actually work. The "Coaching" tab below
  // (staff-only) is their way back.
  const isStaff = profile.role === "admin" || profile.role === "coach";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryOnWhite,
        tabBarInactiveTintColor: "#b5afa6",
        tabBarStyle: { borderTopColor: "#e7e5e4" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "My Week", tabBarIcon: TabIcon("today"), tabBarLabel: TabLabel("My Week") }} />
      <Tabs.Screen name="plan" options={{ title: "My Fitness", tabBarIcon: TabIcon("barbell"), tabBarLabel: TabLabel("My Fitness") }} />
      <Tabs.Screen name="nutrition" options={{ title: "My Nutrition", tabBarIcon: TabIcon("restaurant"), tabBarLabel: TabLabel("My Nutrition") }} />
      <Tabs.Screen name="history" options={{ title: "My History", tabBarIcon: TabIcon("time"), tabBarLabel: TabLabel("My History") }} />

      {/* Staff-only way back to the coach dashboard, since a coach/admin
          can now reach this member tab set too (see the note above) — a
          plain member never sees this tab at all. */}
      <Tabs.Screen
        name="back-to-coaching"
        options={{
          title: "Coaching",
          tabBarIcon: TabIcon("briefcase"),
          tabBarLabel: TabLabel("Coaching"),
          href: isStaff ? undefined : null,
        }}
      />

      {/* Routable but not shown as their own tab — reached from My Fitness's
          "View block" links. */}
      <Tabs.Screen name="plan-block" options={{ href: null }} />
      <Tabs.Screen name="plan-spc-block" options={{ href: null }} />

      {/* Nested screens inside the nutrition/history folders have no nested
          _layout of their own, so expo-router flattens them as siblings —
          without these, each one leaks into the tab bar as its own item. */}
      <Tabs.Screen name="nutrition/checkin" options={{ href: null }} />
      <Tabs.Screen name="nutrition/weekly" options={{ href: null }} />
      <Tabs.Screen name="nutrition/photos" options={{ href: null }} />
      <Tabs.Screen name="nutrition/onboarding" options={{ href: null }} />
      <Tabs.Screen name="history/[exerciseId]" options={{ href: null }} />
    </Tabs>
  );
}
