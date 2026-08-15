import { View, Text, Pressable } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { fonts, colors } from "../lib/theme";

// Payroll's screens are separate routes (not internal tab state, unlike
// settings.js's SETTINGS_TABS) since each is deep-linkable on its own, but
// they read as one section — same underline-tab visual as settings.js and
// nutrition's client-detail TabBar, just navigating between real routes.
// CoachShell only ever shows one "Payroll" nav entry; this is what makes
// the sub-screens feel connected.
//
// Three tabs, equal width, no ScrollView. It was four — Requests and 1:1
// Nutrition were separate — which needed a horizontal scroll on a phone to
// reach the last one. Both were "pay that isn't logged daily" and both are
// usually short or empty, so they're now segments inside Extra pay, with
// can_view_nutrition gating the segment rather than a whole tab.
//
// Routes are unchanged apart from the merge; only the labels moved
// (entries → Log, report → My Pay). Admin View's own all-employee Report
// tab is a different screen and keeps its name.
const TABS = [
  { key: "entries", label: "Log", href: "/(coach)/payroll/entries" },
  { key: "extra", label: "Extra pay", href: "/(coach)/payroll/extra" },
  { key: "report", label: "My Pay", href: "/(coach)/payroll/report" },
];

function stripGroups(href) {
  return href.replace(/\/\([^)]+\)/g, "");
}

function isActive(pathname, href) {
  const target = stripGroups(href);
  if (pathname === target) return true;
  // "/payroll" itself must not match "/payroll/extra" etc.
  if (target === "/payroll") return pathname === "/payroll";
  return pathname.startsWith(`${target}/`);
}

export function PayrollTabBar({ active }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View className="mb-4 mt-3.5 flex-row" style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
      {TABS.map((t) => {
        const isTabActive = active ? t.key === active : isActive(pathname, t.href);
        return (
          <Pressable
            key={t.key}
            onPress={() => router.push(t.href)}
            className="flex-1 items-center"
            style={{
              paddingBottom: 9,
              marginBottom: -1,
              ...(isTabActive ? { borderBottomWidth: 2, borderBottomColor: colors.primary } : null),
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
              style={{
                fontSize: 13,
                fontFamily: isTabActive ? fonts.sansSemiBold : fonts.sansMedium,
                color: isTabActive ? colors.primaryOnWhite : "#78716c",
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
