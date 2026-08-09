import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kova_show_last_time";

// Device-local display preference for the per-set "Last: 8 reps @ 135"
// history pills on the logging cards — defaults ON (the whole point of the
// lift-tracking pass is seeing last time's numbers without asking), tap
// "Hide" to turn off, sticks across exercises/sessions. Same shape as
// lib/messageBubblePref.js: module-level cache + pub-sub so every mounted
// ExerciseCard stays in sync without a Context provider.
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

export function useShowLastTime() {
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

export async function setShowLastTime(value) {
  cached = value;
  loaded = true;
  listeners.forEach((listener) => listener(value));
  try {
    await AsyncStorage.setItem(KEY, value ? "true" : "false");
  } catch (err) {
    console.error("Failed to persist last-time preference:", err);
  }
}
