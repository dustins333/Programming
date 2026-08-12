import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { fonts, colors } from "../lib/theme";

// Payroll's screens are separate routes (not internal tab state, unlike
// settings.js's SETTINGS_TABS) since each is reachable/deep-linkable on its
// own, but they read as one section — same underline-tab visual as
// settings.js/nutrition's client-detail TabBar, just navigating between
// real routes instead of local state. CoachShell only ever shows one
// "Payroll" nav entry; this is what makes the sub-screens feel connected.
// Pay Periods no longer lives here — Admin View is a separate mode
// entirely (see app/(coach)/payroll/index.js's mode picker and
// AdminPayrollTabBar), not a 5th tab mixed into the staff experience.
const ALL_TABS = [
  { key: "entries", label: "My Entries", href: "/(coach)/payroll/entries" },
  { key: "requests", label: "Requests", href: "/(coach)/payroll/requests" },
  { key: "nutrition", label: "1:1 Nutrition", href: "/(coach)/payroll/nutrition", permission: "can_view_nutrition" },
  // Route stays /payroll/report — only the label changed, per direct ask.
  // Admin View's own all-employee Report tab is a different thing and keeps
  // its name.
  { key: "report", label: "Pay Stubs", href: "/(coach)/payroll/report" },
];

function stripGroups(href) {
  return href.replace(/\/\([^)]+\)/g, "");
}

function isActive(pathname, href) {
  const target = stripGroups(href);
  if (pathname === target) return true;
  // "/payroll" itself must not match "/payroll/requests" etc.
  if (target === "/payroll") return pathname === "/payroll";
  return pathname.startsWith(`${target}/`);
}

export function PayrollTabBar({ active, profile }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = profile?.role === "admin";
  const tabs = ALL_TABS.filter((t) => !t.permission || isAdmin || profile?.[t.permission]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 border-b border-stone-200">
      <View className="flex-row">
        {tabs.map((t) => {
          const isTabActive = active ? t.key === active : isActive(pathname, t.href);
          return (
            <Pressable
              key={t.key}
              onPress={() => router.push(t.href)}
              className="mr-6 pb-3"
              style={isTabActive ? { borderBottomWidth: 2, borderBottomColor: colors.primary } : undefined}
            >
              <Text style={{ fontFamily: isTabActive ? fonts.sansSemiBold : fonts.sansMedium, color: isTabActive ? colors.primaryOnWhite : "#78716c" }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
