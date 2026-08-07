import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { subscribeToast } from "../lib/toast";
import { fonts } from "../lib/theme";

const TONE = {
  success: "#4d6142",
  error: "#b23a22",
  info: "#44403c",
};

// Mounted once at the app root (app/_layout.js). Rendered through a real RN
// <Modal> — plain absolutely-positioned overlays don't show above an
// already-open Modal (native presents each Modal as its own layer, and RNW
// mirrors that with a portal), and several of the flows this replaces throw
// their error while a create/edit modal is still open on purpose (so the
// user doesn't lose what they typed). A later-presented Modal stacks above
// an earlier one on both platforms, so this reliably shows through.
export function ToastHost() {
  const [toasts, setToasts] = useState([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration);
    });
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <Modal visible={toasts.length > 0} transparent animationType="none" onRequestClose={() => {}}>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
        {toasts.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => dismiss(t.id)}
            style={{
              backgroundColor: TONE[t.type] ?? TONE.info,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 16,
              marginBottom: 8,
              maxWidth: 460,
              width: "100%",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 10,
            }}
          >
            <Text style={{ color: "white", fontFamily: fonts.sansSemiBold, fontSize: 13 }}>{t.message}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}
