import { Platform, Alert } from "react-native";

// Shared by Group Programs' and SPC's copy-mode flows — both need to warn
// before a plain content copy silently overwrites a non-empty target tile.
// web has no native confirm() equivalent through RN's Alert API, so this
// branches to the real browser dialog there and Alert.alert everywhere else.
export function confirmOverwrite(count) {
  const message = `This will overwrite existing content in ${count} tile${count === 1 ? "" : "s"}. Continue?`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Overwrite existing content?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Copy anyway", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Admin-only block delete (Group Programs + SPC history) — same web/native
// branch as confirmOverwrite above.
export function confirmDelete(message) {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this block?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}
