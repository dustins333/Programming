import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// A member's order bag that she hasn't sent yet, per event.
//
// Device-local (AsyncStorage, localStorage on web), same reasoning as
// eventSeen.js and formDraft.js: the failure it covers is leaving the page,
// the app reloading or the PWA being closed mid-order, all on the same
// device. A bag is only ever stored while it DIFFERS from what she last
// submitted, so an entry here means exactly "unsent", which is what the
// Events tab's dot reads.
//
// One key holding every bag rather than a key per event, so the tab bar can
// learn "which events have an unsent bag" from a single read.
const KEY = "kova_event_bags_v1";
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

let cached = {};
let loaded = false;
let loading = null;
const listeners = new Set();

const bagKey = (userId, eventId) => `${userId}:${eventId}`;

function ensureLoaded() {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        cached = {};
        for (const [k, v] of Object.entries(parsed && typeof parsed === "object" ? parsed : {})) {
          if (v?.quantities && now - (v.savedAt ?? 0) < MAX_AGE_MS) cached[k] = v;
        }
      } catch {
        cached = {};
      }
      loaded = true;
    })();
  }
  return loading;
}

async function persist() {
  listeners.forEach((listener) => listener({ ...cached }));
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cached));
  } catch (err) {
    console.error("Failed to save event bag:", err);
  }
}

// Only lines with a quantity count; key order doesn't.
export function normalizeBag(quantities) {
  return Object.fromEntries(
    Object.entries(quantities ?? {})
      .filter(([, qty]) => Number(qty) > 0)
      .map(([k, qty]) => [k, Number(qty)])
  );
}

export function sameBag(a, b) {
  const na = normalizeBag(a);
  const nb = normalizeBag(b);
  const keys = Object.keys(na);
  return keys.length === Object.keys(nb).length && keys.every((k) => na[k] === nb[k]);
}

export async function readBag(userId, eventId) {
  if (!userId || !eventId) return null;
  await ensureLoaded();
  return cached[bagKey(userId, eventId)]?.quantities ?? null;
}

export async function saveBag(userId, eventId, quantities) {
  if (!userId || !eventId) return;
  await ensureLoaded();
  cached[bagKey(userId, eventId)] = { quantities: normalizeBag(quantities), savedAt: Date.now() };
  await persist();
}

export async function clearBag(userId, eventId) {
  if (!userId || !eventId) return;
  await ensureLoaded();
  const key = bagKey(userId, eventId);
  if (!(key in cached)) return;
  delete cached[key];
  await persist();
}

// Event ids with an unsent bag for this member. null while storage is still
// being read, so the tab bar can't flash a dot on every cold start.
export function useUnsentBagEventIds(userId) {
  const [bags, setBags] = useState(() => (loaded ? { ...cached } : null));

  useEffect(() => {
    let mounted = true;
    ensureLoaded().then(() => {
      if (mounted) setBags({ ...cached });
    });
    const listener = (next) => setBags(next);
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  if (!bags || !userId) return null;
  const prefix = `${userId}:`;
  return new Set(Object.keys(bags).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
}
