import { useState } from "react";
import { View, Text, Image, Pressable, Platform, Modal, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthProvider";
import { colors, fonts } from "../lib/theme";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/(coach)", icon: "home" },
  { key: "clients", label: "Clients", href: "/(coach)/clients", icon: "people" },
  { key: "messages", label: "Messages", href: "/(coach)/messages", icon: "chatbubbles" },
  { key: "blocks", label: "Group Programs", href: "/(coach)/blocks", icon: "barbell" },
  { key: "spc", label: "SPC", href: "/(coach)/spc", icon: "clipboard", permission: "can_view_spc" },
  { key: "nutrition", label: "Nutrition", href: "/(coach)/nutrition", icon: "restaurant", permission: "can_view_nutrition" },
  { key: "exercises", label: "Exercise Library", href: "/(coach)/exercises", icon: "library", permission: "can_view_exercise_library" },
];

// Below this width, the persistent 232px sidebar doesn't fit — this is the
// same breakpoint this project's own preview tooling treats as "mobile" vs
// "tablet" (see the Browser pane's resize_window presets).
const MOBILE_BREAKPOINT = 768;

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

function NavRow({ active, icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-1 flex-row items-center gap-3 rounded-lg px-3 py-2.5"
      style={active ? { backgroundColor: "#fdf6f2" } : undefined}
    >
      <Ionicons name={active ? icon : `${icon}-outline`} size={18} color={active ? colors.primaryOnWhite : "#78716c"} />
      <Text style={{ fontFamily: active ? fonts.sansSemiBold : fonts.sansMedium, color: active ? colors.primaryOnWhite : "#44403c", fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// The full nav list (module items + My Training + admin-only extras +
// profile/sign-out footer) — shared by the desktop sidebar and the mobile
// drawer, which show identical content in different containers.
// onNavigate lets the mobile drawer close itself before pushing; the
// desktop sidebar just pushes directly.
function NavList({ profile, pathname, onNavigate, onSignOut }) {
  const isAdmin = profile?.role === "admin";
  const visibleNavItems = NAV_ITEMS.filter((item) => isAdmin || !item.permission || profile?.[item.permission]);

  // Three direct children (items block, flexible spacer, footer block) so
  // whichever full-height flex-column container renders <NavList/> — the
  // desktop sidebar or the mobile drawer — gets the footer pinned to its
  // bottom the same way the original single-file sidebar did. A Fragment
  // doesn't introduce a layout boundary, so these become direct flex items
  // of that container, not of some wrapper local to NavList.
  return (
    <>
      <View>
        {visibleNavItems.map((item) => (
          <NavRow key={item.key} active={isActive(pathname, item.href)} icon={item.icon} label={item.label} onPress={() => onNavigate(item.href)} />
        ))}

        {/* Every coach/admin account is also a real training client (per
            explicit ask) — this jumps into the same member tab experience
            any client uses, reading this account's own program data. The
            member layout's staff-only "Coaching" tab is the way back. */}
        <NavRow active={false} icon="body" label="My Training" onPress={() => onNavigate("/(member)")} />

        {isAdmin ? (
          <NavRow active={isActive(pathname, "/(coach)/announcements")} icon="megaphone" label="Announcements" onPress={() => onNavigate("/(coach)/announcements")} />
        ) : null}

        {isAdmin ? (
          <NavRow active={isActive(pathname, "/(coach)/settings")} icon="settings" label="Settings" onPress={() => onNavigate("/(coach)/settings")} />
        ) : null}
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ borderTopWidth: 1, borderTopColor: "#e7e5e4", paddingTop: 16, marginTop: 16 }}>
        <Text numberOfLines={1} className="mb-2 px-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {profile?.name}
        </Text>
        <Pressable onPress={onSignOut} className="flex-row items-center gap-3 rounded-lg px-3 py-2.5">
          <Ionicons name="log-out-outline" size={18} color="#78716c" />
          <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c", fontSize: 14 }}>Sign out</Text>
        </Pressable>
      </View>
    </>
  );
}

// Web-only shell — every coach screen wraps its content in this. On native
// it's a transparent passthrough (the Tabs navigator in
// app/(coach)/_layout.js already provides chrome), so screens can wrap
// unconditionally with no per-screen platform branching. On web,
// app/(coach)/_layout.web.js renders no chrome of its own — this is where
// it lives instead, which is what makes opting a screen out (the
// full-bleed workout builder) as simple as just not wrapping it.
//
// Two web renderings, chosen by viewport width, not by whether this is
// "the PWA" vs "a desktop browser" — there's no way to detect that
// distinction from here, and it wouldn't be the right signal anyway (a
// desktop browser resized narrow should get the same compact nav a phone
// does). Below MOBILE_BREAKPOINT: a compact header + slide-in drawer,
// same NavList content as the sidebar. At or above it: the original
// persistent 232px sidebar, unchanged.
export function CoachShell({ children }) {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Native's Tabs navigator runs headerShown:false everywhere in (coach),
  // so nothing else accounts for the status bar/notch — without this, every
  // screen's content renders flush under it (same class of bug already
  // fixed once on the member side's My Week screen). This single wrapper
  // covers every screen that opts into CoachShell instead of patching each
  // one individually.
  if (Platform.OS !== "web") {
    return <View style={{ flex: 1, paddingTop: insets.top }}>{children}</View>;
  }

  if (width < MOBILE_BREAKPOINT) {
    return (
      <View style={{ flex: 1, backgroundColor: "#f6f1ec" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingTop: insets.top + 10,
            paddingBottom: 10,
            paddingHorizontal: 14,
            backgroundColor: "white",
            borderBottomWidth: 1,
            borderBottomColor: "#e7e5e4",
          }}
        >
          <Pressable onPress={() => setDrawerOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="menu" size={24} color="#44403c" />
          </Pressable>
          <Image source={require("../assets/kova-logo.jpg")} style={{ width: 26, height: 26, borderRadius: 13 }} />
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 16 }} numberOfLines={1}>
            Kova Strength
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>

        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <Pressable onPress={() => setDrawerOpen(false)} style={{ flex: 1, flexDirection: "row", backgroundColor: "rgba(68,64,60,0.35)" }}>
            <Pressable
              onPress={(e) => e.stopPropagation?.()}
              style={{ width: 264, height: "100%", backgroundColor: "white", paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 20 }}
            >
              <View className="mb-7 flex-row items-center gap-2.5 px-2">
                <Image source={require("../assets/kova-logo.jpg")} style={{ width: 32, height: 32, borderRadius: 16 }} />
                <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 18 }} numberOfLines={1}>
                  Kova Strength
                </Text>
              </View>
              <NavList
                profile={profile}
                pathname={pathname}
                onNavigate={(href) => {
                  setDrawerOpen(false);
                  router.push(href);
                }}
                onSignOut={() => {
                  setDrawerOpen(false);
                  signOut();
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

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
        <NavList profile={profile} pathname={pathname} onNavigate={(href) => router.push(href)} onSignOut={signOut} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}
