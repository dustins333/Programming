import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kova_show_message_bubble";

// Device-local only, by design — a UI display preference (whether the
// floating message bubble shows at all), not a notification-delivery
// setting, so it doesn't need a core.users column/migration and can reset
// per device/reinstall with no real downside. Small pub-sub instead of a
// Context provider so Settings' toggle and FloatingMessageBubble (mounted
// separately in app/(member)/_layout.js) stay in sync without threading
// state between them.
let cached = true;
let loaded = false;
const listeners = new Set();

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw === null ? true : raw === "true";
  } catch {
    cached = true;
  }
  loaded = true;
}

export function useShowMessageBubble() {
  const [value, setValue] = useState(cached);

  useEffect(() => {
    let mounted = true;
    ensureLoaded().then(() => {
      if (mounted) setValue(cached);
    });
    const listener = (v) => setValue(v);
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  return value;
}

export async function setShowMessageBubble(value) {
  cached = value;
  loaded = true;
  listeners.forEach((listener) => listener(value));
  try {
    await AsyncStorage.setItem(KEY, value ? "true" : "false");
  } catch (err) {
    console.error("Failed to persist message bubble preference:", err);
  }
}
