import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kova_spc_notes_open";

// Whether the SPC client page's Notes row sits open. Device-local by design
// — a display preference, not data, so it needs no column and resets
// harmlessly on a new device.
//
// Pub-sub rather than local state inside each row, for a reason specific to
// this page: the same thread is mounted twice (the foot of Overview's CURRENT
// PROGRAM card, and the Sessions tab's Current program column). Opening it in
// one and finding it shut in the other reads as two different features, which
// is the exact confusion this pass exists to undo.
//
// Default closed, matching the design. A coach who lives in the notes opens
// it once and it stays open across loads.
let cached = false;
let loaded = false;
const listeners = new Set();

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw === "true";
  } catch {
    cached = false;
  }
  loaded = true;
}

export function useSpcNotesOpen() {
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

export async function setSpcNotesOpen(value) {
  cached = value;
  loaded = true;
  listeners.forEach((listener) => listener(value));
  try {
    await AsyncStorage.setItem(KEY, value ? "true" : "false");
  } catch (err) {
    console.error("Failed to persist SPC notes preference:", err);
  }
}
