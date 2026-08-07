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

// Nutrition onboarding "skip" action — same web/native branch as the two
// above, needed here too since Alert.alert's multi-button array doesn't
// render as a real confirm dialog on web (RN Web's Alert falls back to a
// plain single-message alert), and this is a coach-web-first flow.
export function confirmBypassOnboarding(message) {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Skip in-app onboarding?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Skip onboarding", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Nutrition milestones — deleting one loses it from history entirely (no
// undo), so that still gets a real confirm. Completing/reopening one is
// freely reversible (see reopenMilestone) so those are a plain instant
// checkbox toggle now, no confirm dialog — per direct feedback that the
// popup here was unnecessary friction.
export function confirmDeleteMilestone(title) {
  const message = `Delete "${title}"? This removes it entirely, including from history.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this milestone?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Nutrition onboarding — releases the questionnaire + tracking dates to the
// client, who couldn't see either until now. Worth a real confirm since it's
// a one-way "make this visible" action, same web/native branch as the rest
// of this file.
export function confirmSendToClient(clientName) {
  const message = `${clientName} will be able to see their questionnaire and objective tracking dates once sent. Continue?`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Send onboarding to client?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Send", onPress: () => resolve(true) },
    ]);
  });
}

// A scheduled-but-not-yet-sent announcement deleted this way never pushes
// at all; an already-pushed one just stops showing to anyone who hasn't
// opened the app yet — either way, no separate "retract" concept needed.
export function confirmDeleteAnnouncement() {
  const message = "Delete this announcement? This can't be undone.";
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this announcement?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// One-off/template delete — same shape as confirmDelete but named for the
// entity so the native Alert's title reads correctly instead of the block
// one's fixed "Delete this block?" title.
export function confirmDeleteTemplate(name) {
  const message = `Delete "${name}"? Any client already assigned this one-off keeps their copy — this only removes the reusable template. This can't be undone.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this template?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Archiving an exercise removes it from every builder's picker and (per a
// real RLS gap documented in lib/programming/exercises.js) makes it
// disappear from any live session that still references it — worth a real
// confirm, not just an instant click. `usageNote` is optional extra detail
// (e.g. "used in 3 active sessions") threaded in once where-used counts
// exist.
export function confirmArchiveExercise(name, usageNote) {
  const message = usageNote
    ? `Archive "${name}"? ${usageNote} This can't be undone from here — you can un-archive it later from the Archived filter.`
    : `Archive "${name}"? You can un-archive it later from the Archived filter.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Archive this exercise?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Archive", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Removing a one-off unassigns it from the client entirely (not just hides
// it) — same "real delete, no undo" shape as the rest of this file.
export function confirmRemoveOneOff(title) {
  const message = `Remove "${title}" from this client? This can't be undone.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Remove this one-off workout?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Remove", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Turning Nutrition off moves a client to the Archived list — reversible in
// principle (reactivating creates/reactivates their row again), but it does
// pull them off the roster a coach scans day to day, so worth a beat before
// it fires from a plain Switch flip.
export function confirmArchiveNutritionClient(name) {
  const message = `Turn off Nutrition for ${name}? They'll move to the Archived list — you can reactivate them from there later.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Turn off Nutrition?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Turn off", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Coach-only progress-photo delete (PhotoSubmissionsEditor's "Fix a day's
// photos" tool) — members can never reach this, only staff, since a
// genuinely-submitted photo shouldn't be self-deletable per Terra's own
// answer when this was scoped. Same web/native branch as the rest of this
// file.
export function confirmDeletePhoto() {
  const message = "Delete this photo? This removes it entirely, including from any comparisons or check-in history. This can't be undone.";
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this photo?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Shared by the master check-in/questionnaire templates and per-client
// question editors (components/nutrition/QuestionListEditor.js) — deleting
// a master template question affects every future client copied from it,
// so this needed a real confirm rather than an instant "Remove" tap.
export function confirmRemoveQuestion(text) {
  const message = `Remove "${text}"? This can't be undone.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Remove this question?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Remove", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}
