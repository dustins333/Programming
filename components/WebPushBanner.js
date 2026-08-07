import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/AuthProvider";
import { getWebPushStatus, subscribeToWebPush } from "../lib/notifications/webPush";
import { toastSuccess, toastError } from "../lib/toast";
import { fonts } from "../lib/theme";

const DISMISS_KEY = "web-push-banner-dismissed";

// PWA counterpart to native push permission — the standalone Nutrition
// Tracker app proved this exact "small dismissible banner, detect iOS
// outside standalone mode" pattern in production, see webPush.js's own
// header comment. Rendered through a Modal (like ToastHost) so it overlays
// both the member Tabs bar and the coach web sidebar without needing to be
// threaded into either layout individually.
export function WebPushBanner() {
  const { profile } = useAuth();
  const [status, setStatus] = useState("checking");
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== "web" || !profile?.id) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") {
      setStatus("dismissed");
      return;
    }
    getWebPushStatus().then(setStatus);
  }, [profile?.id]);

  if (Platform.OS !== "web" || !profile?.id) return null;
  if (["checking", "dismissed", "subscribed", "unsupported", "denied"].includes(status)) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setStatus("dismissed");
  }

  async function handleEnable() {
    setBusy(true);
    try {
      await subscribeToWebPush(profile.id);
      setStatus("subscribed");
      toastSuccess("Notifications enabled");
    } catch (err) {
      toastError("Couldn't enable notifications", err);
      setStatus(Notification.permission === "denied" ? "denied" : "ready");
    } finally {
      setBusy(false);
    }
  }

  const isIosPrompt = status === "ios-needs-install";

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => {}}>
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", paddingBottom: insets.bottom + 12, paddingHorizontal: 16 }}>
        <View
          style={{
            backgroundColor: "white",
            borderColor: "#ece7e1",
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            maxWidth: 460,
            width: "100%",
            shadowColor: "#44403c",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            {isIosPrompt ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c", lineHeight: 18 }}>
                To get notifications on iPhone, tap the Share button and choose{" "}
                <Text style={{ fontFamily: fonts.sansSemiBold }}>Add to Home Screen</Text> first — then
                notifications can be turned on from here.
              </Text>
            ) : (
              <>
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c", lineHeight: 18, marginBottom: 8 }}>
                  Turn on notifications for reminders, messages, and updates from your coach.
                </Text>
                <Pressable
                  onPress={handleEnable}
                  disabled={busy}
                  style={{ alignSelf: "flex-start", backgroundColor: "#a46a57", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, opacity: busy ? 0.6 : 1 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "white" }}>
                    {busy ? "Enabling…" : "Enable notifications"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
          <Pressable onPress={dismiss} hitSlop={8} style={{ paddingTop: 2 }}>
            <Ionicons name="close" size={18} color="#78716c" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
