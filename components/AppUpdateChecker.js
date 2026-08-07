import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, colors } from "../lib/theme";

// Web-only — a Vercel deploy doesn't touch an already-open tab's in-memory
// JS at all, and this app has no service worker to notice a new deployment
// on its own. Without this, "signed out after I push" reports were really
// just a stale tab silently running yesterday's bundle. Polls the live
// index.html for its current script src (always accurate to what's really
// deployed, regardless of any HTTP caching) and compares it to what this
// tab actually loaded.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function extractScriptSrc(html) {
  return html.match(/<script[^>]+src="([^"]+)"/)?.[1] ?? null;
}

export function AppUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const insets = useSafeAreaInsets();
  const updateAvailableRef = useRef(false);
  const currentSrcRef = useRef(null);

  useEffect(() => {
    updateAvailableRef.current = updateAvailable;
  }, [updateAvailable]);

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
        const latestSrc = extractScriptSrc(await res.text());
        if (!latestSrc || latestSrc === currentSrcRef.current) return;

        // Nobody's looking at this tab right now — swap to the new version
        // immediately instead of leaving a banner unread indefinitely.
        if (document.visibilityState === "hidden") {
          window.location.reload();
        } else {
          setUpdateAvailable(true);
        }
      } catch {
        // Offline / transient network blip — just try again next interval,
        // never treated as "no update available."
      }
    };

    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // A banner shown while active but never tapped shouldn't sit stale
        // forever — apply it the moment the tab is backgrounded.
        if (updateAvailableRef.current) window.location.reload();
      } else {
        checkForUpdate();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (Platform.OS !== "web" || !updateAvailable) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => {}}>
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: "#3d3835",
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: "white", fontFamily: fonts.sansMedium, fontSize: 13, flex: 1, marginRight: 12 }}>
            A new version of Kova is available.
          </Text>
          <Pressable
            onPress={() => window.location.reload()}
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
          >
            <Text style={{ color: "white", fontFamily: fonts.sansSemiBold, fontSize: 13 }}>Refresh</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
