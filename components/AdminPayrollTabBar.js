import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { fonts, colors } from "../lib/theme";

// Admin View's own tab bar — a separate mode from the staff PayrollTabBar,
// not a 5th tab mixed into it (see app/(coach)/payroll/index.js's mode
// picker). This whole tree is admin-only by construction; no permission
// filtering needed here the way the staff bar needs for can_view_nutrition.
// "This period" and "Closed periods" used to be one Pay Periods tab. The
// review table that now leads the open period is dense enough that having
// a growing list of finished periods under it buried the thing you
// actually came to do — so they split, matching the design handoff.
// Deliberately no "My hours" tab: an admin logging their own hours goes
// through the Staff View mode picker (app/(coach)/payroll/index.js), which
// is the whole point of that split.
const TABS = [
  { key: "periods", label: "This period", href: "/(coach)/payroll/admin/periods" },
  { key: "requests", label: "Requests", href: "/(coach)/payroll/admin/requests" },
  { key: "closed", label: "Closed periods", href: "/(coach)/payroll/admin/closed" },
  { key: "report", label: "Report", href: "/(coach)/payroll/admin/report" },
  { key: "settings", label: "Settings", href: "/(coach)/payroll/admin/settings" },
];

function stripGroups(href) {
  return href.replace(/\/\([^)]+\)/g, "");
}

function isActive(pathname, href) {
  const target = stripGroups(href);
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function AdminPayrollTabBar({ active }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 border-b border-stone-200">
      <View className="flex-row">
        {TABS.map((t) => {
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
