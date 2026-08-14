import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Device-local autosave for long free-text forms (the weekly check-in and
// the onboarding questionnaire). Both used to hold their answers in plain
// component state with a single write on Submit — so closing the app,
// refreshing the PWA, or an app reload mid-form silently threw away
// everything the member had typed, with no trace on either side. A member
// reported "I filled out my check-in last night" for a check-in that had
// never reached the database; nothing was recoverable because nothing was
// ever written.
//
// Deliberately device-local (AsyncStorage → localStorage on web) rather
// than a `programming.checkin_drafts` table: it covers the failure modes
// that actually happen (same device, app reloaded / closed / signed out),
// needs no migration against the live project, and can't fail on a flaky
// network right when someone is mid-sentence. The tradeoff it does NOT
// cover is starting on a phone and finishing on a laptop — see the
// clearDraft/key shape below, which a server-backed version could reuse
// as-is if that's ever wanted.
const PREFIX = "kova_draft_v1:";
const SAVE_DEBOUNCE_MS = 600;
// An unsubmitted check-in draft is useless once its filing week lapses,
// so nothing here needs to outlive a month. Bounds how long a member's
// typed answers sit in device storage.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function hasContent(values) {
  return Object.values(values || {}).some((v) => typeof v === "string" && v.trim().length > 0);
}

function storageKey(key) {
  return PREFIX + key;
}

async function writeDraft(key, values) {
  try {
    await AsyncStorage.setItem(storageKey(key), JSON.stringify({ savedAt: Date.now(), values }));
    return true;
  } catch (err) {
    console.error("Failed to save form draft:", err);
    return false;
  }
}

// Drafts are keyed per user+form+week, so a member who never submits one
// leaves a key behind forever. Swept once per app session rather than on a
// schedule — this is a handful of small keys, not something worth a timer.
let pruned = false;
async function pruneExpiredDrafts() {
  if (pruned) return;
  pruned = true;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    const stale = [];
    for (const k of keys) {
      try {
        const parsed = JSON.parse((await AsyncStorage.getItem(k)) ?? "null");
        if (!parsed || Date.now() - (parsed.savedAt ?? 0) >= MAX_AGE_MS) stale.push(k);
      } catch {
        stale.push(k); // unparseable — no value in keeping it
      }
    }
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
  } catch (err) {
    console.error("Failed to prune old form drafts:", err);
  }
}

/**
 * Autosaves `values` under `key`, restoring any saved draft on mount.
 *
 * @param key       stable per user+form (e.g. "<uid>:checkin:2026-08-03").
 *                  Pass null/undefined to disable — do this until the
 *                  form's questions have actually loaded, so an empty
 *                  initial state can't overwrite a real saved draft.
 * @param values    the current answers map ({ [questionId]: string }).
 * @param onRestore called with the saved map when a draft is recovered;
 *                  the caller merges it into its own state.
 * @param enabled   false once the form is submitted, so a stale draft can
 *                  never be restored over a real submitted response.
 */
export function useFormDraft({ key, values, onRestore, enabled = true }) {
  const [restored, setRestored] = useState(false);
  const [saved, setSaved] = useState(false);
  // State, not a ref: the save effect below has to re-run once loading
  // finishes, or a member who types exactly once while the read is still
  // in flight gets that keystroke dropped.
  const [loadedKey, setLoadedKey] = useState(null);

  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  // Holds the not-yet-written debounced value so it can be flushed if the
  // form goes away before the timer fires — which is exactly the case this
  // whole module exists to stop losing.
  const pendingRef = useRef(null);

  const active = Boolean(enabled && key);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setRestored(false);
    setSaved(false);
    setLoadedKey(null);

    (async () => {
      pruneExpiredDrafts();
      let draft = null;
      try {
        const raw = await AsyncStorage.getItem(storageKey(key));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.values && typeof parsed.values === "object" && Date.now() - (parsed.savedAt ?? 0) < MAX_AGE_MS) {
            draft = parsed.values;
          }
        }
      } catch (err) {
        console.error("Failed to read form draft:", err);
      }
      if (cancelled) return;

      // Only restore into a genuinely untouched form — if the member
      // started typing while the read was in flight, their live input wins.
      if (draft && hasContent(draft) && !hasContent(valuesRef.current)) {
        onRestoreRef.current?.(draft);
        setRestored(true);
      }
      setLoadedKey(key);
    })();

    return () => {
      cancelled = true;
    };
  }, [key, active]);

  useEffect(() => {
    if (!active || loadedKey !== key) return;
    if (!hasContent(values)) return;
    pendingRef.current = { key, values };
    const timer = setTimeout(async () => {
      const ok = await writeDraft(key, values);
      pendingRef.current = null;
      if (ok) setSaved(true);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, values, active, loadedKey]);

  // Unmount flush — the debounce above cancels its timer on every change
  // (that's what makes it a debounce), so without this the last edit before
  // the form closes would be the one edit that never got written.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (pending) writeDraft(pending.key, pending.values);
      pendingRef.current = null;
    };
  }, []);

  // A hard browser refresh (the PWA's own reported failure mode) tears the
  // page down without running React cleanup, so the unmount flush above
  // never fires. pagehide does. Native has no equivalent and doesn't need
  // one — backgrounding an app doesn't unmount it.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const flush = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      try {
        // Synchronous on purpose: AsyncStorage's web driver is async over
        // localStorage, and an awaited write loses the race with teardown.
        window.localStorage.setItem(storageKey(pending.key), JSON.stringify({ savedAt: Date.now(), values: pending.values }));
      } catch (err) {
        console.error("Failed to flush form draft on page hide:", err);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const clearDraft = useCallback(async () => {
    pendingRef.current = null;
    if (!key) return;
    try {
      await AsyncStorage.removeItem(storageKey(key));
    } catch (err) {
      console.error("Failed to clear form draft:", err);
    }
  }, [key]);

  return { restored, saved, clearDraft };
}
