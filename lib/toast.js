// Alert.alert is a no-op on react-native-web (`static alert() {}`) — every
// success/error message routed through it on the coach web app (where most
// coach work happens) was silently going nowhere. This is a plain
// cross-platform toast (no Platform.OS branch needed, unlike
// lib/confirmDialog.js's web/native split) — a real RN component rendered
// via ToastHost, so it works identically on web and native and needs no
// native module. Module-level pub/sub since this app has no state library;
// ToastHost (mounted once at the app root) is the only subscriber.
let listeners = [];

function emit(toast) {
  listeners.forEach((listener) => listener(toast));
}

export function subscribeToast(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function showToast(message, { type = "info", duration } = {}) {
  emit({
    id: `${Date.now()}-${Math.random()}`,
    message,
    type,
    duration: duration ?? (type === "error" ? 4500 : 3000),
  });
}

export function toastSuccess(message) {
  showToast(message, { type: "success" });
}

// `err` may be an Error, a Supabase error object, or a plain string —
// callers throughout this app pass `err.message ?? String(err)` to
// Alert.alert today, so accept the same shapes here.
export function toastError(message, err) {
  const detail = err ? (err.message ?? String(err)) : null;
  showToast(detail ? `${message}: ${detail}` : message, { type: "error" });
}
