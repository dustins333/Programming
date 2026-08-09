import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

// Route mapping for pushes that predate the `url` field — the nutrition
// scanners have always sent a `type`, so an already-delivered notification
// still deep-links correctly after this ships.
const TYPE_ROUTES = {
  nutrition_daily_log_reminder: "/nutrition",
  nutrition_checkin_nag: "/nutrition/checkin",
  nutrition_checkin_available: "/nutrition/checkin",
  nutrition_checkin_submitted: "/messages", // coach-side; overridden by url when present
};

// Tapping a push used to just open the app wherever it last was — no
// listener anywhere consumed the notification's data. This routes native
// notification taps (cold-start via getLastNotificationResponseAsync,
// warm via the response listener) to data.url when the sender set one,
// else the legacy type map. Web needs none of this: public/sw.js's
// notificationclick already opens data.url.
export function PushDeepLink() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const routeFor = (response) => {
      const data = response?.notification?.request?.content?.data;
      if (!data) return null;
      if (typeof data.url === "string" && data.url.startsWith("/")) return data.url;
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
