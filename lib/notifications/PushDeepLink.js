import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

// Route mapping for pushes that predate the `url` field — the nutrition
// scanners have always sent a `type`, so an already-delivered notification
// still deep-links correctly after this ships.
// Group-prefixed on purpose. A bare "/nutrition" or "/messages" also matches
// app/(coach)/nutrition/index.js and app/(coach)/messages/index.js — every
// other navigation in the member app spells the group out for exactly this
// reason (see lib/nutrition/tabs.js), and without it a member tapping a
// daily-log or check-in push could land in the coach group and get bounced
// straight back out to My Week.
//
// The `url` a sender puts in the payload deliberately stays UNPREFIXED:
// public/sw.js hands it to clients.openWindow() as a real browser URL, and
// route groups are transparent in web paths (the static export serves
// /nutrition/checkin, not /(member)/nutrition/checkin). normalizeUrl below
// adds the group back for the native router only.
const TYPE_ROUTES = {
  nutrition_daily_log_reminder: "/(member)/nutrition",
  nutrition_checkin_nag: "/(member)/nutrition/checkin",
  nutrition_checkin_available: "/(member)/nutrition/checkin",
  // Coach-side, so this one stays in the coach group. Overridden by `url`
  // whenever the sender set one.
  nutrition_checkin_submitted: "/(coach)/messages",
};

// Tapping a push used to just open the app wherever it last was — no
// listener anywhere consumed the notification's data. This routes native
// notification taps (cold-start via getLastNotificationResponseAsync,
// warm via the response listener) to data.url when the sender set one,
// else the legacy type map. Web needs none of this: public/sw.js's
// notificationclick already opens data.url.
// Member-facing paths a sender may emit unprefixed, mapped to the group the
// native router needs. Anything already carrying a group, or not on this
// list, is passed through untouched.
const MEMBER_PATHS = ["/nutrition", "/messages", "/plan", "/history", "/settings", "/events"];

function normalizeUrl(url) {
  if (url.startsWith("/(")) return url;
  const isMemberPath = MEMBER_PATHS.some((base) => url === base || url.startsWith(`${base}/`));
  return isMemberPath ? `/(member)${url}` : url;
}

export function PushDeepLink() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const routeFor = (response) => {
      const data = response?.notification?.request?.content?.data;
      if (!data) return null;
      if (typeof data.url === "string" && data.url.startsWith("/")) return normalizeUrl(data.url);
      return TYPE_ROUTES[data.type] ?? null;
    };

    const navigate = (response) => {
      const route = routeFor(response);
      if (route) {
        // Defer one tick so the root navigator is mounted on cold start.
        setTimeout(() => router.push(route), 0);
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) navigate(response);
      })
      .catch((err) => console.error("Failed to read launch notification:", err));

    const sub = Notifications.addNotificationResponseReceivedListener(navigate);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
