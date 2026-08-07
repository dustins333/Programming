import { Platform } from "react-native";
import { supabase } from "../supabase/client";

// Web Push (VAPID) for the PWA install — the web counterpart to
// registerPushToken.js's native Expo push registration. Ported from the
// standalone Nutrition Tracker app's app/components/PushSubscribe.js +
// pushActions.js, which have run this exact flow in production since
// 2026-07 (see CLAUDE.md's "Reuse the standalone app's Web Push
// implementation" section) — same public.push_subscriptions table, same
// shared Supabase project/auth.users, reused as-is with no new migration.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isIosDevice() {
  return Platform.OS === "web" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandaloneWeb() {
  return (
    Platform.OS === "web" &&
    (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true)
  );
}

// One of: "unsupported" | "ios-needs-install" | "denied" | "ready" | "subscribed"
export async function getWebPushStatus() {
  if (Platform.OS !== "web") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return isIosDevice() && !isStandaloneWeb() ? "ios-needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.register("/sw.js");
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "subscribed" : "ready";
}

export async function subscribeToWebPush(userId) {
  if (Platform.OS !== "web") throw new Error("Web Push is only available on the web build.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const publicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing EXPO_PUBLIC_VAPID_PUBLIC_KEY.");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;

  return subscription;
}

export async function unsubscribeFromWebPush() {
  if (Platform.OS !== "web") return;
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
