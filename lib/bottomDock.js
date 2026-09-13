import { useEffect, useState } from "react";

// Height of a bar pinned to the bottom of a member screen (today: the event
// order bar's bag + Submit), so the floating message bubble can lift itself
// above it instead of sitting on top of the button. Module-level pub-sub, the
// same small shape as messageBubblePref.js: the bubble is mounted in the
// member layout and the bar deep inside a tab, with nothing in between.
let height = 0;
const listeners = new Set();

export function setBottomDockHeight(next) {
  const value = Math.max(0, Math.round(Number(next) || 0));
  if (value === height) return;
  height = value;
  listeners.forEach((listener) => listener(value));
}

export function useBottomDockHeight() {
  const [value, setValue] = useState(height);
  useEffect(() => {
    listeners.add(setValue);
    setValue(height);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}
