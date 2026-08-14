import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { PassThroughOverlay } from "./PassThroughOverlay";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

function extractScriptSrc(html) {
  return html.match(/<script[^>]+src="([^"]+)"/)?.[1] ?? null;
}

export function AppUpdateChecker() {
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
    currentSrcRef.current = document.querySelector("script[src]")?.getAttribute("src") ?? null;
    if (!currentSrcRef.current) return;

    const checkForUpdate = async () => {
      try {
        const res = await fetch("/", { cache: "no-store" });
        const src = extractScriptSrc(await res.text());
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

  const handleDismiss = useCallback(() => {
    if (latestSrc) dismissedRef.current.add(latestSrc);
    setLatestSrc(null);
  }, [latestSrc]);

  if (Platform.OS !== "web" || !latestSrc) return null;

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
            onPress={() => window.location.reload()}
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
