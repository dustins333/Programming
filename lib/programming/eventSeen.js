import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "kova_seen_event_ids";

// Which live events this member has already opened — the only thing behind
// the Events tab's badge.
//
// Device-local (AsyncStorage), deliberately, rather than a table alongside
// announcement_acknowledgments: this is a nudge, not a record. Nothing reads
// it back on the coach side, an event is short-lived (it hides itself when
// closed), and the worst case of a cleared browser store is one extra badge
// on an event she already saw. Same reasoning and same small pub-sub shape
// as messageBubblePref.js — the tab bar (app/(member)/_layout.js) and the
// Events screen are mounted separately, so the badge has to clear the
// instant she opens the tab without threading state between them.
let cached = new Set();
let loaded = false;
const listeners = new Set();

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cached = new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    cached = new Set();
  }
  loaded = true;
}

async function persist() {
  listeners.forEach((listener) => listener(new Set(cached)));
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...cached]));
  } catch (err) {
    console.error("Failed to persist seen events:", err);
  }
}

// Every mutator loads first. Without that, a write landing before the read
// completes would start from an empty set and wipe what was already stored.

// Everything currently live has now been seen. Replace rather than union, so
// the set prunes itself as events close — the caller (the Events screen)
// always passes this member's complete live list.
export async function markAllEventsSeen(liveIds) {
  await ensureLoaded();
  cached = new Set(liveIds);
  await persist();
}

// One event opened directly — a push deep link into events/[eventId] never
// touches the list screen, so without this the badge would survive her
// having read the very thing it was pointing at.
export async function markEventSeen(eventId) {
  await ensureLoaded();
  if (cached.has(eventId)) return;
  cached.add(eventId);
  await persist();
}

// null while storage is still being read — deliberately distinct from an
// empty set, so a caller can tell "nothing seen yet" from "don't know yet"
// and avoid flashing a badge on every cold start.
export function useSeenEventIds() {
  const [ids, setIds] = useState(() => (loaded ? new Set(cached) : null));

  useEffect(() => {
    let mounted = true;
    ensureLoaded().then(() => {
      if (mounted) setIds(new Set(cached));
    });
    const listener = (next) => setIds(next);
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  return ids;
}
