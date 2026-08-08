import { Redirect, Tabs } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { useNutritionAccess } from "../../lib/nutrition/useNutritionAccess";
import { AnnouncementChecker } from "../../lib/notifications/AnnouncementChecker";
import { FloatingMessageBubble } from "../../components/FloatingMessageBubble";
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
// Pinned to no scaling, matching the coach tab bar's built-in label
// renderer (react-navigation's own Text, which doesn't scale with Dynamic
// Type) — this hand-rolled label has no such protection by default, and at
// even a capped scale the 5-across labels ("My Nutrition", "My History")
// truncate and inflate the whole tab bar's height.
function TabLabel(title) {
  return ({ focused, color }) => (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1}
      style={{ fontFamily: focused ? fonts.sansBold : fonts.sansMedium, fontSize: 11, color }}
    >
      {title}
    </Text>
  );
}

export default function MemberLayout() {
  const { session, profile, ready } = useAuth();
  // Called unconditionally (Rules of Hooks) even before we know whether
  // there's a real session yet — the hook itself no-ops until it has a
  // userId. Defaults to hidden while status is unresolved, matching "a
  // toggled-off client shouldn't even see this tab exists" — briefly
  // hiding-then-showing on load reads better than the reverse.
  const { status: nutritionStatus } = useNutritionAccess(session?.user?.id);
  // "error" is included here too — a transient fetch failure at mount used
  // to be indistinguishable from "not enrolled," silently hiding the whole
  // tab for a member who genuinely has nutrition on. Better to show the
  // tab and let the screen itself render a real error + Retry (see
  // NutritionAccessMessage) than to hide it entirely on a network blip.
  const showNutritionTab =
    nutritionStatus === "active" || nutritionStatus === "onboarding" || nutritionStatus === "pending" || nutritionStatus === "error";

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
    <>
      <AnnouncementChecker />
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
      <Tabs.Screen
        name="nutrition"
        options={{
          title: "My Nutrition",
          tabBarIcon: TabIcon("restaurant"),
          tabBarLabel: TabLabel("My Nutrition"),
          href: showNutritionTab ? undefined : null,
        }}
      />
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

      {/* Reached via the gear icon on My Week's header, not its own tab —
          keeps the tab bar at 4 items. */}
      <Tabs.Screen name="settings" options={{ href: null }} />

      {/* Reached via the chat-bubble icon on My Week's header, same
          not-its-own-tab reasoning as settings above. */}
      <Tabs.Screen name="messages" options={{ href: null }} />

      {/* Nested screens inside the nutrition/history folders have no nested
          _layout of their own, so expo-router flattens them as siblings —
          without these, each one leaks into the tab bar as its own item. */}
      <Tabs.Screen name="nutrition/checkin" options={{ href: null }} />
      <Tabs.Screen name="nutrition/weekly" options={{ href: null }} />
      <Tabs.Screen name="nutrition/photos" options={{ href: null }} />
      <Tabs.Screen name="nutrition/onboarding" options={{ href: null }} />
      <Tabs.Screen name="history/[exerciseId]" options={{ href: null }} />
      </Tabs>
      {/* Rendered after <Tabs>, not before — paints on top of the tab bar
          (later JSX = later paint = on top for overlapping siblings). See
          FloatingMessageBubble.js's own header comment for why this can't
          be wrapped in a <Modal>. */}
      <FloatingMessageBubble />
    </>
  );
}
