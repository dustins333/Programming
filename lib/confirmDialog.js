import { Platform, Alert } from "react-native";

// Shared by Group Programs' and SPC's copy-mode flows — both need to warn
// before a plain content copy silently overwrites a non-empty target tile.
// web has no native confirm() equivalent through RN's Alert API, so this
// branches to the real browser dialog there and Alert.alert everywhere else.
// Bulk publish makes every listed session instantly member-visible (member
// RLS gates on status = 'published'), so the count is part of the message.
export function confirmBulkPublish(count) {
  const message = `Publish ${count} draft session${count === 1 ? "" : "s"}? They'll be visible to members immediately.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Publish drafts?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Publish", onPress: () => resolve(true) },
    ]);
  });
}

// "Clear lifts" from the Group Programs grid's bulk bar — empties the
// selected sessions of every lift AND warm-up, with no undo, so the count
// and the word "empty" both go in the message.
export function confirmClearLifts(count) {
  const message = `Empty ${count} session${count === 1 ? "" : "s"}? Every lift and warm-up in ${count === 1 ? "it" : "them"} is deleted, and this can't be undone.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Clear these sessions?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Clear", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Merging two library entries. Names both sides and what actually moves —
// direction is the thing a coach can get wrong here, and the retired entry
// keeps existing (archived), which is why this says "retired" not "deleted".
export function confirmMergeExercises(retireName, keepName, retireUses) {
  const moving = retireUses === 0 ? "nothing is logged against it yet" : `${retireUses} reference${retireUses === 1 ? "" : "s"} move across`;
  const message = `Merge "${retireName}" into "${keepName}"? ${moving}, and "${retireName}" is retired to the archive. Nothing is deleted.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Merge these exercises?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Merge", onPress: () => resolve(true) },
    ]);
  });
}

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
// `title` is native-only (web's window.confirm has no title slot) — the
// default keeps the original block-delete wording for existing call sites.
export function confirmDelete(message, title = "Delete this block?") {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
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
    // Not styled "destructive" — nothing is discarded by closing out (see
    // bypassOnboarding); the red treatment reinforced the same wrong
    // impression the old hardcoded copy did.
    Alert.alert("Close out onboarding?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Close out", onPress: () => resolve(true) },
    ]);
  });
}

// Nutrition milestones — deleting one loses it from history entirely (no
// undo), so that still gets a real confirm. Completing/reopening one is
// freely reversible (see reopenMilestone) so those are a plain instant
// checkbox toggle now, no confirm dialog — per direct feedback that the
// popup here was unnecessary friction.
export function confirmRemovePhaseItem(text) {
  const message = `Remove "${text}"? This can't be undone.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Remove this item?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Remove", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

export function confirmDeletePhase(title) {
  const message = `Delete "${title}"? Everything listed under it goes too.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this phase?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

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

// Finalizing locks a coach's own entries for the period (admin has to
// reopen it to fix anything after) — the exact wording and button label
// below are the user's own specified copy, not a paraphrase.
// (confirmFinalizePayroll was deleted here. Its attestation copy is
// unchanged but now lives inside FinalizeModal itself — the sheet already
// names the period, restates every count and puts the amount on the button,
// so stacking a generic native confirm on top of it meant the wording you
// were agreeing to only appeared after you'd decided.)

// Every rate edit (core/SPC/other) routes through this before saving —
// rate changes are retroactive within the currently open period only
// (dollars are always computed live from current rates for an open
// period; a closed period reads its own frozen snapshot instead, see
// 0041_payroll_redesign.sql), so this is what tells the admin that up
// front rather than leaving it to be discovered later.
export function confirmRateChange(label, oldRate, newRate) {
  const message = `Change ${label} from $${Number(oldRate).toFixed(2)} to $${Number(newRate).toFixed(2)}? This will recalculate pay for every entry already logged in the current open pay period at the new rate. Entries in closed periods are never affected.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Change this rate?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Change rate", onPress: () => resolve(true) },
    ]);
  });
}

// Admin hard-close, genuinely irreversible through the app — RLS blocks
// every write to a closed period, including admin's own, once this fires.
// `warning` carries the "N coaches haven't finalized yet" text when
// relevant, so closing early is an informed override, not a silent one.
export function confirmClosePayPeriod(periodLabel, warning) {
  const message = warning
    ? `${warning}\n\nClose ${periodLabel} anyway? This is permanent — nobody, including admins, can edit this period again after it's closed.`
    : `Close ${periodLabel}? This is permanent — nobody, including admins, can edit this period again after it's closed.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Close this pay period?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Close permanently", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Payroll's SPC sessions and Other line items are independently repeatable
// per date with no +/- counter to "delete by decrementing" — this is the
// only way to remove one, from the tile's own logged-items list.
export function confirmDeletePayrollEntry(label) {
  const message = `Delete "${label}"? This can't be undone.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this entry?", message, [
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

// Archiving an "Other" pay type hides it from the entry form. Existing pay
// entries keep their type and keep pricing correctly — this only stops it
// being picked again — but it's still a change to the money surface, and
// every neighbouring destructive action in this app confirms first.
export function confirmArchiveOtherRate(name) {
  const message = `Archive "${name}"? Coaches won't be able to log it anymore. Entries already logged with it are unaffected, and you can restore it from "Show archived".`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Archive this pay type?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Archive", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// A focus item's position is frozen into checkin_responses.focus_snapshot on
// every check-in, so deleting one is less recoverable than deleting a plan
// bullet — which already confirms. This was a single ✕ tap.
export function confirmRemoveFocusItem(text) {
  const message = `Remove "${text}" from her focus list? This can't be undone.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Remove this focus item?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Remove", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Un-enrolling fired straight off a Switch with no prompt, while every other
// destructive action on the same client page confirms.
export function confirmRemoveGroupMembership(programName) {
  const label = programName ? `"${programName}"` : "this program";
  const message = `Remove this client from ${label}? They'll lose their weekly target and drop off the program's roster. You can re-enroll them, but their session frequency resets.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Remove from program?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Remove", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// --- Events (migration 0061) ---

// Publishing an event is what makes the members' Events tab appear at all —
// there's no separate on/off switch — so the audience is named here rather
// than left to whatever was selected three fields up the form.
export function confirmPublishEvent(title, audienceLabel) {
  const message = `Publish "${title}" to ${audienceLabel}? It appears on their Events tab right away, and stays there until it closes.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Publish this event?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Publish", onPress: () => resolve(true) },
    ]);
  });
}

// The emergency brake: an event normally disappears on its own at closes_at,
// so this is the "take it down NOW" path. Says explicitly that responses
// survive, since that's the natural worry.
export function confirmUnpublishEvent(title) {
  const message = `Take "${title}" down? It disappears from every member's Events tab immediately. Anything already submitted is kept, and you can publish it again.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Take this event down?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Take down", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Unlike unpublishing, this really does destroy the responses (they cascade
// off the event row), so the count goes in the message.
export function confirmDeleteEvent(title, responseCount) {
  const responses =
    responseCount > 0
      ? ` ${responseCount} ${responseCount === 1 ? "response" : "responses"} will be deleted with it, and that can't be undone.`
      : "";
  const message = `Delete "${title}"?${responses}`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Delete this event?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

export function confirmRemoveEventItem(name) {
  const message = `Remove "${name}" from this order? Anything members already picked for it is removed too.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Remove this item?", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Remove", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

// Cancelling a sign-up / order from the member's own side.
export function confirmCancelEventResponse(title) {
  const message = `Cancel your response to "${title}"? You can respond again while it's still open.`;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Cancel your response?", message, [
      { text: "Keep it", style: "cancel", onPress: () => resolve(false) },
      { text: "Cancel it", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}
