import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { core } from "../supabase/client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Native-only — this is the Expo/APNs/FCM push path for the installed app.
// The web PWA's equivalent is webPush.js's subscribeToWebPush (Web Push/
// VAPID via a service worker, wired up separately through WebPushBanner
// since it needs the user's explicit Notification-permission tap, not a
// silent registration on login).
export async function registerPushToken(userId) {
  if (Platform.OS === "web") return null;

  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device (not a simulator).");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    ({ status: finalStatus } = await Notifications.requestPermissionsAsync());
  }
  if (finalStatus !== "granted") {
    console.warn("Push notification permission was not granted.");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#a46a57",
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      "No EAS projectId configured yet — run `eas init` to link this app to an Expo project before push tokens can be issued."
    );
    return null;
  }

  // Can genuinely throw here — e.g. a local dev build whose bundle ID has no
  // Push Notifications entitlement configured on Apple's side (unlike the
  // real production App ID, which does), not just a network hiccup. Caught
  // rather than left unhandled, matching every other non-fatal condition in
  // this function.
  let expoPushToken;
  try {
    ({ data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId }));
  } catch (err) {
    console.warn("Could not get an Expo push token on this build:", err.message ?? err);
    return null;
  }

  const { error } = await core.from("push_tokens").upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      device_name: Device.deviceName ?? null,
    },
    { onConflict: "expo_push_token" }
  );
  if (error) {
    console.error("Failed to save push token:", error);
    return null;
  }

  return expoPushToken;
}
