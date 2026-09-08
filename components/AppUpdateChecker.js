import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { PassThroughOverlay } from "./PassThroughOverlay";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/AuthProvider";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../lib/theme";

// Web-only — a Vercel deploy doesn't touch an already-open tab's in-memory
// JS at all, and this app has no service worker to notice a new deployment
// on its own. Without this, "signed out after I push" reports were really
// just a stale tab silently running yesterday's bundle. Polls the live
// index.html for its current script src (always accurate to what's really
// deployed, regardless of any HTTP caching) and compares it to what this
// tab actually loaded.
//
// Deliberately NOT naggy, after a direct report that it "constantly asks
// for a refresh" — during an active push-several-times-a-day stretch every
// one of those prompts is a *true* positive, which is exactly why it needs
// to be quiet rather than more accurate:
//   - dismissing (×) suppresses that specific version for good in this tab,
//     so returning to the tab doesn't re-raise the same prompt;
//   - it never reloads the page on its own. The old version force-reloaded
//     whenever the tab was backgrounded with a banner up, which meant
//     coming back to a page that had silently thrown away whatever was
//     half-typed into it.
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// The gym-floor wall display is the one place the "quiet, never self-reload"
// stance above is wrong: there is nobody standing at it to tap Refresh, so
// the pill would sit on the wall indefinitely while the board quietly ran an
// old bundle. It reloads itself instead — but never the instant an update
// lands. The hub's set entry autosaves on a 700ms debounce, so a reload
// mid-set would both drop an in-flight keystroke and visibly blink the board
// in front of clients. Wait for a screen nobody has touched.
const DISPLAY_IDLE_MS = 60 * 1000;
const DISPLAY_IDLE_POLL_MS = 5 * 1000;

// Match the app's OWN bundle explicitly, on both sides of the comparison.
// The entry tag is the very last element in <body>, so a plain
// document.querySelector("script[src]") returns whatever *anything else* put
// on the page first — a Chrome extension injecting into <head>, say, which
// happens inside an installed PWA window too. That src can never equal a
// deployed filename, so the pill came back after every single refresh, for
// good. If Expo ever moves this path both sides stop matching, the effect
// below bails, and the checker quietly does nothing — which is the right way
// for it to fail.
const ENTRY_SELECTOR = 'script[src*="/_expo/static/js/"][src*="entry-"]';
const ENTRY_RE = /<script[^>]+src="([^"]*\/_expo\/static\/js\/[^"]*entry-[^"]*)"/;

function extractEntrySrc(html) {
  return html.match(ENTRY_RE)?.[1] ?? null;
}

// Survives exactly one reload, so we can tell "the refresh worked" from "the
// refresh landed us right back where we were". Anything that makes those two
// versions permanently disagree would otherwise nag forever, and the same
// guard stops the wall display auto-reloading in a loop.
const RELOAD_MARKER_KEY = "kova:update-reload-target";

function readReloadMarker() {
  try {
    return window.sessionStorage.getItem(RELOAD_MARKER_KEY);
  } catch {
    return null;
  }
}

function clearReloadMarker() {
  try {
    window.sessionStorage.removeItem(RELOAD_MARKER_KEY);
  } catch {
    // Private window / storage blocked. Worst case is one extra prompt.
  }
}

function reloadForUpdate(src) {
  try {
    if (src) window.sessionStorage.setItem(RELOAD_MARKER_KEY, src);
  } catch {
    // As above — reload anyway, the marker is only a safety net.
  }
  window.location.reload();
}

export function AppUpdateChecker() {
  const { profile } = useAuth();
  const isDisplay = Boolean(profile?.is_gym_display);
  const [latestSrc, setLatestSrc] = useState(null);
  const insets = useSafeAreaInsets();
  const currentSrcRef = useRef(null);
  // Versions the coach has already waved off in this tab. Keyed by script
  // src (i.e. by deploy), so a *newer* deploy still gets to prompt once.
  const dismissedRef = useRef(new Set());

  useEffect(() => {
    if (Platform.OS !== "web") return;
    // getAttribute, not the .src property — .src resolves to an absolute
    // URL while the regex below reads the raw attribute out of fetched HTML
    // text, and those two forms never string-equal each other even when
    // nothing has changed (root-relative vs. absolute-with-origin).
    currentSrcRef.current = document.querySelector(ENTRY_SELECTOR)?.getAttribute("src") ?? null;
    if (!currentSrcRef.current) return;

    // Did the last Refresh actually get us onto the version it promised? If
    // not, tapping it again would land in exactly the same place, so retire
    // that version rather than asking a second time.
    const reloadedFor = readReloadMarker();
    clearReloadMarker();
    if (reloadedFor && reloadedFor !== currentSrcRef.current) {
      dismissedRef.current.add(reloadedFor);
    }

    const checkForUpdate = async () => {
      try {
        const res = await fetch("/", { cache: "no-store" });
        const src = extractEntrySrc(await res.text());
        if (!src || src === currentSrcRef.current || dismissedRef.current.has(src)) return;
        setLatestSrc(src);
      } catch {
        // Offline / transient network blip — just try again next interval,
        // never treated as "no update available."
      }
    };

    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Display only. Armed once an update is detected, then reloads as soon as
  // the screen has gone quiet — so a coach mid-session is never interrupted,
  // and a board sitting idle on the rack picks the new build up within a
  // minute. Date.now() here measures elapsed time, not a calendar day, so
  // the todayInBoise rule deliberately doesn't apply.
  useEffect(() => {
    if (Platform.OS !== "web" || !isDisplay || !latestSrc) return;
    let lastTouched = Date.now();
    const bump = () => {
      lastTouched = Date.now();
    };
    const events = ["pointerdown", "touchstart", "keydown", "wheel"];
    events.forEach((name) => window.addEventListener(name, bump, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastTouched >= DISPLAY_IDLE_MS) reloadForUpdate(latestSrc);
    }, DISPLAY_IDLE_POLL_MS);
    return () => {
      clearInterval(interval);
      events.forEach((name) => window.removeEventListener(name, bump));
    };
  }, [isDisplay, latestSrc]);

  const handleDismiss = useCallback(() => {
    if (latestSrc) dismissedRef.current.add(latestSrc);
    setLatestSrc(null);
  }, [latestSrc]);

  if (Platform.OS !== "web" || !latestSrc || isDisplay) return null;

  return (
    // PassThroughOverlay, not a Modal: this pill sits there until it's
    // dismissed, and as a Modal it made the whole app under it untouchable
    // the entire time (see PassThroughOverlay.web.js).
    <PassThroughOverlay onRequestClose={handleDismiss}>
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end", alignItems: "center" }}>
        <View
          style={{
            backgroundColor: "#3d3835",
            borderRadius: 999,
            paddingVertical: 8,
            paddingLeft: 16,
            paddingRight: 8,
            marginBottom: insets.bottom + 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            maxWidth: "92%",
            shadowColor: "#44403c",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Text style={{ color: "white", fontFamily: fonts.sansMedium, fontSize: 13 }}>New version available</Text>
          <Pressable
            onPress={() => reloadForUpdate(latestSrc)}
            style={{ backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}
          >
            <Text style={{ color: "white", fontFamily: fonts.sansSemiBold, fontSize: 13 }}>Refresh</Text>
          </Pressable>
          <Pressable
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
            accessibilityLabel="Dismiss update notice"
            style={{ paddingHorizontal: 4 }}
          >
            <Ionicons name="close" size={17} color="#a8a29e" />
          </Pressable>
        </View>
      </View>
    </PassThroughOverlay>
  );
}
