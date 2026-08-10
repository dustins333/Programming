import { useEffect, useState } from "react";

// Lets whichever field currently has focus contribute an extra action to the
// floating keyboard bar (components/KeyboardDoneButton.js).
//
// The bar is mounted once at the app root and has no idea which input is
// focused, so this is a tiny module-level store rather than context: a field
// registers on focus and clears on blur, and the bar subscribes. That's what
// keeps the Calculator scoped to weight fields inside a live logging session
// (design_handoff_member_mobile_v5, 1d: "the Calculator item appears only on
// weight fields in the logger — never on nutrition") without every screen
// having to thread a prop down to the root.
//
// Registration is keyed by an opaque token so a late blur from a field that
// already lost focus can't wipe the action the newly-focused field just set
// — a real ordering hazard, since focusing a sibling input fires the new
// field's onFocus before the old field's onBlur on both platforms.
let current = null; // { key, label, icon, onPress }
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener(current);
}

export function setAccessoryAction(action) {
  current = action;
  emit();
}

export function clearAccessoryAction(key) {
  if (current?.key !== key) return;
  current = null;
  emit();
}

export function useAccessoryAction() {
  const [action, setAction] = useState(current);
  useEffect(() => {
    listeners.add(setAction);
    setAction(current);
    return () => listeners.delete(setAction);
  }, []);
  return action;
}
