import { View, Text, Image, Pressable, Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthProvider";
import { colors, fonts } from "../lib/theme";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/(coach)", icon: "home" },
  { key: "clients", label: "Clients", href: "/(coach)/clients", icon: "people" },
  { key: "blocks", label: "Group Programs", href: "/(coach)/blocks", icon: "barbell" },
  { key: "spc", label: "SPC", href: "/(coach)/spc", icon: "clipboard", permission: "can_view_spc" },
  { key: "nutrition", label: "Nutrition", href: "/(coach)/nutrition", icon: "restaurant", permission: "can_view_nutrition" },
  { key: "exercises", label: "Exercise Library", href: "/(coach)/exercises", icon: "library", permission: "can_view_exercise_library" },
];

// Strips the route-group segment (e.g. "(coach)") since expo-router's
// usePathname() resolves it out of the actual URL on web, but hrefs in this
// codebase are written with the group included (matching existing Link
// usages elsewhere).
function stripGroups(href) {
  return href.replace(/\/\([^)]+\)/g, "");
}

function isActive(pathname, href) {
  const target = stripGroups(href);
  if (target === "") return pathname === "/" || pathname === "";
  return pathname === target || pathname.startsWith(`${target}/`);
}

// Web-only persistent sidebar shell — every coach screen wraps its content
// in this. On native it's a transparent passthrough (the Tabs navigator in
// app/(coach)/_layout.js already provides chrome), so screens can wrap
// unconditionally with no per-screen platform branching. On web,
// app/(coach)/_layout.web.js renders no chrome of its own — this is where
// it lives instead, which is what makes opting a screen out (the
// full-bleed workout builder) as simple as just not wrapping it.
export function CoachShell({ children }) {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (Platform.OS !== "web") {
    return children;
  }

  // Admin always sees every module; a coach's own account-level toggles
  // (Settings → Team) hide the nav entries for modules they've been turned
  // off from — matches the underlying RLS gating (migration 0015), so a
  // hidden item isn't just cosmetic, the data really isn't reachable either.
  const isAdmin = profile?.role === "admin";
  const visibleNavItems = NAV_ITEMS.filter((item) => isAdmin || !item.permission || profile?.[item.permission]);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#f6f1ec" }}>
      <View
        style={{
          width: 232,
          borderRightWidth: 1,
          borderRightColor: "#e7e5e4",
          paddingVertical: 24,
          paddingHorizontal: 16,
          backgroundColor: "white",
        }}
      >
        <View className="mb-7 flex-row items-center gap-2.5 px-2">
          <Image source={require("../assets/kova-logo.jpg")} style={{ width: 32, height: 32, borderRadius: 16 }} />
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 18 }} numberOfLines={1}>
            Kova Strength
          </Text>
        </View>

        {visibleNavItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href)}
              className="mb-1 flex-row items-center gap-3 rounded-lg px-3 py-2.5"
              style={active ? { backgroundColor: "#fdf6f2" } : undefined}
            >
              <Ionicons name={active ? item.icon : `${item.icon}-outline`} size={18} color={active ? colors.primaryOnWhite : "#78716c"} />
              <Text style={{ fontFamily: active ? fonts.sansSemiBold : fonts.sansMedium, color: active ? colors.primaryOnWhite : "#44403c", fontSize: 14 }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Every coach/admin account is also a real training client (per
            explicit ask) — this jumps into the same member tab experience
            any client uses, reading this account's own program data. The
            member layout's staff-only "Coaching" tab is the way back. */}
        <Pressable
          onPress={() => router.push("/(member)")}
          className="mb-1 flex-row items-center gap-3 rounded-lg px-3 py-2.5"
        >
          <Ionicons name="body-outline" size={18} color="#78716c" />
          <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c", fontSize: 14 }}>My Training</Text>
        </Pressable>

        {profile?.role === "admin" ? (
          <Pressable
            onPress={() => router.push("/(coach)/settings")}
            className="mb-1 flex-row items-center gap-3 rounded-lg px-3 py-2.5"
            style={isActive(pathname, "/(coach)/settings") ? { backgroundColor: "#fdf6f2" } : undefined}
          >
            <Ionicons
              name={isActive(pathname, "/(coach)/settings") ? "settings" : "settings-outline"}
              size={18}
              color={isActive(pathname, "/(coach)/settings") ? colors.primaryOnWhite : "#78716c"}
            />
            <Text
              style={{
                fontFamily: isActive(pathname, "/(coach)/settings") ? fonts.sansSemiBold : fonts.sansMedium,
                color: isActive(pathname, "/(coach)/settings") ? colors.primaryOnWhite : "#44403c",
                fontSize: 14,
              }}
            >
              Settings
            </Text>
          </Pressable>
        ) : null}

        <View style={{ flex: 1 }} />

        <View style={{ borderTopWidth: 1, borderTopColor: "#e7e5e4", paddingTop: 16, marginTop: 16 }}>
          <Text numberOfLines={1} className="mb-2 px-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {profile?.name}
          </Text>
          <Pressable onPress={signOut} className="flex-row items-center gap-3 rounded-lg px-3 py-2.5">
            <Ionicons name="log-out-outline" size={18} color="#78716c" />
            <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c", fontSize: 14 }}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}
