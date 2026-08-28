import { useEffect, useState } from "react";
import { View, Text, Image, Pressable, Platform, Modal, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthProvider";
import { getMessagingSettings } from "../lib/programming/messagingSettings";
import { usePendingDocuments } from "../lib/programming/usePendingDocuments";
import { usePendingExerciseReviews } from "../lib/programming/usePendingExerciseReviews";
import { colors, fonts } from "../lib/theme";

// Sidebar structure (per Terra's grouping, 2026-08-24): two plain top-level
// rows (Dashboard, Settings) with three collapsible groups between them.
// Group headers TOGGLE only — they never navigate. None of the groups has a
// natural landing page ("Coach"/"Admin" would have to arbitrarily pick a
// child), and a header that sometimes navigates and sometimes doesn't is
// worse than either behavior applied consistently.
//
// Per-item gates are unchanged from the old flat list — a gated item just
// hides inside its group, and a group with zero visible children renders
// nothing at all (header included):
//  - Messages: admin messaging kill switch (messagingEnabled)
//  - SPC / Nutrition: per-coach can_view_* flags
//  - Library Review: can_view_exercise_library (the library itself is open
//    to every coach since 0094 — only the review queue is gated)
//  - Admin group + Settings: admin role
// Payroll/Coach Prep/CCrew/Exercise Library stay ungated on purpose — every coach logs their
// own hours, coach education is for every coach who runs the floor, and the
// CCrew spec is explicit that every coach can view it (its upload screen is
// admin-only via RLS, not via hiding the nav item).
const NAV_SECTIONS = [
  { type: "item", item: { key: "dashboard", label: "Dashboard", href: "/(coach)", icon: "home" } },
  {
    type: "group",
    key: "clients",
    label: "Clients",
    children: [
      { key: "clients", label: "All Clients", href: "/(coach)/clients", icon: "people" },
      { key: "messages", label: "Messages", href: "/(coach)/messages", icon: "chatbubbles" },
      { key: "blocks", label: "Group", href: "/(coach)/blocks", icon: "barbell" },
      { key: "spc", label: "SPC", href: "/(coach)/spc", icon: "clipboard", permission: "can_view_spc" },
      { key: "nutrition", label: "Nutrition", href: "/(coach)/nutrition", icon: "restaurant", permission: "can_view_nutrition" },
      { key: "prep", label: "Coach Prep", href: "/(coach)/prep", icon: "school" },
      { key: "ccrew", label: "CCrew", href: "/(coach)/ccrew", icon: "trophy" },
      // The library itself is open to every coach since 0094 — anyone can
      // add an exercise and program it the same minute. What
      // can_view_exercise_library gates now is the review queue below.
      { key: "exercises", label: "Exercise Library", href: "/(coach)/exercises", icon: "library" },
      {
        key: "exercise-review",
        label: "Library Review",
        href: "/(coach)/exercises/review",
        icon: "checkmark-done",
        permission: "can_view_exercise_library",
        badge: "exerciseReviews",
      },
    ],
  },
  {
    type: "group",
    key: "coach",
    label: "Coach",
    children: [
      // Where a coach sets their OWN group/SPC memberships (nutrition is
      // admin-only, deliberately absent there).
      { key: "my-training", label: "My Training", href: "/(coach)/my-training", icon: "fitness" },
      { key: "payroll", label: "Payroll", href: "/(coach)/payroll", icon: "cash" },
      // Ungated like Payroll: what a coach sees here is decided entirely by
      // what an admin assigned them, so there's nothing for a module toggle
      // to add. `badge` names the count key this row reads from.
      { key: "documents", label: "Documents", href: "/(coach)/documents", icon: "document-text", badge: "documents" },
      // Every coach/admin account is also a real training client — this
      // jumps into the same member tab experience any client uses. The
      // member layout's staff-only "Coaching" tab is the way back.
      // noActive: stripGroups("/(member)") is "" — same as Dashboard's
      // "/(coach)" — so without this flag both rows would light up on "/".
      { key: "member-view", label: "Member View", href: "/(member)", icon: "body", noActive: true },
    ],
  },
  {
    type: "group",
    key: "admin",
    label: "Admin",
    adminOnly: true,
    children: [
      { key: "announcements", label: "Announcements", href: "/(coach)/announcements", icon: "megaphone" },
      { key: "events", label: "Events", href: "/(coach)/events", icon: "calendar" },
      { key: "help-videos", label: "Help Videos", href: "/(coach)/help-videos", icon: "videocam" },
    ],
  },
  { type: "item", adminOnly: true, item: { key: "settings", label: "Settings", href: "/(coach)/settings", icon: "settings" } },
];

// User toggles persist per device so the sidebar doesn't re-collapse on
// every page load — CoachShell remounts fresh on every web navigation, so
// without this an expanded group would snap shut the moment you used it.
// Stored as explicit per-group overrides ({ clients: false, ... }); a group
// with no override falls back to the context default (expanded on the
// desktop sidebar, collapsed in the phone drawer) or auto-expands when it
// contains the active page.
const GROUPS_STORAGE_KEY = "kova.coachNavGroups";

function readStoredGroupOverrides() {
  try {
    const raw = globalThis.localStorage?.getItem(GROUPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredGroupOverrides(overrides) {
  try {
    globalThis.localStorage?.setItem(GROUPS_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable (private mode, SSR) — toggles still work for the
    // life of this mount, they just don't persist.
  }
}

// Below this width, the persistent 232px sidebar doesn't fit — this is the
// same breakpoint this project's own preview tooling treats as "mobile" vs
// "tablet" (see the Browser pane's resize_window presets).
// Exported because the coach screens that have a .web.js sibling need the
// same cutoff: a platform extension splits web from native, NOT desktop from
// phone, so on the installed PWA a coach gets the desktop build at any width
// unless the screen itself branches here too.
export const MOBILE_BREAKPOINT = 768;

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

// Exactly one row lights up, and it's the most specific match — /exercises
// is a prefix of /exercises/review, so a plain per-row isActive() check
// highlights BOTH when you're in the review queue. Resolving the winner
// once, across every visible row, also means a future nested route can't
// reintroduce this by being added under an existing one.
function activeKeyFor(pathname, items) {
  let best = null;
  for (const item of items) {
    if (item.noActive || !isActive(pathname, item.href)) continue;
    const length = stripGroups(item.href).length;
    if (!best || length > best.length) best = { key: item.key, length };
  }
  return best?.key ?? null;
}

// Count pill for a nav row (and, when a group is collapsed, its header).
// maxFontSizeMultiplier is pinned tight: this is a fixed-width-ish pill in a
// 232px column with no room to reflow at Dynamic Type's larger sizes.
function NavBadge({ count }) {
  if (!count) return null;
  return (
    <View style={{ minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.primary, alignItems: "center" }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, color: "white", fontSize: 11 }}>
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
}

function NavRow({ active, icon, label, onPress, indent, badge }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-1 flex-row items-center gap-3 rounded-lg px-3 py-2.5"
      style={[indent ? { marginLeft: 12 } : null, active ? { backgroundColor: "#fdf6f2" } : null]}
    >
      <Ionicons name={active ? icon : `${icon}-outline`} size={18} color={active ? colors.primaryOnWhite : "#78716c"} />
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: active ? fonts.sansSemiBold : fonts.sansMedium, color: active ? colors.primaryOnWhite : "#44403c", fontSize: 14 }}>
        {label}
      </Text>
      <NavBadge count={badge} />
    </Pressable>
  );
}

// The header carries its children's total ONLY while the group is
// collapsed — that's the whole point of it (something is waiting inside a
// group you can't see). Expanded, the row itself shows the same number a
// few pixels below, and repeating it there reads as two separate things.
function GroupHeader({ label, expanded, onToggle, badge }) {
  return (
    <Pressable
      onPress={onToggle}
      className="mb-1 mt-3 flex-row items-center justify-between rounded-lg px-3 py-1.5"
      hitSlop={{ top: 4, bottom: 4 }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, color: "#78716c", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {!expanded ? <NavBadge count={badge} /> : null}
        <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={14} color="#a8a29e" />
      </View>
    </Pressable>
  );
}

// The full nav list (top-level rows + collapsible groups + profile/sign-out
// footer) — shared by the desktop sidebar and the mobile drawer, which show
// identical content in different containers. onNavigate lets the mobile
// drawer close itself before pushing; the desktop sidebar pushes directly.
// defaultExpanded: groups with no stored user toggle start open on the
// desktop sidebar (vertical room to spare) and closed in the phone drawer
// (where it's scarce); the group containing the active page always starts
// open either way. A user's explicit toggle beats both.
// Exported so a harness route can render it with fake data — CoachShell
// itself needs a real signed-in profile.
export function NavList({ profile, pathname, messagingEnabled, badges, onNavigate, onSignOut, defaultExpanded = true }) {
  const isAdmin = profile?.role === "admin";
  const [overrides, setOverrides] = useState(readStoredGroupOverrides);

  const childVisible = (item) =>
    (item.key !== "messages" || messagingEnabled) && (isAdmin || !item.permission || profile?.[item.permission]);

  // Every row that could light up, flattened — the winner is decided across
  // all of them at once rather than row by row (see activeKeyFor).
  const activeKey = activeKeyFor(
    pathname,
    NAV_SECTIONS.flatMap((section) => {
      if (section.adminOnly && !isAdmin) return [];
      return section.type === "item" ? [section.item] : section.children.filter(childVisible);
    })
  );

  const toggleGroup = (key, expanded) => {
    setOverrides((prev) => {
      const next = { ...prev, [key]: !expanded };
      writeStoredGroupOverrides(next);
      return next;
    });
  };

  // Three direct children (scrollable items block, flexible spacer, footer
  // block) so whichever full-height flex-column container renders
  // <NavList/> — the desktop sidebar or the mobile drawer — gets the footer
  // pinned to its bottom. A Fragment doesn't introduce a layout boundary,
  // so these become direct flex items of that container. The ScrollView's
  // explicit flexGrow:0/flexShrink:1 is load-bearing (RNW ScrollView
  // defaults to flex:1 internally, which would eat the spacer): short list
  // → natural height, footer pinned by the spacer; list taller than the
  // window → the nav scrolls instead of pushing Sign out off screen.
  return (
    <>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false}>
        {NAV_SECTIONS.map((section) => {
          if (section.adminOnly && !isAdmin) return null;

          if (section.type === "item") {
            const it = section.item;
            return (
              <NavRow key={it.key} active={activeKey === it.key} icon={it.icon} label={it.label} onPress={() => onNavigate(it.href)} />
            );
          }

          const children = section.children.filter(childVisible);
          if (children.length === 0) return null;
          const containsActive = children.some((c) => c.key === activeKey);
          const expanded = overrides[section.key] ?? (defaultExpanded || containsActive);
          const groupBadge = children.reduce((sum, c) => sum + (c.badge ? (badges?.[c.badge] ?? 0) : 0), 0);

          return (
            <View key={section.key}>
              <GroupHeader label={section.label} expanded={expanded} badge={groupBadge} onToggle={() => toggleGroup(section.key, expanded)} />
              {expanded
                ? children.map((c) => (
                    <NavRow
                      key={c.key}
                      indent
                      active={activeKey === c.key}
                      icon={c.icon}
                      label={c.label}
                      badge={c.badge ? badges?.[c.badge] ?? 0 : 0}
                      onPress={() => onNavigate(c.href)}
                    />
                  ))
                : null}
            </View>
          );
        })}
      </ScrollView>

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
  // Admin kill switch (lib/programming/messagingSettings.js) — web-only
  // fetch, since native's own nav lives in app/(coach)/more.js instead of
  // this sidebar/drawer. Defaults FALSE until the real check resolves —
  // this used to default true, which (since CoachShell remounts fresh on
  // every page navigation on web) meant the Messages nav item visibly
  // flashed in and then disappeared on every single page load for anyone
  // with messaging turned off admin-side. Same "hidden until confirmed"
  // convention as FloatingMessageBubble/CoachMessageBubble.
  const [messagingEnabled, setMessagingEnabled] = useState(false);
  // CoachShell remounts on every web navigation, so this re-counts on each
  // page load with no focus wiring needed. Native gets its own count in
  // app/(coach)/more.js, which is where its nav actually lives.
  const { count: pendingDocuments } = usePendingDocuments();
  // Returns 0 for anyone who isn't a library reviewer, so this can be read
  // unconditionally — the row it feeds is hidden for them anyway.
  const { count: pendingExerciseReviews } = usePendingExerciseReviews();
  const navBadges = { documents: pendingDocuments, exerciseReviews: pendingExerciseReviews };
  const anyBadge = pendingDocuments + pendingExerciseReviews > 0;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    getMessagingSettings()
      .then((s) => setMessagingEnabled(s.enabled))
      .catch((err) => console.error("Failed to load messaging settings:", err));
  }, []);

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
            <View>
              <Ionicons name="menu" size={24} color="#44403c" />
              {/* At this width the entire nav is behind the hamburger, so
                  the badge has to surface on the button itself or it's
                  invisible until you open the drawer. A dot, not a count —
                  there's no room for a number here, and with more than one
                  badged row a single number would be ambiguous anyway. */}
              {anyBadge ? (
                <View
                  style={{
                    position: "absolute",
                    top: -1,
                    right: -2,
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    borderWidth: 1.5,
                    borderColor: "white",
                  }}
                />
              ) : null}
            </View>
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
                messagingEnabled={messagingEnabled}
                badges={navBadges}
                defaultExpanded={false}
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
        <NavList
          profile={profile}
          pathname={pathname}
          messagingEnabled={messagingEnabled}
          badges={navBadges}
          onNavigate={(href) => router.push(href)}
          onSignOut={signOut}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}
